本文件夹作用：
本文件夹为后端 API 接口目录，主要存放医学图像分析相关的接口实现文件，包括肺部分割、结节检测、病灶识别、报告生成等接口代码，以及与接口审阅相关的说明文档。

本文件夹内文件说明：
1. __init__.py
   API 模块初始化文件。

2. segment.py
   分割接口实现文件，用于提供图像分割相关接口。

3. segment_lungmask.py
   基于 lungmask 方案的肺部分割接口实现文件。

4. segment_lungmask_full.py
   更完整的 lungmask 肺部分割接口实现文件，通常包含更完整的处理流程、校验与结果组织逻辑。

5. nodule.py
   结节检测接口实现文件。

6. lesion.py
   病灶识别或病变分析接口实现文件。

7. report.py
   报告生成接口实现文件。

8. segment_lungmask_full_review.txt
   对 segment_lungmask_full.py 的审阅说明文档，主要记录问题分析、风险点、阈值策略评估及优化建议。
