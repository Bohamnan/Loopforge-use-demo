# backend Workbench — 功能开发参考

> 本文件由 feature-developer 在 role=backend 时加载，回答"本 Workbench 具体怎么定位/实现/验证"，
> 与 SKILL.md 的 Gather-Act-Verify 循环配合使用。
> 注意：本文件是**Workbench 级**参考；具体仓库的结构与约定以 `{code_roots.backend}/AGENTS.md` 为准（更细、更权威）。

---

## 1. GATHER 策略（对应 SKILL.md Step 1）

design.md 未给出路径时，用以下命令搜索相关代码（只列文件名）：

```
grep -rln "{keyword}" src/ --include=*.py
find src/app -name "*{keyword}*.py" -not -path "*/__pycache__/*"
```

入口目录：`src/app/api/`。

收集清单：

- 入口：api 路由与入参模型
- 业务逻辑：services
- 存储访问：repositories
- 对外调用：clients
- 数据模型：schemas
- 现有测试：`tests/`（与 src 同构）

---

## 2. ACT 实现顺序与分层职责（对应 SKILL.md Step 2）

分层模式：api → services → repositories / clients；schemas 贯穿各层。

推荐实现顺序（自底向上）：schemas → repositories / clients → services → api → 测试。

各层职责：

- schemas：请求、响应与领域模型（Pydantic v2），命名以 Request、Response、Dto 结尾。
- repositories：存储读写（SQLite）。禁止业务判断。
- clients：对外调用的唯一出口（第三方 API、模型服务等），负责超时、重试、脱敏日志。禁止业务判断。
- services：编排业务流程。禁止拼接存储语句、直接依赖具体外部服务的 SDK。
- api：路由、入参校验、响应转换。禁止业务判断、直接访问存储或外部服务。

---

## 3. VERIFY 命令（对应 SKILL.md Step 3）

必须通过（失败即 BLOCK）：

```
python -m compileall -q src
```

尽力执行（失败按 SKILL.md 失败处理表）：

- 只跑指定测试：`pytest -q {file}::{test_name}`
- 本 Workbench 全量测试：`pytest -q`
- 静态检查：`ruff check .`
- 格式检查：`ruff format --check .`

---

## 4. Workbench 红线 / 边界检查清单（对应 SKILL.md Guardrail「高风险修改」「Workbench 模式混用」与 VERIFY 边界检查）

BLOCK 级技术硬红线：

- B-01：密钥、凭证只放环境变量或配置中心，不进代码、日志、仓库、测试夹具。
- B-02：数据不得发往批准清单之外的外部服务；对外调用只经 clients 层。
- B-03：日志与错误响应不得包含用户提交内容原文或敏感个人信息。
- B-04：解析结果必须经用户在对话中确认后才能写入数据库；识别不到或不确定的字段必须请用户补充，不得猜测补全。
- B-05：每条简历记录必须关联其原始文件（文件存放于项目 file 目录），保存记录与保存文件须保持一致，不得出现有记录无文件或有文件无记录。
- B-06：简历属个人敏感信息，仅允许发送给批准清单内的模型服务；测试与样例只用合成或脱敏简历，不得提交真实简历。

分层红线：不得越层调用（api 不直接访问存储或外部服务；services 不拼接存储语句）。

VERIFY 边界检查：空值与空集合、不存在的资源、外部调用超时、非法输入、重复提交。

HIGH_RISK 判定：涉及 B-04、B-05、B-06 的改动，以及对外调用（clients 层）的改动。

对外调用依赖：DeepSeek flash（简历内容解析与结构化抽取）。
TODO: 照片文字识别方式待核实（brief:backend.key_dependencies）
