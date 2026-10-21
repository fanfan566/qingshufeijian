"""
SegMoTE 肺部分割推理引擎

封装 D:\\SegMoTE-main 中的 SegMoTE（SAM ViT-B + Token-level MoE）模型，
提供单张 2D 图像 / CT 切片的肺部分割推理。

预处理与 SegMoTE-main/test.py + data_loader.py 的测试流程保持一致：
RGB -> 最近邻缩放到 512x512 -> HWC 转 CHW -> 按 SAM 像素均值/方差归一化，
解码器输出 logits 后双线性插值回原尺寸，sigmoid > 0.5 得到二值掩码。
"""
import os
import sys
import threading
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from loguru import logger

from app.config import settings

PIXEL_MEAN = torch.tensor([123.675, 116.28, 103.53]).view(-1, 1, 1)
PIXEL_STD = torch.tensor([58.395, 57.12, 57.375]).view(-1, 1, 1)


class SegMoTEEngine:
    """SegMoTE 推理单例"""

    def __init__(self):
        self.root = Path(settings.SEGMOTE_ROOT).resolve()
        self.image_size = settings.SEGMOTE_IMAGE_SIZE
        self.prompt_mode = settings.SEGMOTE_PROMPT_MODE
        self.device = self._resolve_device(settings.SEGMOTE_DEVICE)
        self.model = None
        self.load_error: Optional[str] = None
        self._lock = threading.Lock()

    @staticmethod
    def _resolve_device(name: str) -> torch.device:
        if name == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(name)

    @property
    def available(self) -> bool:
        return self.model is not None

    def info(self) -> Dict:
        return {
            "name": "SegMoTE",
            "backbone": "SAM ViT-B + Token-level Mixture of Experts",
            "root": str(self.root),
            "device": str(self.device),
            "image_size": self.image_size,
            "prompt_mode": self.prompt_mode,
            "loaded": self.available,
            "load_error": self.load_error,
        }

    def load(self) -> bool:
        """加载 SegMoTE 权重（sam_b.pth 初始化 + segmote.pth 微调权重）"""
        if self.model is not None:
            return True

        with self._lock:
            if self.model is not None:
                return True
            try:
                self.model = self._build()
                self.load_error = None
            except Exception as exc:
                self.model = None
                self.load_error = f"{type(exc).__name__}: {exc}"
                logger.exception(f"❌ SegMoTE 模型加载失败：{self.load_error}")
        return self.model is not None

    def _build(self):
        sam_ckpt = self.root / "checkpoints" / "sam_b.pth"
        segmote_ckpt = self.root / "checkpoints" / "segmote.pth"
        category_weights = self.root / "dataloaders" / "categories_weight.pkl"
        for path in (sam_ckpt, segmote_ckpt, category_weights):
            if not path.exists():
                raise FileNotFoundError(f"缺少 SegMoTE 文件：{path}")

        # SegMoTE 仓库不是可安装包，需要把仓库根目录加入 sys.path
        if str(self.root) not in sys.path:
            sys.path.insert(0, str(self.root))
        from segment_anything import sam_model_registry
        from model import SegMoTE
        from checkpoint_utils import upgrade_legacy_state_dict

        logger.info(f"🧠 正在加载 SegMoTE（{self.root}，设备 {self.device}）...")

        class _Args:
            image_size = self.image_size
            sam_checkpoint = str(sam_ckpt)

        # 优先使用本地 CLIP tokenizer 目录，避免运行时依赖 HuggingFace 网络
        local_tokenizer = self.root / "checkpoints" / "clip-vit-base-patch32"
        tokenizer_name = str(local_tokenizer) if local_tokenizer.exists() else settings.SEGMOTE_TEXT_TOKENIZER

        sam = sam_model_registry["vit_b"](_Args()).to(self.device)
        model = SegMoTE(
            sam,
            test_mode=True,
            category_weights=str(category_weights),
            text_tokenizer_name=tokenizer_name,
        ).to(self.device)

        ckpt = torch.load(str(segmote_ckpt), map_location=self.device)
        state_dict = upgrade_legacy_state_dict(ckpt.get("model_state_dict", ckpt))
        state_dict = self._align_text_model_keys(state_dict, model.state_dict().keys())
        missing, unexpected = model.load_state_dict(state_dict, strict=False)
        if missing or unexpected:
            logger.warning(f"⚠️ SegMoTE 权重键不匹配：missing={missing[:5]}, unexpected={unexpected[:5]}")
        logger.info(f"✅ SegMoTE 权重加载完成（missing={len(missing)}, unexpected={len(unexpected)}）")

        model.eval()
        return model

    @staticmethod
    def _align_text_model_keys(state_dict, model_keys):
        """
        checkpoint 由 transformers 4.x 保存，CLIPTextModel 参数位于 text_model.text_model.*；
        transformers 5.x 去掉了内层 text_model，参数位于 text_model.*。按当前模型结构对齐键名，
        否则 CLIP 文本编码器保持随机初始化，文本提示分割会失效。
        """
        model_keys = set(model_keys)
        nested, flat = "text_model.text_model.", "text_model."
        aligned = {}
        for key, value in state_dict.items():
            if key not in model_keys:
                if key.startswith(nested) and flat + key[len(nested):] in model_keys:
                    key = flat + key[len(nested):]
                elif key.startswith(flat) and nested + key[len(flat):] in model_keys:
                    key = nested + key[len(flat):]
            aligned[key] = value
        return aligned

    def _preprocess(self, image: np.ndarray) -> torch.Tensor:
        if image.ndim == 2:
            image = np.stack([image] * 3, axis=-1)
        elif image.shape[2] == 4:
            image = image[:, :, :3]
        image = image.astype(np.uint8)

        resized = Image.fromarray(image).resize((self.image_size, self.image_size), Image.NEAREST)
        tensor = torch.from_numpy(np.array(resized)).permute(2, 0, 1).float()
        tensor = (tensor - PIXEL_MEAN) / PIXEL_STD
        return tensor.unsqueeze(0).to(self.device)

    @torch.no_grad()
    def segment(self, image: np.ndarray, targets: Optional[List[str]] = None) -> Dict:
        """
        对单张图像做分割

        Args:
            image: HxW 灰度或 HxWx3 RGB 的 uint8 图像
            targets: SegMoTE 类别名（见 categories_weight.pkl），默认 ["lung"]

        Returns:
            {
              "mask": HxW uint8 二值掩码（所有 target 的并集）,
              "probability": HxW float32 前景概率,
              "targets": {name: {"mask", "probability", "iou_pred"}},
              "prompt_mode": 实际使用的提示模式,
            }
        """
        if not self.load():
            raise RuntimeError(f"SegMoTE 模型不可用：{self.load_error}")

        targets = targets or ["lung"]
        h, w = image.shape[:2]

        with self._lock:
            model = self.model
            images = self._preprocess(image)
            image_embedding, interm_embeddings = model.image_forward(images)

            per_target = {}
            for name in targets:
                if self.prompt_mode == "text":
                    # 文本提示：sz_cxr 胸片肺分割上 Dice 0.945（results/stage2）
                    prompts = {"text_inputs": model.process_text_prompt([name])["text_inputs"]}
                else:
                    # 无提示模式：与官方 stage2 评测中 sz_cxr 的 "none" 设置一致（Dice 0.904）
                    prompts = {}

                outputs, _, _ = model.forward_decoder(
                    image_embedding,
                    prompts,
                    interm_embeddings=interm_embeddings,
                    test_mode=True,
                )
                logits = F.interpolate(outputs["masks"], (h, w), mode="bilinear", align_corners=False)
                prob = torch.sigmoid(logits)[0, 0].float().cpu().numpy()
                per_target[name] = {
                    "mask": (prob > 0.5).astype(np.uint8),
                    "probability": prob,
                    "iou_pred": float(outputs["iou_pred"].max().item()),
                }

        union_mask = np.zeros((h, w), dtype=np.uint8)
        union_prob = np.zeros((h, w), dtype=np.float32)
        for item in per_target.values():
            union_mask |= item["mask"]
            union_prob = np.maximum(union_prob, item["probability"])

        return {
            "mask": union_mask,
            "probability": union_prob,
            "targets": per_target,
            "prompt_mode": self.prompt_mode,
        }


def summarize_confidence(result: Dict) -> Dict:
    """根据模型输出概率与 IoU 预测头给出真实的模型置信度"""
    mask = result["mask"] > 0
    prob = result["probability"]
    if not np.any(mask):
        return {"mean_foreground_probability": 0.0, "iou_pred": 0.0, "model_confidence": 0.0}

    mean_fg_prob = float(prob[mask].mean())
    iou_preds = [item["iou_pred"] for item in result["targets"].values()]
    iou_pred = float(np.clip(np.mean(iou_preds), 0.0, 1.0))
    return {
        "mean_foreground_probability": round(mean_fg_prob, 4),
        "iou_pred": round(iou_pred, 4),
        "model_confidence": round(mean_fg_prob * 0.5 + iou_pred * 0.5, 4),
    }


_engine: Optional[SegMoTEEngine] = None


def get_segmote_engine() -> SegMoTEEngine:
    global _engine
    if _engine is None:
        if settings.SEGMOTE_HF_ENDPOINT and not os.environ.get("HF_ENDPOINT"):
            os.environ["HF_ENDPOINT"] = settings.SEGMOTE_HF_ENDPOINT
        _engine = SegMoTEEngine()
    return _engine
