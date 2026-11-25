# 影响分析报告 — 用户列表页（静态 Mock 演示）

## 文档信息

| 项目 | 内容 |
|---|---|
| 需求票号 | `HR_PR-2`（平台工作项 `issue-1795571795065833793`） |
| 所属 Workbench | `frontend`（`codes/hr-collection-agent-frontend`） |
| 变更分级 | **L2（前端单域新增页面与组件）** |
| 分析角色 | Dev_Lead |
| 日期 | 2026-11-25 |

---

## §1 需求背景与边界裁决

结合人工门控确认原则（`approval-mwvgsd24-f172`）：
> 本需求只是一个静态页面，目的是展示列表展示效果的 Mock，不考虑后端真实的 `user` 用户模型是否存在或是否支持。

基于此核心原则，Dev_Lead 明确以下范围边界：
1. **后端零改动**：`codes/hr-collection-agent-backend/`、`backend-docs/`、`global-info/business-brief.md` 及 `ADR-009`（现有系统无真实登录/账号体系）保持不变，无需触发跨 Workbench Review。
2. **纯前端内存模拟**：所有用户列表与详情数据由前端 `src/api/MockUserApi.ts` 在运行时内存中合成与过滤，不发起真实 HTTP 请求，不读写 `localStorage` / `sessionStorage` / `indexedDB`（满足 `F-01`、`F-02`）。
3. **不新增第三方依赖**：复用现有 `react@18.3.1`、`antd@5.29.3`、`vitest@5.1.0`、`eslint@10.14.0`，不引入路由库、状态管理库或 Mock 网络库（满足 `TD-02`、`AGENTS.md`）。
4. **目录约束合规**：所有新增代码严格放在 `codes/hr-collection-agent-frontend/src/` 既有子目录（`types/`、`api/`、`hooks/`、`components/`、`pages/`）内，不新增一级子目录（满足 `Q-DL-02`）。

---

## §2 既有代码与调用方影响分析

| 目标文件 | 现存实现与调用方 | 变更类型 | 兼容性与影响评估 |
|---|---|---|---|
| `src/App.tsx` | 当前 `type View = 'chat' | 'archive'`，通过 Ant Design `Segmented` 切换并以 `<div hidden={view !== ...}>` 保活 `ResumeCollectionPage` 与 `ArchivePage` | 修改 | 扩展 `View = 'chat' | 'archive' | 'users'`，在 `Segmented` options 末尾追加 `{ label: '用户列表', value: 'users' }`，新增 `<div hidden={view !== 'users'}><UserListPage active={view === 'users'} nav={nav} /></div>`。完全向后兼容既有 `'chat'` 与 `'archive'` 行为。 |
| `src/App.test.tsx` | 测试壳渲染、主题 token（`TD-14`）、切换至“已归档简历”及保活往返（`TD-25`） | 修改 | 现有 4 条用例断言 `已归档简历`、`对话` 与 `GET /api/v1/resumes` 调用次数，均不受新增第 3 个页签破坏；需追加“用户列表”页签切换与三页签保活回归用例。 |
| `src/components/AppShell.tsx` | 接收 `nav`、`showNewChat`、`sidebar`、`children`、`footer`；`ArchivePage` 传入 `nav={nav} showNewChat={false}` | 不修改 | `UserListPage` 直接复用 `AppShell`（`nav={nav} showNewChat={false}`），不改动 `AppShell` 及 `AppShell*.test.tsx`。 |
| `src/hooks/model/FormatTime.ts` | 提供 `formatDateTime(iso: string): string | null`（`zh-CN`，`hour12: false`） | 不修改 | `UserTable` 与 `UserDetailModal` 直接复用 `formatDateTime` 格式化 `created_at` 与 `last_login_at`。 |
| `src/components/ErrorAlert.tsx` | 接收 `error: ApiError | LocalError`（`LocalError` 为 `{ kind: 'local', message: string }`），渲染 `<Alert type="error" showIcon role="alert" />` | 不修改 | `useUserList` 可构造 `LocalError`（`{ kind: 'local', message: ... }`）并直接复用 `ErrorAlert` 展示列表/详情错误提示，保证全局错误视觉一致性。 |
| `src/components/Layout.css` | 全局布局、对话区、`.archive-page`、`.link-button`、`.app-nav` 及 `@media (max-width: 599px)` 触控规则 | 修改 | 在文件末尾增量追加 `.user-list-page`、`.user-filter-bar`、`.user-list-header` 等样式规则，不修改原有选择器；须兼容 `button.ant-btn` 在 `<600px` 下 `min-height: 44px` 的既有规则。 |
| `eslint.config.js` | 禁用 `localStorage/sessionStorage/indexedDB`；禁止 `src/pages|components|hooks` 使用网络 API；`no-console` 仅放行 `console.error` | 不修改 | `MockUserApi.ts` 位于 `src/api/`；页面/组件/Hook 严禁调用 `console.log` 或浏览器存储 API；注释全部使用英文。 |

