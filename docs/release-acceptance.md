# 发布验收记录

## 验收范围

任务 12 覆盖首次启动、每日任务重复生成、任务状态流转、跨天处理、定期快照、备份提醒、备份恢复和 ICS 文件互导，不包含范围外功能。

## 运行环境

- Node.js：要求 `>=20.19.0`，本次使用 `v22.22.1`。
- 构建工具：Vite 8.2.2。
- 发布目录：`dist`。
- 路由策略：BrowserRouter，静态托管必须将未知路径回退至 `/index.html`。

## 自动化验收结果

2026-10-12 使用 Node.js 22.22.1 重新执行：

- `npx tsc -b --pretty false`：通过。
- `npm test`：通过，共 9 个测试文件、42 个测试。
- `npm run lint`：通过。
- `npm run build`：通过，生成 Web App Manifest、Service Worker 和 Workbox 运行文件。
- 核心验收测试覆盖首次启动、幂等生成、个人/家人归属继承、状态流转、跨天、改期记录、四项节奏设置、快照、提醒、恢复及 ICS 互导。
- 页面采用路由级按需加载，主入口约 256.58 kB，最大共享业务包约 238.53 kB。

生产构建无包体积警告。

## 静态部署验收

- 将 `dist` 目录作为静态站点发布目录。
- `public/_redirects` 会复制到产物根目录，为 Netlify 及兼容平台提供 `/* /index.html 200` SPA 回退。
- 其他平台需配置等价的未知路径回退规则。
- 2026-10-12 本地预览复查 `/today`、`/templates`、`/history`、`/settings`、`/manifest.webmanifest`、`/sw.js` 和 `/_redirects`，均返回 HTTP 200。
- Manifest 使用 `/today` 作为启动地址，作用域为 `/`。
- Service Worker 预缓存应用壳，并将导航请求回退到 `/index.html`。

## 移动端兼容性检查

2026-10-12 决定暂缓真机验收。当前未连接 Safari iOS 或 Chrome Android 真实设备，因此不得将以下项目记录为已通过；发布前需按照 [移动端真机验收表](mobile-device-acceptance.md) 手工确认。

### Safari iOS

1. 使用 HTTPS 打开站点并通过“添加到主屏幕”安装。
2. 从主屏幕启动，确认独立窗口、图标、标题和 `/today` 首屏正确。
3. 完成一次在线访问后断网重启，确认应用壳可打开且本地任务可读取。
4. 分别执行 JSON 备份下载、JSON 恢复文件选择、ICS 导出和 ICS 导入。
5. 确认文件选择取消、无效文件和重复日历事件均有正确反馈。

### Chrome Android

1. 使用 HTTPS 打开站点并通过安装提示或菜单安装。
2. 从启动器打开，确认独立窗口、图标和 `/today` 首屏正确。
3. 完成一次在线访问后断网重启，确认应用壳及本地数据可用。
4. 分别执行 JSON 备份下载、JSON 恢复文件选择、ICS 导出和 ICS 导入。
5. 确认 Android 文件选择器可选取 JSON 与 ICS 文件，并验证错误反馈。

## 发布结论

生产构建、自动化核心路径、静态托管配置和本地 HTTP 资源检查已通过。设置上限及备份周期可在界面修改，任务改期会保存日期变更记录。Safari iOS 与 Chrome Android 的安装、离线和文件操作仍标记为待真实设备人工验证，因此任务 12 尚未完全关闭。
