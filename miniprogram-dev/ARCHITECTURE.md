# openGym 微信小程序版：架构约定

> **现状（迁移完成后）**：本仓库只剩小程序。移植时参考的原 React 前端 `frontend/`、后端 `api/` 等已从仓库删除，
> 文中所有 `frontend/src/...` 路径都指上游仓库 [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym)
> 的提交 `e348fc17`（也可以在本仓库 git 历史里 `git show e348fc17:frontend/src/...` 查看）。
> 目录：`miniprogram/` 只放会发布的代码；维护脚本、`lib-shared/` 源码和本文档在 `miniprogram-dev/`。
> **自动化测试已全部删除，改为人工测试**；下文提到的 vitest、`*.test.js`、冒烟测试等只是迁移过程的记录。
> 下文中写「miniprogram/tools/…」「store/vitest.config.mjs」等的地方是迁移过程中的旧位置，以文末「验证命令」为准。

本目录是 `frontend/`（React 19 + Vite 的 PWA）移植成的**原生微信小程序**。原前端代码仍保留在
`frontend/src/` 作为移植参考：**页面行为、文案、业务逻辑一律以原代码为准**，不要凭空设计。

## 已确定的产品决策

- 原生小程序（WXML/WXSS/JS），不使用 Taro/uni-app，不用 npm 包。
- **纯本地、无登录**：相当于原版的 guest 模式。数据只存在 `wx.setStorageSync`（键 `gym_state_v1`）。
  没有服务器同步、没有 Passkey/密码登录、没有账号页、没有 Admin、没有 Web Push、没有设备配对二维码。
- **不做 AI 教练**（Coach 依赖服务器或境外 LLM API）。凡是原代码里 coach 相关的入口一律去掉。
- **不做 Health Connect / Apple Health、条码扫描、PWA 更新提示**。
- **只有简体中文**：`t()` 只加载 `locales/zh.js`；不出现语言切换。
- **不打包动作图片/动画**：`catalogue/media` 的授权（Gym visual）禁止在 openGym 之外使用，且 216MB 远超小程序包上限。
  动作只显示文字（名称、肌群、器械、步骤说明）。UI 上有图的位置用占位（肌群图标/首字）代替。
  用户自己拍的训练照片/进度照片（本地文件）要支持。
- 其余功能尽量完整：计划/轮换、训练进行中（卡片/列表/紧凑三种布局、超级组、休息计时、计时组、RIR/RPE）、
  进阶规则、1RM、历史、统计、肌群恢复、结构平衡、体重/围度/进度照片、动作库/自定义动作、杠铃片/哑铃计算、
  设置各页、备份导入导出、Hevy/CSV 导入、FIT 导出（能做就做）。

## 目录与分包

```
project.config.json            (仓库根目录) miniprogramRoot = miniprogram/
miniprogram/
  app.js app.json app.wxss     app.json 由主 agent 最后统一汇总写入
  custom-tab-bar/              自定义 tabBar（首页 / 计划 / [开始/继续训练] / 统计 / 动作库）
  lib/                         从 frontend/src/lib 移植的纯逻辑（ES module）+ 同目录 *.test.js（vitest 跑，不进包）
  locales/zh.js                中文文案（t() 的字典）
  store/store.js               useStore（原 store/useStore.js 去掉同步/登录后的移植）
  store/ui.js                  useUI（toast、休息计时、计时组等临时 UI 状态；不再管理 sheets）
  store/actions.js             原 sheets.jsx 里的非 UI 流程函数（beginWorkout、finishWorkout、loadStarterPlan…）
  utils/                       create-store / storage / nav / routes / page / sheets / theme / polyfill
  components/                  共享组件（见下）
  pages/{home,plan,stats,library}/index   4 个 tab 页（主包）
  pkg-common/menu/index        通用菜单页（menuSheet 复杂情况）
  pkg-workout/  pkg-plan/  pkg-history/  pkg-library/  pkg-body/  pkg-settings/   功能分包
  data-ex/  data-instr-zh/  data-instr-en/  data-desc-en/                          纯数据分包（require.async 异步加载）
```

主包上限 2MB、单个分包 2MB、总计 20MB。`lib/exercises-data.js`（1.1MB）和动作说明不能放主包，
放在数据分包里，启动时 `require.async` 加载（见「启动流程」）。