---

## §3 架构约束与红线核查（Dev_Lead 裁决）

| 约束 / 编号 | 核查内容 | 裁决结论 |
|---|---|---|
| `P-09`（不展示简历记录 ID） | `HR_PR-1` 的 `ArchiveList.tsx` 禁止展示 `resume_id`；而 `HR_PR-2` PRD 明确要求列表与详情展示 `user_id`（用户编号） | **允许展示 `user_id`**：`user_id` 为静态 Mock 用户页面的业务编号字段，不属于真实简历归档主键 `resume_id`，二者语义与作用域完全隔离。 |
| `B-06`（合成脱敏样例） | 静态数据集包含姓名、手机号、邮箱等用户信息 | **强制脱敏合成**：28 条预设记录必须使用虚构姓名、掩码手机号（如 `138****8001`）与保留域名邮箱（`@example.com`），禁止出现真实员工信息。 |
| `B-03`（控制台不输出敏感信息） | 列表与详情加载、出错时不得打印用户记录或输入关键词到控制台 | **强制遵守**：`MockUserApi`、`useUserList` 与组件均不得调用 `console.log/info/warn`，出错时仅在 UI `Alert` 展示通用中文提示。 |
| `TD-13`（360px 响应式适配） | 用户列表包含 9 列（编号、姓名、用户名、手机号、邮箱、角色、状态、创建时间、操作） | **必须补充横向滚动**：`UserTable` 必须配置 `scroll={{ x: 'max-content' }}`，`UserFilterBar` 必须支持 `flex-wrap: wrap`，防止窄屏挤压或溢出。 |
| `TD-25`（多页签保活） | 切入/切出“用户列表”页签时，如何处理“对话”“已归档简历”和“用户列表”自身状态 | **首次激活自动加载，切回保留状态**：首次切换至 `users` 时自动加载；用户切至其他页签再切回时保留已有筛选、分页与列表结果，不重置用户输入；可通过“重置”或“重试”手动刷新。 |

---

## §4 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 防抖定时器或模拟延迟 `setTimeout` 在组件卸载后触发 | 单测出现 React `act(...)` 警告或状态更新异常 | 在 `useUserList` / `UserFilterBar` 中使用 `useEffect` cleanup 或 `ref` 清理定时器，支持 `MockUserApi` 注入 `delayMs`（单测可设为 `0`）。 |
| 行点击 `onRow` 与操作列“查看详情”按钮同时触发 | 单次点击导致两次 `openDetail` 调用 | 姓名按钮与操作列“查看详情”按钮调用 `e.stopPropagation()`，统一走同一打开处理函数。 |
| 演示模式 `demoMode='error'` 下点击“重试”无法恢复 | 演示失败→重试恢复的闭环断裂 | `retryList()` 时若 `demoMode === 'error'`，自动重置 `demoMode` 为 `'normal'` 再发请求，确保可演示、可自测。 |
