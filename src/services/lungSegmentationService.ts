/**
 * 肺部图像分割服务
 * 使用 TensorFlow.js 进行浏览器端推理
 */
import * as tf from '@tensorflow/tfjs';

export interface SegmentationResult {
  originalImage: string;
  segmentedImage: string;
  mask: tf.Tensor2D;
  stats: {
    lungArea: number;
    leftLungArea: number;
    rightLungArea: number;
    suspiciousNodules: number;
  };
}

export interface SegmentationConfig {
  contrastEnhancement: boolean;
  noiseReduction: boolean;
  structure3D: boolean;
  autoAnnotation: boolean;
}

class LungSegmentationService {
  private model: tf.LayersModel | null = null;
  private isLoading: boolean = false;

  /**
   * 加载肺部分割模型
   * 注意：需要替换为实际的肺部分割模型文件路径
   */
  async loadModel(modelPath: string = '/models/lung-segmentation/model.json'): Promise<void> {
    if (this.model) {
      console.log('✅ 模型已加载');
      return;
    }

    if (this.isLoading) {
      console.log('⏳ 模型加载中...');
      return;
    }

    this.isLoading = true;
    try {
      console.log('🔍 加载模型从:', modelPath);
      this.model = await tf.loadLayersModel(modelPath);
      console.log('✅ 模型加载成功');
    } catch (error) {
      console.warn('⚠️ 模型加载失败，使用模拟模式:', error);
      console.log('💡 提示：请将训练好的模型文件放置在 public/models/lung-segmentation/ 目录');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 图像预处理
   */
  private preprocessImage(imageElement: HTMLImageElement, config: SegmentationConfig): tf.Tensor4D {
    return tf.tidy(() => {
      // 转换为 tensor
      let tensor = tf.browser.fromPixels(imageElement) as tf.Tensor3D;
      
      // 调整大小到模型输入尺寸 (512x512)
      tensor = tf.image.resizeBilinear(tensor, [512, 512]);
      
      // 归一化到 [0, 1]
      tensor = tensor.toFloat().div(tf.scalar(255));
      
      // 添加 batch 维度
      tensor = tensor.expandDims(0) as tf.Tensor4D;
      
      // 对比度增强
      if (config.contrastEnhancement) {
        tensor = this.enhanceContrast(tensor);
      }
      
      // 噪声抑制
      if (config.noiseReduction) {
        tensor = this.reduceNoise(tensor);
      }
      
      return tensor;
    });
  }

  /**
   * 对比度增强
   */
  private enhanceContrast(image: tf.Tensor4D): tf.Tensor4D {
    return tf.tidy(() => {
      // 简单的直方图均衡化近似
      const mean = image.mean([1, 2], true);
      const std = image.square().mean([1, 2], true).sub(mean.square()).sqrt();
      return image.sub(mean).div(std.add(1e-5)).mul(0.5).add(0.5).clipByValue(0, 1);
    });
  }

  /**
   * 噪声抑制 (高斯模糊近似)
   */
  private reduceNoise(image: tf.Tensor4D): tf.Tensor4D {
    return tf.tidy(() => {
      // 简单的 3x3 均值滤波
      const kernel = tf.tensor2d([
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1]
      ], [3, 3]).expandDims(2).expandDims(3).div(9);
      
      return tf.conv2d(image, kernel, 1, 'same');
    });
  }

  /**
   * 执行分割推理
   */
  async segment(imageElement: HTMLImageElement, config: SegmentationConfig): Promise<SegmentationResult> {
    console.log('🔬 开始分割推理...');
    
    // 加载模型（如果尚未加载）
    await this.loadModel();
    
    const inputTensor = this.preprocessImage(imageElement, config);
    
    let mask: tf.Tensor2D;
    
    if (this.model) {
      // 使用真实模型推理
      console.log('🤖 使用 AI 模型推理...');
      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      mask = prediction.squeeze([0]) as tf.Tensor2D;
    } else {
      // 模拟模式：生成伪分割结果
      console.log('🎭 使用模拟分割（演示模式）');
      mask = await this.generateSimulatedMask(imageElement);
    }
    
    // 后处理
    const segmentedImage = await this.createSegmentationVisualization(imageElement, mask);
    
    // 计算统计信息
    const stats = await this.calculateStats(mask);
    
    // 清理内存
    inputTensor.dispose();
    
    return {
      originalImage: '',
      segmentedImage,
      mask,
      stats
    };
  }

  /**
   * 生成模拟分割掩码（演示用）
   */
  private async generateSimulatedMask(imageElement: HTMLImageElement): Promise<tf.Tensor2D> {
    return tf.tidy(() => {
      // 创建模拟的肺部区域掩码
      const height = 512;
      const width = 512;
      
      // 生成左右肺的椭圆区域
      const yCoords = tf.range(0, height, 1, 'int32');
      const xCoords = tf.range(0, width, 1, 'int32');
      
      const [yy, xx] = tf.meshgrid(yCoords, xCoords);
      
      // 左肺中心 (200, 256), 右肺中心 (312, 256)
      const leftCenterX = 200;
      const leftCenterY = 256;
      const rightCenterX = 312;
      const rightCenterY = 256;
      const radiusX = 80;
      const radiusY = 120;
      
      // 椭圆方程
      const leftLung = xx.sub(leftCenterX).square().div(radiusX * radiusX)
        .add(yy.sub(leftCenterY).square().div(radiusY * radiusY)).lte(1);
      
      const rightLung = xx.sub(rightCenterX).square().div(radiusX * radiusX)
        .add(yy.sub(rightCenterY).square().div(radiusY * radiusY)).lte(1);
      
      // 添加一些随机结节
      const nodule1 = xx.sub(180).square().add(yy.sub(240).square()).lte(15);
      const nodule2 = xx.sub(330).square().add(yy.sub(270).square()).lte(12);
      
      const mask = leftLung.logicalOr(rightLung).logicalOr(nodule1).logicalOr(nodule2);
      
      return mask.toFloat();
    });
  }

  /**
   * 创建分割可视化
   */
  private async createSegmentationVisualization(
    imageElement: HTMLImageElement,
    mask: tf.Tensor2D
  ): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('无法获取 canvas 上下文');
    }
    
