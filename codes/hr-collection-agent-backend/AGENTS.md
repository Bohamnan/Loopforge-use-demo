# hr-collection-agent — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 待复核（设计有更新） |
| 版本 | v1（技术设计后补全） |
| 来源 | [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（HR_PR-1）；工作台 backend 规范与架构参考；v1 补全依据 [design.md](../../backend-docs/HR_PR-1/04_design/design.md)、[sql_ddl_resume.md](../../backend-docs/HR_PR-1/02_schema/sql_ddl_resume.md)、[openapi.yaml](../../backend-docs/HR_PR-1/03_api/openapi.yaml)（0.1.1）、[tasks.md](../../backend-docs/HR_PR-1/05_task/tasks.md) |
| 最后更新 | 2026-11-10（v1 补全，待 Dev Lead 复核后改回“已确认”） |

## 项目定位

HR 人力信息收集后端服务：接收简历文件、调用获批模型解析、支持对话校对，并在用户确认后归档结构化简历及原始文件。对应 backend Workbench。

## 技术栈

| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | Python 3.11 | 工作台项目上下文与 backend 架构参考 |
| 框架 | FastAPI、Pydantic v2 | 工作台项目上下文与 backend 架构参考 |
| 数据存储 | SQLite；原始简历存放在项目 `file` 目录；未确认草稿存于正式数据库之外的本地临时存储 | HLD §2；backend `database.md`；ADR-003 |
| 依赖管理 | uv + `pyproject.toml`；`uv lock` 锁定精确版本；运行依赖 `fastapi`、`uvicorn`、`pydantic`、`pydantic-settings`、`httpx`、`python-multipart`，开发依赖 `pytest`、`pytest-cov`、`ruff`、`jsonschema`、`pyyaml` | C-15；design §1“依赖清单”；DL 2026-11-10 采纳 `pyyaml`、`pytest-cov` |
| 数据访问 | 标准库 `sqlite3`，不引入 ORM；写事务 `BEGIN IMMEDIATE` | design §1“持久化访问” |
| 其他关键依赖 | 获批的 DeepSeek Flash（模型标识：`deepseek-flash`），仅由 `clients` 层调用；供应商不得用简历输入训练 | HLD §2；ADR-001 |

## 目录结构

```text
codes/hr-collection-agent-backend/
├── pyproject.toml           # uv 工程清单（依赖精确版本、pytest/ruff 配置）
├── uv.lock                  # 锁定文件（提交）
├── .env.example             # 环境变量样例，仅占位符
├── src/app/
│   ├── main.py              # create_app()：装配路由、中间件、异常处理、lifespan；无业务
│   ├── api/                 # 路由（routes/）、deps、cookies、error_handlers、middleware
│   ├── services/            # 业务流程编排；upload_validation、field_validation、identity_key、ParseNormalizer、Draft/Resume/Cleanup/Reconcile 服务
│   ├── repositories/        # SQLite 读写与文件存储（Draft/Resume Repository、DraftFileStore、ArchiveFileStore）
│   ├── clients/             # ResumeParserClient 抽象、DeepSeekClient、prompts
│   ├── schemas/             # 请求、响应及领域模型（Pydantic v2）
│   └── core/                # config、errors、logging、clock、ids、db、lifecycle
├── tests/                   # 与 src 同构：core/ schemas/ clients/ repositories/ services/ api/ contract/，以及 conftest.py
├── data/                    # 运行期数据（不入库）：drafts.db、resumes.db、drafts/（草稿临时文件）
└── file/                    # 已确认简历原始文件归档（不入库）
```

依据：design §3；O-06。

### 运行期数据位置

| 项 | 默认位置 | 覆盖方式 |
|---|---|---|
| `DATA_DIR` | 仓库内 `data/`，存放 `drafts.db`、`resumes.db`、`drafts/` | 环境变量 `DATA_DIR` |
| `FILE_DIR` | 仓库内 `file/`，存放已确认简历的原始文件（`{resume_id}{ext}`，tmp 名为 `.{id}{ext}.tmp`） | 环境变量 `FILE_DIR` |

- `data/`、`file/`、`.env` 必须加入 `.gitignore`（O-06；任务 1.1 落实），不提交任何运行期数据或真实简历。
- 草稿库与正式库为两个独立 SQLite 文件，无外键（C-12；ADR-003；S§2）；文件名由服务端生成，不使用用户文件名。
- 清理只作用于草稿库与 `data/drafts/`，**永不访问 `file/`**（design §5.5）。

## 分层与职责

- `api`：路由、入参校验、响应转换；不得包含业务判断、直接访问存储或外部服务。
- `services`：编排业务流程；不得拼接存储语句或直接依赖模型服务 SDK。
- `repositories`：存储读写；不得承载业务判断。
- `clients`：第三方 API 与模型服务调用唯一出口，负责超时、重试和脱敏日志；不得承载业务判断。
- `schemas`：贯穿各层，承载 Pydantic v2 请求、响应和领域模型。
- 依赖方向：`api → services → repositories / clients`。

## 命名与编码约定

- 遵循 PEP 8：模块/函数使用 `snake_case`，类使用 `PascalCase`，常量使用 `UPPER_SNAKE_CASE`。
- Pydantic 模型以 `Request`、`Response` 或 `Dto` 结尾。
- 注释与 docstring 使用英文。
- 详细规范见工作台 [coding.md](../../rules/backend/coding.md)。

## 接口与数据约定

- 对外接口采用 REST over HTTP/JSON，路径前缀 `/api/v1`，契约由 backend 维护并使用 OpenAPI 描述。
- 文件上传使用 `multipart/form-data`；JSON 字段使用 `snake_case`，时间使用 ISO 8601 UTC。
- 统一错误体为 `{code, message, request_id}`，可选 `details: [{field, reason}]`（D-06）；HTTP 状态码表达错误类别，`code` 为字符串业务码（13 个，见 OpenAPI `ErrorCode`）。`details` 只含字段名与原因代码（`required`、`invalid_format`、`invalid_type`、`too_long`、`unknown_field`），不回显用户填写的值；错误信息不得包含简历原文、敏感个人信息或内部细节。
- 前后端简历上传、草稿恢复/更新、确认保存的高层契约见工作台 [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md) §4；字段类型、路径细节以冻结的 [openapi.yaml](../../backend-docs/HR_PR-1/03_api/openapi.yaml)（0.1.1）为准，字段长度上限、手机号/邮箱 `pattern` 以其为唯一来源；变更须经 cross-workbench-reviewer（C-13）。
- 草稿由 HttpOnly Cookie `draft_token`（`HttpOnly; SameSite=Lax; Path=/`，7 天滑动续期，默认不加 `Secure`）定位；令牌库内只存 SHA-256（C-06；design §1）。
- SQLite 表名及字段名使用 `snake_case`；持久化实体含 `id`、`created_at`、`updated_at`；SQL 使用参数绑定。

## 构建、运行与测试

| 动作 | 命令 |
|---|---|
| 依赖管理 | uv + `pyproject.toml`；`uv lock` 锁定精确版本（`==`），不使用开放区间（C-15；design §1） |
| 安装依赖 | `uv sync`（按 `uv.lock` 安装，使用 uv 默认索引，即公共 PyPI） |
| 运行 | `uv run uvicorn --app-dir src app.main:create_app --factory --workers 1 --host 127.0.0.1 --port 8000`（需先设置环境变量，见下；`--workers 1` 为硬性要求） |
| 编译检查 | `uv run python -m compileall -q src` |
| 测试 | `uv run pytest -q`（覆盖率：`uv run pytest --cov=app`） |
| 静态检查 | `uv run ruff check .` |
| 格式检查 | `uv run ruff format --check .` |

### 依赖安装约定（项目例外）

- **不使用私有 Nexus**：DL 于 2026-11-10 决定，本项目依赖使用 uv 默认索引（公共 PyPI）在本地直接安装，**不配置私有索引或索引凭证**。这是对全局规范“依赖经私有 Nexus 安装”的**项目级例外**，仅适用于本项目。
- 新增第三方依赖前须评估安全性（维护状态、已知漏洞、名称是否可疑），移除未使用依赖；`uv.lock` 不得包含带凭证的 URL。
- 不得引入 ORM、图像库、调度库（design §1）；新增依赖须先经 Dev Lead 同意。

### 运行形态

- **仅支持单进程单 worker**（`--workers 1`）：清理线程、SQLite 单写者、启动对账都按单进程设计（C-06；design §1“运行形态约束”）。
- 启动顺序（`lifespan`）：创建目录 → 初始化两个库（`user_version=1`）→ 启动对账 → 清理一次 → 启动清理调度线程（每 3600 秒，O-07）→ 开始接收请求（design §5.4）。
- 路由使用同步 `def` 端点，`httpx` 用同步客户端（ADR-002）。
- 默认监听 `127.0.0.1:8000`；前端同源经 Vite dev proxy 转发 `/api`，无需 CORS（C-06）。

### 环境变量（只列变量名与用途，真实值只放环境变量或本地 `.env`，不得提交）

| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 模型服务凭证（密钥，B-01；缺失时启动不阻止，首次调用返回 `parse_unavailable`） |
| `DEEPSEEK_BASE_URL` | 模型服务地址 |
| `DEEPSEEK_MODEL` | 模型标识，默认 `deepseek-flash` |
| `DATA_DIR` | 运行期数据目录（`drafts.db`、`resumes.db`、`drafts/`） |
| `FILE_DIR` | 已确认简历原始文件归档目录 |
| `MODEL_TIMEOUT_SECONDS` | 模型读超时秒数，默认 60（C-08） |
| `DRAFT_TTL_DAYS` | 草稿无活动保留天数，默认 7 |
| `CLEANUP_INTERVAL_SECONDS` | 清理调度间隔秒数，默认 3600（O-07） |
| `COOKIE_SECURE` | 是否给 `draft_token` 加 `Secure`，默认 `false`（C-06，本地 HTTP） |

仓库只提供仅含占位符的 `.env.example`；`.env` 加入 `.gitignore`（B-01）。依据：design §3.1、§1“配置来源”。

## 红线

- B-01：密钥、凭证只放环境变量或配置中心，不得进入代码、日志、仓库或测试夹具。
- B-02：简历数据只能发往批准清单内的模型服务；所有外部调用经 `clients` 层。
- B-03：日志和错误响应不得包含用户提交原文或敏感个人信息。
- B-04：用户明确确认且姓名、手机号、邮箱均齐全前，不得将简历写入正式数据库；未识别/不确定信息不得猜测补全。
- B-05：已归档的每条简历记录必须关联原始文件；保存失败不得留下孤立文件或记录。
- B-06：简历属于敏感个人信息；供应商不得用于模型训练；测试只用合成或脱敏数据。
- 未确认草稿与正式简历数据库分离，服务端本地暂存，7 天无活动后清理；不在浏览器持久化简历内容。
- 正式记录和原始文件无自动到期清理；用户删除功能不属于 HR_PR-1。
- 禁止裸 `except` 或吞异常；模型客户端技术异常须显式转换为应用错误并脱敏。
- 日志只记白名单字段（`request_id`、`draft_id`、`resume_id`、状态码、耗时、业务码、异常类名）；文件名、字段值、模型响应、令牌一律不记（B-03；design §1“日志策略”）。
- 保存顺序：复制到 tmp → 单事务写库 → 原子重命名；启动时对账；幂等键为规范化的 姓名+手机号+邮箱（ADR-005、ADR-004）。

## 待确认清单

| 序号 | 内容 | 状态 | 依据 / 原因 |
|---|---|---|---|
| 1 | 依赖管理器、安装及本地启动命令 | ✅ 已关闭 | C-15；design §1“依赖清单”“运行形态约束”；DL 2026-11-10 决定使用 uv 默认索引、不使用 Nexus（见“构建、运行与测试”） |
| 2 | SQLite 文件、临时草稿目录及归档目录的位置 | ✅ 已关闭 | O-06；S§2（`data/drafts.db`、`data/resumes.db`、`data/drafts/`、`file/`，环境变量可覆盖）；清理故障处理见 design §5.5（失败只记日志，7 天兜底） |
| 2a | 目录的部署权限、磁盘加密、生产部署位置 | ⏳ 保留 | 本期为 localhost POC；磁盘加密与部署权限属部署负责人核实（design §9.5；HLD §8 假设 3）。确认人：Dev Lead/部署负责人；时机：部署设计 |
| 3 | 模型 API 超时、重试、单请求响应时限 | ✅ 已关闭 | C-08；design §1“模型超时的实现”（`httpx.Timeout(connect=5, write=30, read=60, pool=5)`，不自动重试）；失败映射见 design §7.2（DL 已采纳） |
| 3a | 约 5 人并发下的实际处理能力 | ⏳ 保留 | 需在集成环境实测，未实测前不声明满足（design §9.5；任务 3.2/3.3）。确认人：Backend 工程师 |
| 4 | DeepSeek 实际环境的文件输入形态、供应商留存配置与授权证明 | ⏳ 保留 | 依赖真实凭证与供应商确认：凭证由 DL 在实施阶段经环境变量提供；无凭证时任务 1.8 的 spike 标为“待核实”（C-01；ADR-001）。确认人：Dev Lead；时机：集成前核验 |
| 5 | 跨文件系统归档和 SQLite 写入失败时的恢复/补偿细节 | ✅ 已关闭 | ADR-005；S§4.1/§4.2；design §5.3、§5.4、§9.3（tmp 同目录同卷、提交前失败清 tmp、提交后失败启动 roll-forward） |