### 路由（utils/routes.js）

原 hash 路由 → 小程序页面。lib 代码调用的 `nav('/plan')` 走 `utils/nav.js#navTo`。

| 原路由 | 小程序页面 |
|---|---|
| /home /plan /stats /library | pages/*/index（tab，switchTab） |
| /workout | pkg-workout/workout/index |
| /plan/r/:id | pkg-plan/routine/index?id= |
| /history | pkg-history/history/index |
| /structural-balance, /muscles | pkg-history/structural-balance/index, pkg-history/muscles/index |
| /checkin /measurements /progress-photos | pkg-body/checkin, measurements, progress-photos |
| /settings, /settings/:page | pkg-settings/settings/index, pkg-settings/page/index?page= |

Settings 的根页面在原版是 tab 外的页面；小程序里从首页右上角齿轮进入。

### Sheet → 页面（utils/sheets.js）

原版所有底部弹层（`xxxSheet(...)`）在小程序里都变成**独立页面**，打开函数保持原名原参数，集中在
`utils/sheets.js`（主包，因为分包之间不能互相 import）。页面用 `pageParams(query)` 取回参数，
参数里的回调函数（onSave / onPick / onDone…）直接调用即可，然后 `wx.navigateBack()`。
`utils/sheets.js` 列出了每个 sheet 对应的页面路径——**实现页面的 agent 必须用这个路径和这些参数名**。

- `confirmSheet` → `wx.showModal`；`menuSheet` → 简单的走 `wx.showActionSheet`，复杂的走 `pkg-common/menu`。
- 页面内很小的、一次性的选择（单选 3~5 项）可以用 `wx.showActionSheet` / 组件内 `<page-container>` 浮层，自行决定。

## 启动流程（app.js）

```
App.onLaunch:
  import './utils/polyfill.js'                    // Object.hasOwn、Array#at/findLast、structuredClone… 补丁
  this.ready = loadCoreData()                     // lib/boot-data.js：require.async 数据分包 → initExercises() → 中文名字典
                .then(() => useStore.getState().init())   // store：从 storage 读 gym_state_v1、registerCustom 等
```
页面一律通过 `utils/page.js` 的 `connectPage` 定义，它会在 `getApp().ready` 之后才执行你的 onLoad。

## 状态绑定（utils/page.js）

```js
import { connectPage } from '../../utils/page.js'
import { useStore } from '../../store/store.js'
Page(connectPage({
  data: { ... },
  mapState(S, { state, ui }) {            // S = useStore.getState().S；ui = useUI.getState()
    return { list: S.routines.map(r => ({ id: r.id, name: r.name })) }   // 只放渲染需要的、已格式化的字段
  },
  onTapX(e) { useStore.getState().update(s => { ... }) },
}))
```
- store/ui 变化时自动重算 `mapState`，按 key 做 JSON 比较后只 setData 变化的 key。
- `this.data.theme` 是主题 CSS 变量串：页面根节点写 `<view class="page" style="{{theme}}">`。
- 组件用 `connectComponent`（同样的 mapState）。

## 技术约束与坑（所有 agent 必读）

1. **模块**：可以用 `import/export`（project.config 开了 es6 + enhance），路径一律写**相对路径并带 `.js` 后缀**。
   不能用：动态 `import()`、`import.meta`、JSON import（`import x from './a.json'` 要改成 `.js` 模块）、顶层 await。
2. **没有 DOM/BOM**：没有 window、document、localStorage、fetch、Blob、URL.createObjectURL、IndexedDB、
   Notification、navigator.vibrate、AudioContext、requestAnimationFrame（页面里用 setTimeout；canvas 有自己的 rAF）。
   替代：storage → `utils/storage.js`；震动 → `wx.vibrateShort/Long`；声音 → `wx.createInnerAudioContext`；
   常亮 → `wx.setKeepScreenOn`；剪贴板 → `wx.setClipboardData`；文件导出 → 写到 `wx.env.USER_DATA_PATH` 后
   `wx.shareFileMessage`；文件导入 → `wx.chooseMessageFile` + `wx.getFileSystemManager().readFileSync`。
3. **不要用 Intl / toLocaleString / toLocaleDateString**：安卓端 JS 引擎的 Intl 不可靠。日期、数字格式化
   用 `lib/format.js` 里手写的中文格式（周一…周日、M月D日、千分位）。
4. **WXML 不能调用函数**，`{{ }}` 里只能放简单表达式。所有显示用字符串（含 `t()` 翻译、格式化的数字/日期）
   在 JS（mapState）里算好再放进 data。复杂判断也提前算成布尔值。需要的话可以用 WXS 做纯格式化。
5. **setData 体积**：单次不超过 1MB，越小越好。动作库 1300+ 条必须分页/按需渲染（每批 ~50 条，scroll-view 触底加载）。
   不要把整个 S 或整个 workouts 数组塞进 data。
6. **文案**：只有中文。WXML 里的静态文案直接写中文——**从 `frontend/src/locales/zh.js` 查原文对应的译文**，
   保持与原版一致。动态拼接、复数用 JS 里的 `t('English key', ...args)` / `tn(...)`。
7. **样式**：设计令牌（颜色、圆角、间距）和通用类（.card .list .item .btn .chip .seg .muted …）定义在
   `app.wxss`（从 `frontend/src/index.css` 移植）。页面的 wxss 只写页面特有的。单位用 px 或 rpx 均可，
   与 app.wxss 保持一致（app.wxss 用 px）。不要用 `:has()`、`@container`、`backdrop-filter` 之外的生僻 CSS。
   深浅色主题通过页面根节点的 CSS 变量切换，**不要写死颜色**，用 `var(--xxx)`。
8. **图标**：用共享组件 `<icon-x name="xxx" />`（components/icon），图标名与原 `components/Icon.jsx` 一致。
   不要和小程序内置 `<icon>` 混淆。
9. **页面栈最多 10 层**：`utils/nav.js#navTo` 在栈深时自动 redirect；sheet 页面打开后要 navigateBack 回去。
10. **导航栏**：所有页面使用默认导航栏（不用 custom），`navigationBarTitleText` 写在页面 json 里；
    主题色由 `utils/theme.js#applyChrome` 在页面 onShow 时设置（connectPage 已处理）。
11. 不要修改 `frontend/` 下的任何文件。

## 共享组件（components/，各组件的 properties 见各自 .js 顶部注释）

icon、num-field（数字输入，支持逗号小数）、stepper（±步进）、seg（分段选择）、switch-x（开关）、
row（设置行：图标+标题+副标题+右侧值/箭头）、line-chart（canvas 2d 折线）、bar-chart、heatmap（训练热力图）、
body-map（人体肌群图，来自 lib/body-paths.js）、rest-timer（休息计时条，绑定 useUI.timer）、toast（绑定 useUI.toastMsg）、
duration-wheel（时长滚轮，picker-view）、empty（空状态）、sheet（页面内底部浮层容器，基于 page-container）。
页面在自己的 json 里 `usingComponents` 引用，例如 `"icon-x": "/components/icon/index"`。

## 并行分工与写入边界

| 负责人 | 只能写 |
|---|---|
| 主 agent | project.config.json、miniprogram/app.json、ARCHITECTURE.md、utils/{create-store,storage,nav,routes,page,sheets}.js |
| lib | miniprogram/lib/**、miniprogram/locales/**、data-*/** |
| store | miniprogram/store/** |
| shell | app.js、app.wxss、custom-tab-bar/**、components/**、utils/{theme,polyfill}.js、pkg-common/** |
| workout | pkg-workout/** |
| home+plan | pages/home/**、pages/plan/**、pkg-plan/** |
| stats+history | pages/stats/**、pkg-history/** |
| library+body | pages/library/**、pkg-library/**、pkg-body/** |
| settings | pkg-settings/** |

需要改别人负责的文件时**不要改**，在最终报告里写清楚「需要 X 文件提供什么」。每个页面 agent 在报告里列出自己新建的
全部页面路径（用于汇总 app.json），以及每个页面的 navigationBarTitleText。

---

# 第一阶段产出（页面 agent 必读，以此为准）

## 测试命令
- 见文末「验证命令」（`cd miniprogram-dev && npm run verify`）。

## lib 接口变化
- exercises：`EXDB/EXALIAS/CATALOGUE/EXIDX/BODYPARTS` 启动后才有数据（app.ready 之后），模块加载时不要读。
- i18n：`useLang` 删除 → `onLangChange(fn)`；永远中文。
- format：无 Intl；有 `weekdayShort`、`groupNum`、`relTime` 等中文格式化。
- sound：原名导出，wav 文件播放；wakelock：`requestWakeLock/releaseWakeLock/setKeepAwake(on)`（训练页 onShow/onUnload 调）。
- clipboard：`copyText` 返回 Promise<boolean>，`readText()`。
- nav：`nav()` 走 utils/nav.js#navTo。sheet 页面里要跳到别处，优先 `nav(to, { replace: true })`，不要先 navigateBack 再 navigateTo（会竞态）；或者用 store/actions.js 的 `afterSheet(fn)` / `navAfterSheet(to)`。
- media-store：数据是 ArrayBuffer；`url()/pathNow()` 返回本地路径可直接作 `<image src>`；`putFile(hash, tempPath)`。
  media-ingest：`ingestMediaFile(chooseMediaTempFile)` → `storeIngested(out)`。
- backup-media/zip：`exportBackupZip` 返回 `{ data: ArrayBuffer }`；`readBackupFile` 接受 ArrayBuffer 或字符串。
- 不可用（DOM）：`plan-share#printPlan`、`accent#applyAccent`——页面不要调用。

## store 导出
- `store/store.js`：`useStore`、`DEF`、`freshState`、`restartedState`、`hasData`、`KEY`。
  S、user(null)、ready、config(null)；`init flush update(mut,push) saveHistoryEdit discardHistoryEdit deleteHistoryEdit setUnit(to,{convert}) resetEverything importConflict(恒 null) importBackup(backup) replaceState(S) autoBackupNow(空操作) isGuest(恒 true)`。
  已删除：sync 相关、keptRev、linkCode、coachLocal、needsMobileOnboarding、pushState/pullState/syncNow/unsyncedChanges/keptChanges/setUser/signOut/connectToServer/loadConfig/boot 等。原 views 里用到这些的 UI 一律去掉。
- `store/ui.js`：`useUI`：toastMsg toastAction swipeHint setFlash timer work timerFlashId；
  `flashTimer toast(msg,{action,onAction,ms}) runToastAction pauseToast resumeToast startRest pauseRest resumeRest addRest shiftRestOwner stopRest startWork bindWork finishWorkEarly abandonWork stopWork`。没有 sheets 栈。
- `store/actions.js`：`startFlow beginWorkout repeatWorkout(w,close) finishWorkout doFinishWorkout finishWorkoutPrompt discardWorkout addRoutineToSession(r) saveWorkoutEdits exitWorkoutEdit editSavedWorkout(w,close) deleteSavedWorkout(w,onDone) mediaGoesToo canLogPastWorkout beginBackfill submitPastWorkout({iso,time,durationMin,routineIds}) loadStarterPlan chooseStarterPlan(id,fit) starterPlanCopy PLAN_COPY swapActiveWorkoutExercise deleteCustomEx importFromApp(file?,onDone) applyImport(parsed) effortLine importFromHevy fetchHevy(key,onProgress) applyHevyImport(payload,opts) exportPlanFile importPlanFile(f?,onRead) applyPlanImport(bundle,{schedule}) planText planHasRoutines detailTags bwDeltaColor setsLine printWholePlan(复制文本到剪贴板) afterSheet(fn) navAfterSheet(to) closeThenNav(close,to) navToWorkout pickFile readTextFile saveAndShareFile(name,content) PAGES`。
  actions 额外直接打开的页面（必须由对应 agent 实现）：
  - `/pkg-workout/summary/index` 参数 `{ w, prs, e1prs }`：训练完成总结页（替换训练页），「好的」回 /home。
  - `/pkg-settings/import-summary/index` 参数 `{ parsed }`：按钮调用 `applyImport(parsed)`。
  - `/pkg-settings/hevy-import/index`：用 `fetchHevy` / `applyHevyImport`。
- sheet 页面约定：**先调用回调，再 `wx.navigateBack()`**。exercisePicker 页面在 onPick 后自己返回。
  `logPastWorkoutSheet` 之前调用方要先 `canLogPastWorkout()`；`addRoutineToSessionSheet` 前确认有进行中的训练。

## shell：样式约定（app.wxss）
- 根节点：`<view class="page" style="{{theme}}">`；tab 页加 `has-tabbar`，休息计时运行时加 `resting`（mapState 里 `resting: !!(ui.timer || ui.work)`）；sheet 改成的页面用 `page sheet-page`。
- 按下态：可点 view 加 `hover-class="hv"`（样式写 `.x.hv`），不用 `:active`。禁用加 class `disabled`。
- 标题：`.h1 .h2 .h3 .sec`（WXML 无 h1~h4）。手写带图标的设置行加 `has-i`。
- 横向 chips：`<scroll-view scroll-x class="chips"><view class="chips-in">…`。输入框：`<input class="field" placeholder-class="ph">`。
- 通用类：row gap between wrap col grow muted dim small accent red ellipsis clamp2 mt/mb divider hdr iconbtn card sect sect-t sect-b sect-f lrow(-i/-m/-t/-s/-v/-c/-k) list item tt ss thumb thumb-t chev tag chip(.on/.alt) btn(primary tinted danger ghost plain sm xs pill) field searchf sw seg stp num chk setrow sethead effcell wchip menu-item cal-* hm-c tiles mrow pr swatch plan-* measure-* 等。**以 app.wxss 实际内容为准，用前 grep 一下。**
- CSS 变量与 index.css 同名（--bg --bg-el --surface --surface-2/3 --label --label-2/3/4 --sep --acc --acc-2 --on-acc 各系统色 --r*），color-mix 结果预算成 --acc-soft --red-soft 等。canvas 取色用 `utils/theme.js#themeColors(S)`。

## shell：组件（e.detail 取值，事件 bind:xxx）
全局已注册（app.json usingComponents，页面无需再引）：icon-x toast-x rest-timer timer-flash row seg switch-x stepper num-field empty sheet。
按需在页面 json 引用：line-chart bar-chart heatmap body-map（路径 `/components/<名>/index`）；duration-wheel 已移到 pkg-common（见文末「主包瘦身」）。

| 组件 | properties | 事件 |
|---|---|---|
| icon-x | name, size, color(空=跟随文字色), stroke, cls（virtualHost：class/style 写在标签上无效，用 cls） | — |
| num-field | value(number/null) decimal nullable placeholder disabled focus selectOnFocus cls fit | change{value} focus blur |
| stepper | value step min max decimal nullable label unit invalid disabled plain cls placeholder customStep | change{value,dir?}；customStep 时 step{value,step,dir} |
| seg | options[{value,label,icon}] value inline cls | change{value} |
| switch-x | checked disabled | change{value}（不自己翻转） |
| row | icon iconTint title subtitle value accessory('chevron'/'check') danger tap dis cls；slot | tap（需设 tap 属性） |
| empty | icon text sub cls；slot | — |
| sheet | show title locked maxH center；slot | close（自己把 show 设 false） |
| rest-timer | place: 'docked'(训练页)/'tabbar'(tab 页)/'float'(其它) | show{on} |
| toast-x | tabbar | — |
| timer-flash | — （训练页放一个） | — |
| duration-wheel | value min max | change{value} pickstart pickend |
| line-chart | points[{t,y,d?,m?,note?}] series[{points,color}] h unit color axes goal invert | select{index,t,iso,v,note} |
| bar-chart | rows[{key,label,bold,tag,labelSub,pct,color,value,valueDim,sub}] tappable barWidth | rowtap{key,index} |
| heatmap | metric（自己读 S） | metricchange{metric} day{iso,title} |
| body-map | load thresholds body selected tappable variant(''/'fatigue'/'strength') legend cls | pick{part} |

- 时长滚轮页：`utils/sheets.js#durationSheet({title,value,min,max,off,footer,onDone})`。
- 休息时间调整：`components/rest-timer/adjust.js#adjustRestSheet / applyRestLeft`。
- 每个页面放一个 `<toast-x/>`（tab 页 `<toast-x tabbar/>`，并放 `<rest-timer place="tabbar"/>`）。
- tab 页 onShow：`if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected: N })`（home 0, plan 1, stats 2, library 3）。

---

# 集成后的验证命令（全部在仓库根目录下执行）

```bash
cd miniprogram-dev    # 纯 Node 22 脚本，无需 npm install
npm run app-json      # 新增/删除页面后重新生成 miniprogram/app.json（按目录扫描）
npm run check         # import 能解析、无跨分包引用、组件路径存在；WXML 检查；lib-shared 副本最新；主包里主包不用的 JS（应为 0）
npm run sync-shared   # 改了 lib-shared/ 之后重新生成各分包里的副本
npm run prune-locale  # 新增界面文案后，从 source/zh.full.js 重新裁剪 miniprogram/locales/zh.js
node tools/gen-sounds.mjs   # 重新生成 miniprogram/assets/sounds/*.wav
```

---

# 主包瘦身（按开发者工具「代码质量」扫描调整）

参考：微信《小程序性能优化指南》——主包建议 < 1.5MB；主包里只被分包使用的 JS / 组件应移到对应分包。

- **规则**：只被一个分包使用的 lib 模块放在该分包的 `<pkg>/lib/` 下（连同它的 `*.test.js`）；主包自己用的、或被多个分包共用的留在 `lib/`。
  现在位于分包里的 lib 模块：
  - pkg-settings/lib：imports.js（原 store/actions.js 中的 CSV/Hevy 导入流程）、import-csv、import-hevy、hevy-id-map、backup-media、rest-alert
  - pkg-history/lib：fit-export、structuralBalance、structuralBalance-view、workout-text
  - pkg-workout/lib：active-workout-order、exercise-chips、finish-compare、progression-copy、supersetFlow
  - pkg-body/lib：bodyweight、measurements；pkg-library/lib：similar-exercises
- duration-wheel 组件只被 pkg-common/duration 页面使用，已移到 `pkg-common/components/duration-wheel`；打开函数在 `utils/duration-sheet.js`（`utils/sheets.js#durationSheet` 再导出）。
- 已删除无人使用的模块：demo、guest、mobile、lib/nav（用 utils/nav.js）、nudge、sync-changes、sync-legacy、workout-card、workout-keys、exercise-muscle-batch-*/olympic 数据。
- 检查命令：`node tools/pkg-deps.mjs`（miniprogram-dev 下）列出主包中主包自己不用的 JS 及使用它们的分包。
  目前剩下 6 个被多个分包共用的文件（media-limits、media-ingest、workout-media、clipboard、zip、exercise-history，共约 38KB），有意留在主包。

