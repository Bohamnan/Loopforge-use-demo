# frontend Workbench — 代码审查参考

> 本文件由 code-reviewer 在 role=frontend 时加载，回答"本 Workbench 审查时具体查什么"，
> 与 SKILL.md 的五个审查维度配合使用。具体仓库分层以 `{code_roots.frontend}` 下最近的
> `AGENTS.md` / `CLAUDE.md` 为准。

---

## 1. 本 Workbench 架构/分层合规检查项（对应 SKILL.md 维度 1）

分层模式：pages → components → hooks → api 封装层。

1. 页面层只做页面编排与路由，不得直接请求接口。
2. 组件层只做展示与交互，不得直接请求接口，不得持有业务规则。
3. hook 层承担状态与副作用并调用 api 层，不得操作 DOM 样式。
4. api 封装层是前端访问 backend 的唯一出口，负责接口调用与错误转换。
5. 前端只通过 backend 提供的 HTTP 接口取数，不得直连外部服务或存储（F-01）。
6. 请求与响应类型须与 backend 的 OpenAPI 契约一致，前端不另立约定；接口契约变更须经 cross-workbench-reviewer 审视。
7. 状态管理只用 useState、useReducer，不得引入状态管理库；业务数据以后端为准。

---

## 2. 本 Workbench 业务逻辑高风险模式（对应 SKILL.md 维度 2）

1. 校对确认流程（F-03，BLOCK）：对话界面必须清楚展示待校对的解析结果，用户明确确认前不得出现"已保存"提示。涉及该流程的改动判为 HIGH_RISK，要求更强证据。
2. 页面状态覆盖：每个页面必须处理加载态、空态、错误态。
3. 错误展示：按 backend 统一错误体解析，由 api 封装层转换为界面可展示的错误。
4. 边界条件：接口返回空数据、接口出错、超时与重试。
5. 无 Ticket 上下文时，不对校对确认、保存提示的业务结论下判断。

---

## 3. 本 Workbench 编码规范重点（对应 SKILL.md 维度 3）

1. 命名：组件与文件用 PascalCase，hooks 以 use 开头，类型以接口契约命名。
2. 目录：新代码放在 `src/{pages,components,hooks,api,types}` 对应目录。
3. 注释使用英文。
4. 错误处理：api 层统一转换错误，页面处理加载态、空态、错误态。
5. 日志：不在控制台输出用户提交内容和敏感数据。
6. 组件库使用 Ant Design（React 版），不另引入其他组件库。
7. 格式检查随 `npm run lint`，不单设格式化命令。

---

## 4. 本 Workbench 安全检查项（对应 SKILL.md 维度 4）

1. 不得保存任何密钥或凭证，也不得直连外部服务或存储（F-01，BLOCK）。
2. 任何密钥、凭证只放环境变量或配置中心，不得写入代码、日志、仓库。
3. 不在浏览器本地存储敏感数据（F-02，WARN）；不在浏览器持久化敏感数据。
4. 不在控制台输出用户提交内容和敏感数据。
5. 所有外部数据只经 backend 的 HTTP 接口获得，作为可信边界。

---

## 5. 本 Workbench 测试覆盖门槛（对应 SKILL.md 维度 5）

依据 design_profile.test_dimensions 覆盖，并要求 F-03（确认前不得提示已保存）相关交互必须有测试覆盖；不设数值门槛。⚠️ 推断无文档依据

test_dimensions 包括：

- 组件渲染
- 主要交互流程
- 加载态、空态与错误态
- 接口调用（mock backend 契约）

验证命令：

- 全量测试：`npm test`
- 单个测试：`npx vitest run {file}`
- 静态检查：`npm run lint`
- 构建：`npm run build`
