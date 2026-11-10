# 变更记录 — 简历信息收集（Backend，HR_PR-1）

> 每个任务完成后追加（append 语义）。修改文件清单只记在这里。

## Task-1.1：工程初始化（uv、pytest、ruff、.gitignore、测试基座）

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/pyproject.toml | 新增 | uv 工程清单，依赖 == 精确版本，requires-python >=3.11,<3.12，pytest/ruff 配置 |
| codes/hr-collection-agent-backend/uv.lock | 新增 | uv lock 生成（公共 PyPI，无私有索引） |
| codes/hr-collection-agent-backend/.gitignore | 新增 | data/、file/、.env、.venv/、__pycache__/、.pytest_cache/ 等 |
| codes/hr-collection-agent-backend/.env.example | 新增 | 仅占位符 |
| codes/hr-collection-agent-backend/src/app/**/__init__.py | 新增 | api、services、repositories、clients、schemas、core 包骨架 |
| codes/hr-collection-agent-backend/tests/conftest.py | 新增 | 禁网 autouse 夹具、data_dir/file_dir 夹具 |
| codes/hr-collection-agent-backend/tests/helpers.py | 新增 | 合成 PDF/JPEG/PNG 魔数字节 |
| codes/hr-collection-agent-backend/tests/test_scaffold.py | 新增 | 7 个基座冒烟用例 |

### 偏差说明
AGENTS.md 要求安装用 uv 默认索引；.gitignore 放在 codes/hr-collection-agent-backend/ 内（后端代码目录）。pyyaml、pytest-cov 已按 DL 采纳加入开发依赖。按 uv 惯例 [tool.uv] package=false，以 pytest pythonpath=src 导入 app。安全评估：新依赖均为主流维护中的包；uvx pip-audit 对锁定版本报告 No known vulnerabilities found。

### 遗留风险
FakeClock、FakeParserClient 按任务计划分别在 1.2、1.8 补入。

---

## Task-1.2：core：配置、时钟、ID 与令牌工具

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/src/app/core/config.py | 新增 | Settings（pydantic-settings，SecretStr 密钥，目录解析，正数校验） |
| codes/hr-collection-agent-backend/src/app/core/clock.py | 新增 | Clock 协议、SystemClock、format_utc/parse_utc（YYYY-MM-DDTHH:MM:SSZ） |
| codes/hr-collection-agent-backend/src/app/core/ids.py | 新增 | IdGenerator、UuidGenerator、generate_token、hash_token |
| codes/hr-collection-agent-backend/tests/fakes.py | 新增 | FakeClock、SequentialIdGenerator |
| codes/hr-collection-agent-backend/tests/core/test_config.py | 新增 | 配置默认值/覆盖/密钥不泄露/非法值 |
| codes/hr-collection-agent-backend/tests/core/test_clock_ids.py | 新增 | 时钟、ID、令牌与哈希（含 SHA-256 已知向量） |

### 偏差说明
按设计实现。补充：deepseek_base_url 默认值取 DeepSeek 公开地址 https://api.deepseek.com（非密钥，可由环境变量覆盖），design 未指定默认值；FakeClock 放在 tests/fakes.py 而非 conftest.py（便于导入）。

### 遗留风险
base_url 默认值与实际接入地址需在任务 1.8 spike 时核实。

---

## Task-1.3：core：错误模型与安全日志

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/src/app/core/errors.py | 新增 | ErrorCode(13)、IssueReason、FieldIssue、AppError 及 13 个子类、DuplicateIdentityError |
| codes/hr-collection-agent-backend/src/app/core/logging.py | 新增 | JSON 日志、字段白名单 log_event、request_id ContextVar、仅记栈帧不记异常消息 |
| codes/hr-collection-agent-backend/tests/core/test_errors.py | 新增 | 码/状态/文案与冻结 OpenAPI 比对 |
| codes/hr-collection-agent-backend/tests/core/test_logging.py | 新增 | 白名单、JSON、异常脱敏 |

### 偏差说明
按设计实现。补充：日志白名单在 design 列出字段之外增加 count（对账告警含数量，design 5.4 要求）与派生字段 stack（异常栈帧，不含异常消息）；错误体 message 在各 AppError 子类中为固定类属性，构造器不接受自由文本。契约比对测试在找不到 openapi.yaml 时跳过（代码目录可能脱离文档仓库）。

### 遗留风险
无。

---

## Task-1.4：schemas：字段模型与 DTO

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/src/app/schemas/limits.py | 新增 | CR-01/G-01/G-02 上限与 pattern 常量（单一来源） |
| codes/hr-collection-agent-backend/src/app/schemas/resume_fields.py | 新增 | FieldStatus、22 节点 ResumeFields、三类经历、ResumeFieldsUpdate |
| codes/hr-collection-agent-backend/src/app/schemas/draft.py | 新增 | DraftResponse、DraftUpdateRequest、OriginalFileInfo |
| codes/hr-collection-agent-backend/src/app/schemas/resume.py | 新增 | CreateResumeRequest/Response |
| codes/hr-collection-agent-backend/src/app/schemas/errors.py | 新增 | ErrorResponse、ErrorDetail |
| codes/hr-collection-agent-backend/src/app/schemas/parse.py | 新增 | RawParseResult |
| codes/hr-collection-agent-backend/tests/schemas/*.py | 新增 | 字段/上限边界、DTO、与冻结 OpenAPI 0.1.1 的对齐（jsonschema 校验 DraftResponse、字段名与上限常量） |

### 偏差说明
偏差：ResumeFieldsUpdate 在 Pydantic 层不强制 phone/email 的 pattern，只强制类型、minLength、maxLength、maxItems。原因：G-02 要求 backend 校验前先去除空格与连字符作为兜底，若在模型层按提交原值匹配 pattern 会拒绝 138 0013 8000；pattern 常量放在 schemas/limits.py，由任务 1.6 field_validation 在去除空格/连字符后应用，并有测试与 OpenAPI pattern 字符串比对。ResumeFieldsUpdate 缺省键用 None 作缺省值并以 model_fields_set 判定是否出现（核心字段对显式 null 报 string_type）。时间字段以 ISO 文本字符串承载。

### 遗留风险
ResumeFieldsUpdate 的 phone/email 格式依赖 1.6 的 field_validation 才完整生效，1.6 前直接使用该模型不会拒绝格式错误。

---

## Task-1.5：core：SQLite 辅助与两库初始化

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/src/app/core/db.py | 新增 | connect（foreign_keys、busy_timeout）、transaction（BEGIN IMMEDIATE）、init_drafts_db/init_resumes_db（user_version=1，IF NOT EXISTS，拒绝更新版本） |
| codes/hr-collection-agent-backend/tests/core/test_db.py | 新增 | 表/索引/约束/CHECK/外键级联/幂等/事务/写者串行 |
| codes/hr-collection-agent-backend/pyproject.toml | 修改 | ruff 对 db.py 的 E501 豁免（原样 DDL） |

### 偏差说明
按设计实现。DDL 由 sql_ddl_resume.md 的 SQL 块程序化提取并仅去除注释，未手改列定义。补充：init 遇到 user_version 大于支持版本时抛 RuntimeError（design 未规定，防止旧代码操作新库）；连接使用 isolation_level=None，事务全部显式。

### 遗留风险
无。

---

