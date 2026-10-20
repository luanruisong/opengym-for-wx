# openGym 微信小程序版

> **本仓库迁移自 [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym)**（作者 Duarte Santos，AGPL-3.0）。
> 原项目是一个自托管的健身与体重记录 PWA（React 前端 + Node 后端）；本仓库把它的前端移植成了**原生微信小程序**，
> 并删除了与小程序无关的部分（后端、网页前端、部署配置、CI 等）。迁移基于上游提交
> [`e348fc17`](https://github.com/DuarteSantos8/openGym/commit/e348fc17c42c7e9a211c5972e573ad3698190ee2)（2026-10-13），
> 上游的完整提交历史保留在本仓库的 git 历史里。

## 功能

训练计划（周计划 / 轮换）、训练进行中（卡片 / 列表 / 紧凑 / 专注四种布局，超级组、休息计时、计时组、RIR/RPE）、
进阶规则与 1RM、训练历史、统计（训练量、肌群恢复、结构平衡）、体重 / 围度 / 进度照片、动作库与自定义动作、
杠铃片与哑铃计算、备份导入导出、从其他 App（CSV）和 Hevy 导入。

与原版的区别：

- **纯本地**：数据只存在手机上（`wx.setStorageSync`），没有账号、登录和服务器同步。
- **只有简体中文**。
- **不含动作图片与动画**：它们由 Gym visual 授权给 openGym，禁止在 openGym 之外使用（见 [NOTICE.md](NOTICE.md)）。
- **没有** AI 教练、推送提醒、健康数据同步；休息结束提示音只在小程序前台时响。

## 目录

```
miniprogram/        小程序本体（project.config.json 的 miniprogramRoot），只放会发布的代码
miniprogram-dev/    不发布的部分：单元测试、页面冒烟测试、构建/检查脚本、lib-shared 源码、架构文档
project.config.json 微信开发者工具项目配置
```

## 开发

用微信开发者工具打开仓库根目录即可。

测试与检查（需要 Node 22）：

```bash
cd miniprogram-dev
npm install
npm run verify      # 生成 app.json → 静态检查 → 单元测试 → 页面冒烟测试
```

架构、约定和各脚本的用途见 [miniprogram-dev/ARCHITECTURE.md](miniprogram-dev/ARCHITECTURE.md)。

## 许可

与上游相同，**GNU AGPL-3.0-or-later**（[LICENSE](LICENSE)）。第三方组件与数据的声明见 [NOTICE.md](NOTICE.md)。
