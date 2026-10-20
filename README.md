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
miniprogram/        小程序本体（project.config.json 的 miniprogramRoot）
project.config.json 微信开发者工具项目配置（AppID 等）
```

## 开发

用微信开发者工具打开仓库根目录即可。功能靠人工测试，仓库里没有自动化测试和 CI。

维护时需要知道的几条：

- **分包**：4 个 tab 页（首页、计划、统计、动作库）在主包 `pages/`；其余页面在 `pkg-*` 分包；`data-*` 是只放数据的分包，
  启动时由 `lib/boot-data.js` 用 `require.async` 加载（动作库、中文动作名、动作说明、人体图轮廓）。
  新增或删除页面要手动更新 `miniprogram/app.json` 的 `pages` / `subPackages`。
- **引用规则**：分包可以 import 主包（`lib/`、`store/`、`utils/`、`components/`），主包不能 import 分包，分包之间也不能互相 import。
  只被一个分包用到的模块放在该分包的 `lib/` 里，主包控制在 1.5MB 以内（目前约 1.24MB）。
- **弹层**：原版的底部弹层都改成了独立页面，打开函数集中在 `utils/sheets.js`；页面通过 `utils/nav.js#pageParams` 取参数、调用回调。
- **状态**：`store/store.js`（持久化到 `wx.setStorageSync`）+ `store/ui.js`（toast、计时器）；页面用 `utils/page.js#connectPage` 绑定。
- **文案**：只有中文。WXML 里直接写中文；JS 里用 `t('英文原文')`，译文在 `locales/zh.js`，新文案手动加进去。
- **限制**：没有 DOM / window / localStorage / fetch / Intl；用 wx API 代替，日期数字用 `lib/format.js` 的中文格式化。

## 许可

与上游相同，**GNU AGPL-3.0-or-later**（[LICENSE](LICENSE)）。第三方组件与数据的声明见 [NOTICE.md](NOTICE.md)。
