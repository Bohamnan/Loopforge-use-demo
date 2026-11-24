# backend Workbench — 架构设计参考

> 本文件由 architecture-advisor 在 role=backend 时加载，回答"本 Workbench 具体怎么设计"，
> 与 SKILL.md 的通用流程配合使用。

---

## 0. Workbench 设计画像

- 数据存储职责：有（has_storage=true）。数据库为 SQLite（本地单文件）；原始简历文件存放在项目 file 目录，数据库记录保存文件路径等关联信息。SKILL.md Step 2.1 须执行。
- Step 2.2 设计形态：对外 REST over HTTP/JSON，契约由 OpenAPI 描述；有文件上传时用 multipart/form-data。
- 产出文件命名：`02_schema/sql_ddl_{xxx}.md`（SQLite DDL，必要时配 `sql_dml_{xxx}.md`）；`03_api/api_design_{xxx}.md`。

---

## 1. Schema 设计规范（对应 SKILL.md Step 2.1）

- 命名约定：SQLite 表名、字段名使用小写下划线（snake_case）；具体表结构在技术设计阶段确定。
- 必备/审计字段：持久化实体须含 `id`、`created_at`、`updated_at`。
- 字段类型：SQLite 为动态类型，设计时仍须显式声明列类型（INTEGER、TEXT、REAL、BLOB 等）并写明可空性；时间用 ISO 8601 UTC 文本。
- 存储设计原则：简历记录与原始文件关联（记录中保存文件路径，文件存放于项目 file 目录）；保存记录与保存文件须保持一致（见 B-05）；按查询模式建索引；须写明保留期与清理策略。具体表结构在技术设计阶段确定。

### 1.1 结构化产出骨架（Schema 文档应覆盖的维度）

Schema 文档须覆盖以下维度（来自 design_profile.schema_dimensions）：

1. 实体与关系（含简历记录与原始文件的关联）
2. 字段类型与可空性
3. 审计字段（id、created_at、updated_at）
4. 索引
5. 保留期与清理策略

固定章节：表结构概览表 + 字段详情表 + DDL 语句（SQLite 语法）+ 实体关系说明。

---

## 2. 接口/管道设计规范（对应 SKILL.md Step 2.2）

接口设计文档须覆盖以下维度（来自 design_profile.interface_dimensions）：路径与方法、请求与响应模型、错误响应、幂等性、分页、超时与重试、契约版本。

约定：

- 路径前缀 `/api/v1`，资源名用复数名词，动作用 HTTP 方法表达。
- 请求与响应为 JSON，字段 snake_case，时间用 ISO 8601 UTC；有文件上传时用 multipart/form-data。
- 错误响应统一为 `{code, message, request_id}`，HTTP 状态码表达错误类别，业务码用字符串。
- 每个接口含：方法+路径、功能+关联 REQ、请求参数（类型、必填、校验）、响应（成功+失败）、示例、错误码。

---

## 3. 技术设计逐 Workbench 章节填法（对应 SKILL.md Step 3 的 §3/§4/§6/§7/§9）

技术栈：Python 3.11、FastAPI、Pydantic v2、SQLite。分层：api → services → repositories / clients；schemas 贯穿各层。

- §3 代码结构：按 `src/app/{api,services,repositories,clients,schemas,core}` 列出新增/修改的模块；测试放 `tests/`，与 src 同构。
- §4 数据模型分析：引用 02_schema 的结构与关系、索引策略；说明简历记录与原始文件的关联方式。
- §6 组件与实现：api（路由、入参校验、响应转换）→ services（编排业务流程）→ repositories（存储读写）/ clients（对外调用，负责超时、重试、脱敏日志）。
- §7 错误处理：业务异常继承统一的 AppError，技术异常在 clients 层捕获并转换；统一错误体见 03_api。
- §9 测试策略：覆盖单元（pytest）、接口契约（TestClient 加 OpenAPI 校验）、外部调用（mock 或录制回放）、数据验证（落库内容断言）、异常路径、安全（无密钥、日志脱敏）。

对外调用依赖：DeepSeek flash（简历内容解析与结构化抽取，经 clients 层调用）。
TODO: 照片文字识别方式待核实（brief:backend.key_dependencies）

---

## 4. 任务切片划分（对应 SKILL.md Step 4）

- 纵向切片：一个切片是一个纵向能力：schema → service → api → 测试。
- 共享前置基础任务：配置加载、日志、错误类型、对外调用客户端。
- HIGH_RISK（须单独成任务）：涉及 B-04（确认后才入库）、B-05（记录与文件一致）、B-06（简历属个人敏感信息，仅发往批准清单内的模型服务）的改动。
- 集成验证任务：跨接口的完整流程（上传 → 解析 → 校对确认 → 入库）可单独成集成验证任务。

---

## 5. Workbench schema / 设计红线（对应 SKILL.md Guardrail「Workbench 红线违反」）

以下条目为 BLOCK 级：

- B-01：密钥、凭证只放环境变量或配置中心，不进代码、日志、仓库、测试夹具。
- B-02：数据不得发往批准清单之外的外部服务；对外调用只经 clients 层。
- B-03：日志与错误响应不得包含用户提交内容原文或敏感个人信息。
- B-04：解析结果必须经用户在对话中确认后才能写入数据库；识别不到或不确定的字段必须请用户补充，不得猜测补全。
- B-05：每条简历记录必须关联其原始文件（文件存放于项目 file 目录），保存记录与保存文件须保持一致，不得出现有记录无文件或有文件无记录。
- B-06：简历属个人敏感信息，仅允许发送给批准清单内的模型服务；测试与样例只用合成或脱敏简历，不得提交真实简历。

分层红线：

- api 层禁止：业务判断、直接访问存储或外部服务。
- services 层禁止：拼接存储语句、直接依赖具体外部服务的 SDK。
- repositories 层禁止：业务判断。
- clients 层禁止：业务判断。