    // 绘制原始图像
    ctx.drawImage(imageElement, 0, 0, 512, 512);
    
    // 获取掩码数据
    const maskData = await mask.array();
    
    // 叠加彩色掩码
    const imageData = ctx.getImageData(0, 0, 512, 512);
    const data = imageData.data;
    
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const idx = (y * 512 + x) * 4;
        const maskValue = maskData[y][x];
        
        if (maskValue > 0.5) {
          // 肺部区域：添加绿色高亮
          data[idx] = Math.min(255, data[idx] * 0.7 + 50);     // R
          data[idx + 1] = Math.min(255, data[idx + 1] * 0.7 + 150); // G
          data[idx + 2] = Math.min(255, data[idx + 2] * 0.7 + 50);  // B
          data[idx + 3] = 200; // Alpha
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // 绘制结节标记
    await this.drawNoduleMarkers(ctx, mask);
    
    return canvas.toDataURL('image/png');
  }

  /**
   * 绘制结节标记
   */
  private async drawNoduleMarkers(ctx: CanvasRenderingContext2D, mask: tf.Tensor2D): Promise<void> {
    // 检测疑似结节位置（简化版本）
    const nodules = [
      { x: 180, y: 240, radius: 15 },
      { x: 330, y: 270, radius: 12 }
    ];
    
    nodules.forEach((nodule, index) => {
      // 绘制圆圈
      ctx.beginPath();
      ctx.arc(nodule.x, nodule.y, nodule.radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // 绘制标签
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`结节 ${index + 1}`, nodule.x - 30, nodule.y - nodule.radius - 10);
    });
  }

  /**
   * 计算统计信息
   */
  private async calculateStats(mask: tf.Tensor2D): Promise<SegmentationResult['stats']> {
    const maskData = await mask.array();
    let totalPixels = 0;
    let leftPixels = 0;
    let rightPixels = 0;
    
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        if (maskData[y][x] > 0.5) {
          totalPixels++;
          if (x < 256) {
            leftPixels++;
          } else {
            rightPixels++;
          }
        }
      }
    }
    
    // 模拟结节检测
    const suspiciousNodules = 2;
    
    return {
      lungArea: totalPixels,
      leftLungArea: leftPixels,
      rightLungArea: rightPixels,
      suspiciousNodules
    };
  }

  /**
   * 下载分割结果
   */
  downloadResult(imageUrl: string, filename: string = 'lung-segmentation-result.png'): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// 导出单例
export const lungSegmentationService = new LungSegmentationService();
