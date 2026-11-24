# backend Workbench — 代码审查参考

> 本文件由 code-reviewer 在 role=backend 时加载，回答"本 Workbench 审查时具体查什么"，
> 与 SKILL.md 的五个审查维度配合使用。具体仓库分层以 `{code_roots.backend}` 下最近的
> `AGENTS.md` / `CLAUDE.md` 为准。

---

## 1. 本 Workbench 架构/分层合规检查项（对应 SKILL.md 维度 1）

分层：api → services → repositories / clients；schemas 贯穿各层。目录：`src/app/{api,services,repositories,clients,schemas,core}`。

各层职责与禁止事项：

- api：职责为路由、入参校验、响应转换。禁止业务判断、直接访问存储或外部服务。
- services：职责为编排业务流程。禁止拼接存储语句、直接依赖具体外部服务的 SDK。
- repositories：职责为存储读写（SQLite）。禁止业务判断。
- clients：对外调用的唯一出口（第三方 API、模型服务等），负责超时、重试、脱敏日志。禁止业务判断。

BLOCK 级约束检查点：

- B-02：数据不得发往批准清单之外的外部服务；对外调用只经 clients 层。
- B-04：解析结果必须经用户在对话中确认后才能写入数据库；识别不到或不确定的字段必须请用户补充，不得猜测补全。
- B-05：每条简历记录必须关联其原始文件，保存记录与保存文件须保持一致，不得出现有记录无文件或有文件无记录。

接口契约：路径前缀 `/api/v1`；错误体统一为 `{code, message, request_id}`；契约由 OpenAPI 描述，变更须经 cross-workbench-reviewer 审视。

---

## 2. 本 Workbench 业务逻辑高风险模式（对应 SKILL.md 维度 2）

以下变更判为 HIGH_RISK，要求更强证据：

- 解析结果入库前的确认流程（B-04）：是否存在未经用户确认即写库的路径；不确定字段是否被猜测补全。
- 简历记录与原始文件的一致性（B-05）：保存记录与保存文件是否同成同败；失败回滚后是否残留孤立文件或孤立记录。
- 向模型服务发送简历内容（B-06）：目标是否在批准清单内。
- 文件上传：多种文件类型（PDF、照片等）的处理分支、空文件、超大文件、不支持的类型。
- 边界条件：空集合、不存在的资源、重复上传、对话中途放弃。

无 Ticket 上下文时，不得对业务规则的正确性下结论。

---

## 3. 本 Workbench 编码规范重点（对应 SKILL.md 维度 3）

- 命名：遵循 PEP 8，模块与函数 snake_case，类 PascalCase，常量 UPPER_SNAKE；Pydantic 模型以 Request、Response、Dto 结尾。
- 注释：代码注释与 docstring 使用英文。
- 错误处理：业务异常继承统一的 AppError，技术异常在 clients 层捕获并转换；禁止裸 except 与吞异常。
- 日志：结构化日志；不输出用户提交内容原文和敏感个人信息；每条请求带 request_id。
- 公共基类：无（新项目不预设公共基类）。
- 审计字段：持久化实体含 id、created_at、updated_at。
- 查询过滤：无特殊过滤约定。
- 可维护性：避免重复、魔法值、不可测试的结构。

---

## 4. 本 Workbench 安全检查项（对应 SKILL.md 维度 4）

- B-01：密钥、凭证只放环境变量或配置中心，不进代码、日志、仓库、测试夹具；两个 Workbench 都不得写入代码、日志、仓库。
- B-02：数据不得发往批准清单之外的外部服务；对外调用只经 clients 层。
- B-03：日志与错误响应不得包含用户提交内容原文或敏感个人信息。
- B-06：简历属个人敏感信息，仅允许发送给批准清单内的模型服务；测试与样例只用合成或脱敏简历，不得提交真实简历。
- 输入验证：入参经 Pydantic 校验；文件上传须校验类型与大小。
- 存储访问：SQL 使用参数绑定，不拼接 SQL 字符串。
- 外部调用可信边界：模型服务调用须设超时与重试，并脱敏日志。
- TODO: 照片文字识别方式待核实（brief:backend.key_dependencies）

---

## 5. 本 Workbench 测试覆盖门槛（对应 SKILL.md 维度 5）

测试证据须覆盖 design_profile.test_dimensions，并要求 B-04、B-05 必须有测试覆盖；不设数值门槛。 ⚠️ 推断无文档依据

测试维度：

- 单元（pytest）
- 接口契约（TestClient 加 OpenAPI 校验）
- 外部调用（mock 或录制回放）
- 数据验证（落库内容断言）
- 异常路径（外部调用超时、非法输入、边界值）
- 安全（无密钥、日志脱敏）

验证命令：`pytest -q`；`ruff check .`；`ruff format --check .`；`python -m compileall -q src`。
