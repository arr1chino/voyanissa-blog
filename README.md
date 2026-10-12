# 沃雅妮莎的个人空间

个人博客 / 作品集网站。

- 线上地址：https://arr1chino.github.io
- 作者：大碗螺蛳粉

## 这是什么

用 Hexo 搭的静态博客，主题是 Butterfly，并在此基础上做了大量自定义：

- **首页 3D 角色**：Three.js 加载原神「沃雅妮莎」模型，滚动切换五个分镜视角，鼠标移动带动眼球与镜头微移。
- **流光海洋蓝背景**：贯穿整站的动态渐变背景，博客区是一张白色圆角标签页浮在上面。
- **博客三栏布局**：左列资料卡 / 友情链接 / 本月日程 / 和沃聊天，中间是文章列表，右列是天气 / 每日一言 / 网易云三首 / 关于这里。
- **和沃聊天**：独立页面，接 Cloudflare Worker + DeepSeek 模型，让访客和「沃雅妮莎」对话。
- **其它小东西**：农历节假日日历、明暗主题切换、回到顶部、加载动画。

## 目录结构

```
_config.yml           站点配置（标题、网址、主题、部署方式）
source/_posts/        文章，一篇一个 .md 文件
source/index.md       首页
source/css/           自定义样式
source/js/            自定义脚本
source/js/hero/       角色动画、镜头取景、分镜配置与设备画质
source/img/           图片、头像、加载动画视频
source/vendor/        Three.js 运行时
source/assets/        3D 模型（.glb）
themes/butterfly/     主题（含自定义的首页布局 hero.pug）
scaffolds/            新建文章的模板
```

## 本地预览

需要先装 Node.js（18 以上），然后在项目目录里执行：

```bash
npm install      # 第一次跑，下载依赖
npm run server   # 启动本地预览，默认 http://localhost:4000
```

## 发布

```bash
npm run build    # 生成静态网页到 public/
npm run deploy   # 推送到 GitHub Pages
```

## 首页渲染维护

`source/js/hero.js` 负责加载与渲染调度，`source/js/hero/` 中的模块分别管理角色动画、镜头取景、分镜参数和设备画质。固定站姿只初始化一次；眼球和眨眼继续更新，身体骨骼的世界矩阵跟随整体旋转。调整手势或镜头时修改 `config.js`，调整像素预算时修改 `quality.js`。

交互期间最多渲染 60 帧／秒，静止时最多 30 帧／秒；角色淡出到博客区域后停止 WebGL 绘制，隐藏页面时暂停循环，返回页面时恢复。手机使用较低像素比和模糊强度。持续交互掉帧时画质最多下调两档，避免反复切换。

执行 `npm run test:hero` 检查固定姿势缓存、表情重置、插值与画质分档。发布构建会压缩这些模块，并为入口引用附加内容版本，避免模块更新后浏览器继续使用旧缓存。

## 说明

- 聊天功能的后端（Cloudflare Worker）单独部署，不在这个仓库里。
- 仓库中不含任何密钥。DeepSeek 的 API Key 只保存在 Cloudflare 的环境变量中，不进代码、不进仓库。
- 站点内容版权归作者所有；Butterfly 主题遵循其原始开源协议。
