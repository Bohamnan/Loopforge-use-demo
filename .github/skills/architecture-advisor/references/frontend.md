# frontend Workbench — 架构设计参考

> 本文件由 architecture-advisor 在 role=frontend 时加载，回答"本 Workbench 具体怎么设计"，
> 与 SKILL.md 的通用流程配合使用。

---

## 0. Workbench 设计画像

- 数据存储职责：无（`has_storage` 为 false）。SKILL.md Step 2.1 跳过；数据由 backend 保存，前端不在浏览器持久化敏感数据。
- Step 2.2 设计形态：接口消费。调用 backend 的 REST 接口，类型随契约生成或手写对齐。
- 技术栈：TypeScript、React 18 加 Vite、Ant Design（React 版）；状态用 React 自带的 useState、useReducer，不引入状态管理库。
- 产出文件命名：不产出 02_schema/ 文件；接口消费规范写在 `03_api/interface_spec_{xxx}.md`。

---

## 1. Schema 设计规范（对应 SKILL.md Step 2.1）

本 Workbench 无数据存储职责。

### 1.1 结构化产出骨架（Schema 文档应覆盖的维度）

本 Workbench 无数据存储职责。

---

## 2. 接口/管道设计规范（对应 SKILL.md Step 2.2）

本 Workbench 是接口消费方。接口风格、请求响应格式、错误体均以 backend 的 OpenAPI 契约为准，前端不另立约定（路径前缀 `/api/v1`，字段 snake_case，时间用 ISO 8601 UTC，文件上传用 multipart/form-data，错误体为 `{code, message, request_id}`）。

接口消费规范应覆盖以下维度：

1. 消费的接口清单：路径、方法、用途。
2. 请求与响应类型：与 backend OpenAPI 对齐；类型随契约生成或手写对齐。
3. 加载态与错误态处理：按统一错误体解析，由 api 封装层转换为界面可展示的错误；页面必须处理加载态、空态、错误态。
4. 超时与重试策略。
5. 关联需求编号。

所有接口调用只经 api 封装层（基于 fetch），组件内不直接发请求。

---

## 3. 技术设计逐 Workbench 章节填法（对应 SKILL.md Step 3 的 §3/§4/§6/§7/§9）

分层模式：pages → components → hooks → api 封装层；目录 `src/{pages,components,hooks,api,types}`。

- §3 代码结构：按 `src/{pages,components,hooks,api,types}` 列出新增/修改的页面、组件、hook、api 函数和类型。
- §4 数据模型分析：引用接口消费规范；说明接口响应到界面状态（useState、useReducer）的映射；业务数据以后端为准，不在前端持久化。
- §6 组件与实现：页面只做编排与路由；组件只做展示与交互；hook 承载状态与副作用并调用 api 层；api 层封装 backend 调用与错误转换。
- §7 错误处理：api 层统一转换错误；页面处理加载态、空态、错误态；超时与重试策略写在此处。
- §9 测试策略：组件渲染、主要交互流程、加载态/空态/错误态、接口调用（mock backend 契约）。

---

## 4. 任务切片划分（对应 SKILL.md Step 4）

- 切片形态：一个切片是一个用户可见能力，即页面或组件 → hook → api 调用 → 测试。
- 共享基础任务：路由、api 封装、错误边界。
- 须单独成任务的 HIGH_RISK 改动：涉及对话校对结果展示与"已保存"提示的改动（受 F-03 约束，用户明确确认前不得提示"已保存"）。
- 跨任务的集成验证：覆盖主要交互流程的测试，可单独成集成验证任务。

---

## 5. Workbench schema / 设计红线（对应 SKILL.md Guardrail「Workbench 红线违反」）

BLOCK：

- F-01：前端不得保存任何密钥或凭证，不得直连外部服务或存储；只通过 backend 的 HTTP 接口取数。
- F-03：对话界面必须清楚展示待校对的解析结果，用户明确确认前不得提示"已保存"。
- 组件和页面内不得直接请求接口，所有调用经 api 封装层。
- 页面层不得直接请求接口；组件层不得持有业务规则；hook 层不得操作 DOM 样式。
- 任何密钥、凭证只放环境变量或配置中心，不得写入代码、日志、仓库。

WARN：

- F-02：不在浏览器本地存储敏感数据。
