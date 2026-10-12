# Daily Flow Manager

一个本地优先的个人日常流程管理 PWA。应用使用 To Do、进行中、已完成三阶段看板，把固定习惯、临时任务和跨天事项组织成每日行动。

## 主要功能

- 每天或按星期生成固定任务实例，历史记录不受模板后续修改影响。
- 灵活任务、单层子任务、个人/家人归属、优先级、预计时长、截止日期和今日重点。
- 跨天任务结转、WIP 限制、重点数量限制和计划日期变更记录。
- 完成历史及固定任务连续完成统计。
- IndexedDB 本地持久化、自动快照、JSON 备份恢复。
- ICS 日历文件批量导入、预览、去重和导出。
- 可安装 PWA 与应用壳离线缓存。

## 本地运行

要求 Node.js `>=20.19.0`，推荐使用 Node.js 22。

```bash
npm install
npm run dev
```

开发服务器启动后访问终端显示的地址，默认入口为 `/today`。

## 质量检查

```bash
npm test
npm run lint
npm run build
```

生产产物生成在 `dist`。项目使用 `BrowserRouter`，静态托管平台必须把未知路径回退到 `/index.html`；仓库中的 `public/_redirects` 为 Netlify 及兼容平台提供该规则。

## 数据与备份

业务数据和本地快照都保存在当前浏览器的 IndexedDB 中。清除网站数据会同时删除任务和本地快照，因此应定期在“设置”中导出 JSON 异地备份。备份文件包含个人任务信息，首版不加密，请存放在可信位置。

ICS 采用手动文件交换，不会与系统日历自动或双向同步。

## 发布前检查

自动化验收和静态部署说明见 [docs/release-acceptance.md](docs/release-acceptance.md)。正式发布前仍需在 Safari iOS 和 Chrome Android 真机确认安装、离线启动以及 JSON/ICS 文件操作。
