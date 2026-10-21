本文件夹作用：
本文件夹为“肺管家（Lang-L）”项目根目录，存放前端应用、Node 服务端、医学图像分析后端、爬虫模块、数据目录、公共资源、构建配置、启动脚本以及项目总说明文档，是整个项目的总入口与资源汇总位置。

本文件夹内主要文件说明：
1. README.md
   项目总说明文档，介绍系统定位、主要功能、运行方式与技术栈。

2. 开发文档.md
   项目开发相关说明文档，用于记录开发设计、实现思路或维护说明。

3. 作品信息概要表.txt
   项目作品信息概要说明文件，用于记录作品层面的基础信息。

4. package.json
   前端/Node 侧项目依赖与脚本配置文件。

5. package-lock.json
   npm 依赖锁定文件，用于保证依赖版本一致。

6. vite.config.ts
   Vite 构建与开发服务器配置文件。

7. tsconfig.json
   TypeScript 编译配置文件。

8. .env.example
   环境变量示例文件，用于说明项目所需环境配置项。

9. .gitignore
   Git 忽略规则配置文件。

10. index.html
    前端应用入口 HTML 文件。

11. server.js
    Node 服务端入口文件。

12. ecosystem.config.js
    进程管理/部署配置文件，通常用于 PM2 等运行管理场景。

13. install_dependencies.bat
    Windows 环境下的一键安装依赖脚本。

14. 一键启动.bat
    Windows 环境下的一键启动脚本。

15. picture1.jpg
    项目中使用的图片资源文件。

16. direct_test_mask.png
    与图像分割/测试相关的输出示例图片。

17. fallback_mask.png
    与图像分割/测试相关的回退结果示例图片。

18. test_mask.png
    分割测试输入或测试样例图片。

19. test_mask_output.png
    分割测试输出结果图片。

20. user_lung_mask.png
    用户肺部分割结果示例图片。

本文件夹内主要子文件夹说明：
1. src/
   前端源代码目录，存放页面、组件、服务、类型和配置等内容。

2. public/
   前端公共静态资源目录。

3. server/
   Node 服务端相关代码目录。

4. backend/
   Python/FastAPI 医学图像分析后端目录。

5. crawler/
   资讯抓取与推荐数据采集模块目录。

6. data/
   项目数据存放目录。

7. ai_models/
   AI 模型训练、推理与模型文件管理目录。