## 第二轮瘦身（主包 1441KB → 1202KB，「主包未使用的 JS」清零）

- **多分包共用的模块 → `lib-shared/`**：media-limits、media-ingest、workout-media、clipboard、zip、exercise-history。
  `miniprogram-dev/lib-shared/` 是唯一可编辑的源码（测试也在这里），不在 miniprogram/ 里，因此不会上传。各分包用的是
  `tools/sync-shared.mjs` 生成到 `<pkg>/lib/` 的副本（文件头标注 GENERATED，不要手改）。
  改了 `lib-shared/` 或在分包里新引用了它之后运行：`npm run sync-shared`；
  `--check` 只检查不写入。主包不能引用 `lib-shared/`（check-imports 会报错）。
- **语言包裁剪**：`locales/zh.js` 只保留代码里实际用到的词条（2259 → 1108，163KB → 65KB），
  由 `npm run prune-locale` 从 `miniprogram-dev/source/zh.full.js`（上游完整中文包的副本）重新生成。
  新增界面文案后重跑；原版没有的小程序专用词条直接手写进 zh.js，脚本会保留。
- **人体图轮廓数据**（body-paths，92KB）移到 `data-ex/`，启动时随动作库一起 `require.async` 加载，
  通过 `lib/body-data.js#bodyPaths()` 读取。

## 第三轮：仓库只保留小程序（主包 1202KB，开发者工具扫描「主包大小」仍判超）

开发者工具的代码质量扫描按 miniprogramRoot 下的**全部文件**计算主包，不看 packOptions.ignore；当时 920KB 的测试文件、
tools/、lib-shared/ 都在 miniprogram/ 里。因此把所有不发布的内容移到 `miniprogram-dev/`，`miniprogram/` 里只剩发布代码。
同时删除了上游的后端、网页前端、MCP、部署（helm/kubernetes/docker）、CI（GitHub/GitLab/Gitea）、文档与目录数据源；
依赖它们的测试（多语言包校验、与服务器同步规则的对照、catalogue 校验、DOM 版 applyAccent）一并删除。

## 第四轮：删除自动化测试

按决定改为人工测试：删除全部单元测试、页面冒烟测试及其 vitest 配置、wx 模拟和依赖；CI 流水线此前已删除。保留无依赖的维护脚本。
