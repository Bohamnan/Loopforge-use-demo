# hr-collection-agent — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 待复核（设计有更新） |
| 版本 | v2（HR_PR-1 v2 设计后增量补全，待 Dev Lead 复核） |
| 来源 | [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（HR_PR-1）；工作台 backend 规范与架构参考；v1 补全依据、v2 增量依据（design.md v0.4、sql_ddl_resume.md v0.2.0）[design.md](../../backend-docs/HR_PR-1/04_design/design.md)、[sql_ddl_resume.md](../../backend-docs/HR_PR-1/02_schema/sql_ddl_resume.md)、[openapi.yaml](../../backend-docs/HR_PR-1/03_api/openapi.yaml)（**0.2.0**，v2 冻结）、[tasks.md](../../backend-docs/HR_PR-1/05_task/tasks.md) |
| 最后更新 | 2026-11-11（HR_PR-1 v2 任务 8a：会话/对话/归档/确认更新落地到仓库约定，尚未改代码；此前 2026-11-10：任务 2.6/2.7：清理与启动编排，对账运行约束与运维处置；此前：存储加固：SQLite ≥ 3.35 要求；此前：任务 1.8 审查修复：模型与外发地址锁定；此前任务 1.8：依赖清单增加 `pypdfium2`，日志白名单增加 token 用量；此前：第一批审查后修订） |

### 变更履历

| 日期 | 变更 | 驱动 |
|------|------|------|
| 2026-11-11 | **v2（8a，待复核）**：契约 0.1.1 → 0.2.0（13 个接口、19 个错误码，Cookie `draft_token` → `browser_id`）；目录结构（会话 / 对话 / 归档 / 确认更新新增文件，`draft_*` → `session_*`）；环境变量删除 `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS`；启动顺序改为“目录 → 初始化（drafts v2 升级）→ 对账 → 孤儿清扫一次”，无后台线程；日志白名单 `draft_id` → `session_id` 并新增 `message_id`；红线更新（会话永久保存至手动删除、正式记录仅经显式确认更新覆盖、对话链路不得触发保存、对外监听前须补访问控制）；更新文件名 `<resume_id>-<suffix8><ext>` 与对账“陈旧旧版文件”规则；`scripts/self_test_live.py` 的处置 | design.md v0.4 附录 C；HR_PR-1 v2 重跑清单 8a；DL 2026-11-11 确认技术设计 |
| 2026-11-10 | 任务 2.7：写明对账只在启动时同步运行一次（不得在运行期或调度线程调用）；登记情形④的运维处置、对账保险丝（无记录时不删终态文件）与读取顺序 | 第八批审查 2.7 前置要求、SUGGEST-1~4 |
| 2026-11-10 | 第一批审查后修订：日志白名单补 `count`、`stack`；命名条款补与 OpenAPI 同名模型的例外 | 审查 SUGGEST-5、QUESTION-1 |
| 2026-11-10 | 存储加固：SQLite 版本要求 ≥ 3.35 与启动检查（DL：本机部署，沿用 Python 自带 SQLite）；`DraftFileStore` 拒绝符号链接；`ArchiveFileStore.promote` 不覆盖 | 第四批审查 SUGGEST-1/2/3；DL 裁决 |
| 2026-11-10 | 任务 1.8 审查修复：环境变量 `DEEPSEEK_MODEL` 只能为 `deepseek-flash`、`DEEPSEEK_BASE_URL` 只允许 `https://api.deepseek.com`；PDF 处理 20 秒上限；提示词起止标记 | 第二批审查 BLOCK-1、QUESTION-1；DL 裁决 |
| 2026-11-10 | 任务 1.8：依赖清单增加 `pypdfium2`；日志白名单增加 `prompt_tokens`、`completion_tokens`；模型调用说明补充 PDF 本地转换 | DL 裁决（deepseek-flash 不接受 PDF，PDF 在 backend 本地转换后提交） |

## 项目定位

HR 人力信息收集后端服务：接收简历文件、调用获批模型解析、支持分区校对与**对话校对**（模型只给“建议”，由用户应用），在用户明确确认后归档结构化简历及原始文件，并提供**归档只读查询 / 原文件下载**与**显式确认的更新覆盖**。会话（含对话记录）按浏览器标识归属、永久保存，仅可手动删除（ADR-008）。对应 backend Workbench。

## 技术栈

| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | Python 3.11 | 工作台项目上下文与 backend 架构参考 |
| 框架 | FastAPI、Pydantic v2 | 工作台项目上下文与 backend 架构参考 |
| 数据存储 | SQLite；原始简历存放在项目 `file` 目录；会话与对话记录（`sessions`、`chat_messages`、`chat_suggestions`）存于独立的 `drafts.db`（`user_version=2`），正式简历存于 `resumes.db`（`user_version=1`），两库无外键 | HLD §2；backend `database.md`；ADR-003（v2 修订）、ADR-008 |
| 依赖管理 | uv + `pyproject.toml`；`uv lock` 锁定精确版本；运行依赖 `fastapi`、`uvicorn`、`pydantic`、`pydantic-settings`、`httpx`、`python-multipart`、`pypdfium2`（PDF 文本层提取与页面渲染，Apache-2.0/BSD；不使用 AGPL 的 PyMuPDF）、`pillow`（发送前把图像压成 JPEG，使单次 LLM 请求体 ≤ 1 MB；DL 2026-11-10 批准），开发依赖 `pytest`、`pytest-cov`、`ruff`、`jsonschema`、`pyyaml` | C-15；design §1“依赖清单”；DL 2026-11-10 采纳 `pyyaml`、`pytest-cov` |
| 数据访问 | 标准库 `sqlite3`，不引入 ORM；写事务 `BEGIN IMMEDIATE`；**SQLite 版本须 ≥ 3.35**（仓储使用 `RETURNING`）。本项目只在本机部署，继续使用 Python 自带的 SQLite（本机 3.50.4），不另装数据库服务（DL 决定）；`init_*_db` 启动时检查版本，不满足即启动失败 | design §1“持久化访问” |
| 其他关键依赖 | 获批的 DeepSeek Flash（模型标识：`deepseek-flash`），仅由 `clients` 层调用（解析与对话共用一个出口 `DeepSeekClient`），且只允许该获批模型；对话请求只发结构化字段 JSON、最近历史与本条消息，**不发原始文件与文件名**；该模型 API 只接受图片（webp/png/jpeg/gif），PDF 由 `clients` 层本地转换（文本层优先、PNG 渲染兜底、最多 5 页）后提交；供应商不得用简历输入训练 | HLD §2；ADR-001、ADR-007 |

## 目录结构

```text
codes/hr-collection-agent-backend/
├── pyproject.toml           # uv 工程清单（依赖精确版本、pytest/ruff 配置）
├── uv.lock                  # 锁定文件（提交）
├── .env.example             # 环境变量样例，仅占位符
├── scripts/                 # 手工脚本，不被 pytest 收集：spike_deepseek.py、self_test_live.py（仅 11a 自测演练使用）
├── src/app/
│   ├── main.py              # create_app()：装配 4 个路由模块、中间件、异常处理、lifespan；无业务
│   ├── api/                 # routes/{sessions,chat,session_resume,archive}.py、deps、cookies、error_handlers、middleware
│   ├── services/            # 业务编排：session_service、chat_service、suggestion_validation、field_merge、resume_service、archive_query_service、orphan_sweep_service、reconcile_service；upload_validation、field_validation、identity_key、parse_normalizer
│   ├── repositories/        # SQLite 读写与文件存储（session_repository、chat_repository、resume_repository〔ResumeReader / 写入〕、draft_file_store、archive_file_store）
│   ├── clients/             # ResumeParserClient / ResumeChatClient 抽象、DeepSeekClient、prompts、pdf_renderer、image_prep
│   ├── schemas/             # 请求、响应及领域模型（Pydantic v2）：session、chat、archive、resume、resume_fields、limits 等
│   └── core/                # config、errors、logging、clock、ids、db、lifecycle
├── tests/                   # 与 src 同构：core/ schemas/ clients/ repositories/ services/ api/ contract/ e2e/，以及 conftest.py、fakes.py
├── data/                    # 运行期数据（不入库）：drafts.db（会话与对话）、resumes.db、drafts/（会话临时文件）
└── file/                    # 已确认简历原始文件归档（不入库）
```

依据：design §3；O-06。

### 运行期数据位置

| 项 | 默认位置 | 覆盖方式 |
|---|---|---|
| `DATA_DIR` | 仓库内 `data/`，存放 `drafts.db`（会话与对话）、`resumes.db`、`drafts/`（会话临时文件） | 环境变量 `DATA_DIR` |
| `FILE_DIR` | 仓库内 `file/`，存放已确认简历的原始文件（首次保存 `{resume_id}{ext}`；确认更新后为唯一版本名 `{resume_id}-{suffix8}{ext}`；tmp 名为 `.{id}{ext}.tmp`） | 环境变量 `FILE_DIR` |

- `data/`、`file/`、`.env` 必须加入 `.gitignore`（O-06；任务 1.1 落实），不提交任何运行期数据或真实简历。
- 会话库（`drafts.db`）与正式库为两个独立 SQLite 文件，无外键；唯一的跨库引用是 `sessions.resume_id`（逻辑引用）（C-12；ADR-003；S§2）；文件名由服务端生成，不使用用户文件名。
- **无定时清理**：会话与对话永久保存，只能手动删除；唯一的清理是启动时运行一次的孤儿文件清扫，只作用于 `data/drafts/` 中**不被任何会话引用且超过 1 天宽限**的文件，**永不访问 `file/`**（design §5.5；ADR-008）。
- `drafts.db` 首次以 v2 启动时，在同一事务内丢弃 v1 的 `drafts` 表（v1 草稿不迁移，DL 决定）；`resumes.db` 结构不变。

## 分层与职责

- `api`：路由、入参校验、响应转换；不得包含业务判断、直接访问存储或外部服务。
- `services`：编排业务流程；不得拼接存储语句或直接依赖模型服务 SDK。
- `repositories`：存储读写；不得承载业务判断。
- `clients`：第三方 API 与模型服务调用唯一出口，负责超时、重试和脱敏日志；不得承载业务判断。
- `schemas`：贯穿各层，承载 Pydantic v2 请求、响应和领域模型。
- 依赖方向：`api → services → repositories / clients`。
- **会话归属**：`SessionRepository` 所有按会话 id 的方法签名必须带 `browser_hash`，SQL 条件 `id = ? AND browser_hash = ?`；“不存在”与“不属于本浏览器”统一为 `None` → `session_not_found`，不得提供“只按 id”取会话的方法（ADR-008）。
- **读写分离**：`SessionService`、`ArchiveQueryService` 只依赖只读接口 `ResumeReader`；`create_aggregate` / `replace_aggregate` 只暴露给 `ResumeService`。
- **对话链路不可保存**：`ChatService` 不依赖 `ResumeService`、`ResumeWriter`、`ArchiveFileStore`（结构断言固定，B-04）；对话中“应用建议”与分区 `PATCH` 共用 `field_merge.merge_update`。
- 模型调用不在数据库事务内等待：对话先读快照并关闭连接，调用模型后再用单个 `BEGIN IMMEDIATE` 写回；失败不写任何数据。

## 命名与编码约定

- 遵循 PEP 8：模块/函数使用 `snake_case`，类使用 `PascalCase`，常量使用 `UPPER_SNAKE_CASE`。
- Pydantic 模型以 `Request`、`Response` 或 `Dto` 结尾。
  - 例外：与 OpenAPI components 同名的模型（如 `ResumeFields`、`WorkExperience`、`ErrorDetail`、`OriginalFileInfo`）不受 `Request`/`Response`/`Dto` 后缀限制，以与冻结契约的名称一致为准。
- 注释与 docstring 使用英文。
- 详细规范见工作台 [coding.md](../../rules/backend/coding.md)。

## 接口与数据约定

- 对外接口采用 REST over HTTP/JSON，路径前缀 `/api/v1`，契约由 backend 维护并使用 OpenAPI 描述。
- 文件上传使用 `multipart/form-data`；JSON 字段使用 `snake_case`，时间使用 ISO 8601 UTC。
- 统一错误体为 `{code, message, request_id}`，可选 `details: [{field, reason}]`（D-06）；HTTP 状态码表达错误类别，`code` 为字符串业务码（**19 个**，见 OpenAPI `ErrorCode`；v1 的 `draft_not_found` 改为 `session_not_found`，新增 `session_read_only`、`chat_failed`、`suggestion_unavailable`、`update_not_available`、`resume_not_found`、`file_not_available`）。`details` 只含字段名与原因代码（`required`、`invalid_format`、`invalid_type`、`too_long`、`unknown_field`），不回显用户填写的值；错误信息不得包含简历原文、敏感个人信息或内部细节。
- 前后端简历上传、会话、对话、确认保存 / 更新、归档查询的高层契约见工作台 [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md) §4；字段类型、路径细节以冻结的 [openapi.yaml](../../backend-docs/HR_PR-1/03_api/openapi.yaml)（**0.2.0**，13 个接口：`/sessions` 系列、`.../messages` 与 apply/cancel、`.../resume` POST/PUT、`/resumes` 系列）为准，字段长度上限、手机号/邮箱 `pattern` 以其为唯一来源；变更须经 cross-workbench-reviewer（C-13）。
- 会话归属由 HttpOnly Cookie `browser_id`（`HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`〔400 天，常量〕，默认不加 `Secure`）标识：服务端只接受 `secrets.token_urlsafe(32)` 形态（43 位 `[A-Za-z0-9_-]`），非法按“无标识”；库内只存 SHA-256；仅 2xx 响应下发 / 续期，失败响应不改 Cookie，保存成功**不清除**；旧 `draft_token` 不兼容（C-06；ADR-008；design §1）。
- 会话名称读取时计算；已保存会话的内容读正式库（只含值，不含字段状态）；`pending` 会话冻结更新候选。
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
- 不得引入 ORM、调度库（design §1）；图像库仅限已批准的 Pillow（只用于 `clients/image_prep.py`）；新增依赖须先经 Dev Lead 同意。

### 运行形态

- **仅支持单进程单 worker**（`--workers 1`）：SQLite 单写者、启动对账都按单进程设计（C-06；design §1“运行形态约束”）。**v2 没有任何后台线程**（已取消清理调度线程）。
- 启动顺序（`lifespan`）：创建目录 → 初始化两个库（`drafts.db` 升级到 `user_version=2`，`resumes.db` 保持 1）→ **对账** → **孤儿清扫一次** → 开始接收请求（design §5.4、§1“启动顺序”）。
- **对账约束（B-05）**：`ReconcileService.run()` 只在 `lifespan` 启动阶段**同步**执行一次，完成后才开始接收请求；不得放入后台线程、不得由请求调用（代码里只有 `core/lifecycle.py` 引用它，测试固定）。原因：对账会删除“无记录”的文件，只有在没有其他保存在途时才安全，因此也只支持单进程单 worker。对账与请求处理使用同一份 `DATA_DIR`/`FILE_DIR` 配置，且两个库在对账前已初始化（避免新建空库造成误删）。
- 对账失败（含构造失败）与孤儿清扫失败都不阻止启动，只记录告警；建目录或初始化数据库失败（含 `drafts.db` 版本高于 2）则启动失败。
- **监听范围（X-09）**：服务只监听 `127.0.0.1`，代码不强制；**对外监听前必须先补访问控制**（当前归档列表 / 详情 / 下载接口无登录鉴权）。
- 路由使用同步 `def` 端点，`httpx` 用同步客户端（ADR-002）。
- 默认监听 `127.0.0.1:8000`；前端同源经 Vite dev proxy 转发 `/api`，无需 CORS（C-06）。

### 环境变量（只列变量名与用途，真实值只放环境变量或本地 `.env`，不得提交）

| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 模型服务凭证（密钥，B-01；缺失时启动不阻止，首次调用返回 `parse_unavailable`） |
| `DEEPSEEK_BASE_URL` | 模型服务地址；**只允许 `https://api.deepseek.com`**（可带简单路径前缀，不允许 http、其他主机、端口、userinfo），否则启动失败（B-02） |
| `DEEPSEEK_MODEL` | 模型标识；**只能为 `deepseek-flash`**（ADR-001），其他值（含大小写变体）启动失败；配置错误信息不回显配置值 |
| `DATA_DIR` | 运行期数据目录（`drafts.db`、`resumes.db`、`drafts/`） |
| `FILE_DIR` | 已确认简历原始文件归档目录 |
| `MODEL_TIMEOUT_SECONDS` | 模型读超时秒数，默认 60（C-08；解析与对话相同，均不自动重试） |
| `COOKIE_SECURE` | 是否给 `browser_id` 加 `Secure`，默认 `false`（C-06，本地 HTTP） |

> v2 已**删除** `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS`（无定时清理）；遗留的这两个环境变量被忽略，无副作用。

仓库只提供仅含占位符的 `.env.example`；`.env` 加入 `.gitignore`（B-01）。依据：design §3.1、§1“配置来源”。

## 运维：启动对账告警的处置

对账日志（`reconcile_*` 事件）只含数量与 `resume_id`，不含内容。启动后查看这些事件：

| 事件 | 含义 | 处置 |
|---|---|---|
| `reconcile_record_file_missing`（含 `resume_id`） | 情形④：有记录但 `file/` 里既无终态文件也无 tmp，**程序无法自动修复**，只在每次启动时告警 | 从备份恢复 `file/<resume_id>.<ext>`（文件名必须与记录的 `file_path` 一致）；无备份则由人工决定是否保留该记录。不要删除记录来“消除告警”而不经业务确认 |
| `reconcile_conflicts`（`count`） | 记录同时有 tmp 与终态文件、同 id 但扩展名不同、**记录自己的终态文件不存在而同 id 存在其他版本文件**（确认更新中途中断；此时程序不删唯一一份数据）、或**数据库没有任何记录而 `file/` 下有终态文件**（疑似库被误删/换成空库/配置指向错误目录） | 程序**不删不改**。先核对 `DATA_DIR`、`FILE_DIR` 是否指向正确位置，再人工处理；确认无误后手工清理多余文件 |
| `reconcile_entries_failed` / `reconcile_aborted` | 某条目的重命名/删除失败，或读取记录/目录失败 | 通常为权限或磁盘问题；修复后重启，对账可重复执行 |

对账只在启动时运行；已知窗口见“红线”中的已知限制。

**陈旧旧版文件（确认更新）**：更新后记录指向 `{resume_id}-{suffix8}{ext}`，若在“删旧文件”前中断，旧版文件会残留；只要记录自己的终态文件存在，下次启动对账会自动删除同 id 的旧版文件（`reconcile_conflicts` 为 0），无需人工处理。

## 红线

- B-01：密钥、凭证只放环境变量或配置中心，不得进入代码、日志、仓库或测试夹具。
- B-02：简历数据只能发往批准清单内的模型服务；所有外部调用经 `clients` 层。
- B-03：日志和错误响应不得包含用户提交原文或敏感个人信息；**对话消息、模型回复、建议值、浏览器标识（明文与哈希）一律不入日志**。
- B-04：用户明确确认且姓名、手机号、邮箱均齐全前，不得将简历写入正式数据库；未识别/不确定信息不得猜测补全。**写正式库只有两个入口：首次保存（`confirmed=true`）与确认更新（`confirm_update=true`）；对话与模型输出不得触发保存 / 更新；建议里的姓名 / 手机号 / 邮箱新值必须出现在本条用户消息中，三类经历字段的建议一律丢弃；字段只有经用户“应用”或分区编辑才置 `confirmed`。**
- B-05：已归档的每条简历记录必须关联原始文件；保存失败不得留下孤立文件或记录；确认更新用唯一版本名“先提升、再事务覆盖、后删旧文件”，任一时刻记录指向存在的文件；**手动删除会话不触及正式记录与归档文件**。
- B-06：简历属于敏感个人信息；供应商不得用于模型训练；测试只用合成或脱敏数据。
- 会话（含对话）与正式简历数据库分离，服务端本地保存，**永久保存直到用户手动删除**（无 TTL，ADR-008）；不在浏览器持久化简历内容。
- 正式记录和原始文件无自动到期清理，**无删除接口**；创建后只能通过显式确认更新覆盖（`PUT /sessions/{id}/resume` 且 `confirm_update=true`），不得以其他路径修改。
- 禁止裸 `except` 或吞异常；模型客户端技术异常须显式转换为应用错误并脱敏。
- 日志只记白名单字段（`request_id`、`session_id`、`message_id`、`resume_id`、状态码、耗时、业务码、异常类名、`count`、`stack`、`prompt_tokens`、`completion_tokens`）；`prompt_tokens`/`completion_tokens` 为模型响应 usage 中的数字，仅用于成本监控；`count` 用于对账告警等数量统计；`stack` 只含栈帧（项目相对路径、行号、函数名），不含异常消息和绝对路径，最多 12 帧、2000 字符；文件名、字段值、对话内容、模型回复与响应、浏览器标识与令牌一律不记（B-03；design §1“日志策略”）。
- 保存顺序：首次保存 复制到 tmp → 单事务写库 → 原子重命名；确认更新 唯一版本名 stage → 提升 → 事务覆盖 → 删旧文件；启动时对账（含陈旧旧版文件规则）；幂等键为规范化的 姓名+手机号+邮箱，命中后会话保留更新候选（ADR-005 v2.1、ADR-004 v2.1）。
- 已知限制（第七批审查 SUGGEST-3，仅首次保存路径；更新路径用唯一版本名，无提交后重命名窗口）：对账只在启动时运行；提交后重命名失败的窗口内 `file/` 只有 tmp，用户再次确认会得到 `already_saved=true`，直到重启对账 roll-forward 才补齐终态文件。提交后抛普通异常同样保留 tmp 交给对账（不删除）。
- 跟踪项：第七批 SUGGEST-4（design/openapi 补写 `confirmed` 非布尔 → `confirmation_required`、Pillow 安全公告跟踪方式）、SUGGEST-5（重复分支返回已有 `resume_id`/`saved_at` 可被用于存在性探测；若将来对外暴露需重新评估）。
- 跟踪项（第九批 SUGGEST-1，POC 不做）：对账保险丝只在“零记录”时触发；库被替换成只有少量记录的库时，其余无记录的终态文件仍会被删。若将来对外部署，可加比例保险丝（孤儿终态文件数超过记录数的 N 倍或绝对值时只告警不删）。
- 图像预处理口径：LLM 请求体上限按 10^6 字节计并扣除 4 KB 头部余量（`MAX_REQUEST_BYTES = 995,904`）；源图上限 25,000,000 像素，只解码 PNG/JPEG。

## 待确认清单

| 序号 | 内容 | 状态 | 依据 / 原因 |
|---|---|---|---|
| 1 | 依赖管理器、安装及本地启动命令 | ✅ 已关闭 | C-15；design §1“依赖清单”“运行形态约束”；DL 2026-11-10 决定使用 uv 默认索引、不使用 Nexus（见“构建、运行与测试”） |
| 2 | SQLite 文件、临时草稿目录及归档目录的位置 | ✅ 已关闭 | O-06；S§2（`data/drafts.db`、`data/resumes.db`、`data/drafts/`、`file/`，环境变量可覆盖）；孤儿清扫见 design §5.5（失败只记日志，下次启动重试） |
| 2a | 目录的部署权限、磁盘加密、生产部署位置 | ⏳ 保留 | 本期为 localhost POC；磁盘加密与部署权限属部署负责人核实（design §9.5；HLD §8 假设 3）。确认人：Dev Lead/部署负责人；时机：部署设计 |
| 3 | 模型 API 超时、重试、单请求响应时限 | ✅ 已关闭 | C-08；design §1“模型超时的实现”（`httpx.Timeout(connect=5, write=30, read=60, pool=5)`，不自动重试）；失败映射见 design §7.2（DL 已采纳） |
| 3a | 约 5 人并发下的实际处理能力 | ⏳ 保留 | 需在集成环境实测，未实测前不声明满足（design §9.5；任务 3.2/3.3）。确认人：Backend 工程师 |
| 4 | DeepSeek 实际环境的文件输入形态、供应商留存配置与授权证明 | ⏳ 保留 | 依赖真实凭证与供应商确认：凭证由 DL 在实施阶段经环境变量提供；无凭证时任务 1.8 的 spike 标为“待核实”（C-01；ADR-001）。确认人：Dev Lead；时机：集成前核验 |
| 3b | 对话链路：`deepseek-flash` 能否稳定按固定 JSON 返回并遵守问答范围；对话时延 | ⏳ 保留 | 自动化测试全部用 `FakeChatClient`（D-09）；真实调用只在 11a 自测演练中进行（HLD §8 假设 6）。确认人：Dev Lead；时机：11a |
| 5 | 跨文件系统归档和 SQLite 写入失败时的恢复/补偿细节 | ✅ 已关闭 | ADR-005；S§4.1/§4.2；design §5.3、§5.4、§9.3（tmp 同目录同卷、提交前失败清 tmp、提交后失败启动 roll-forward） |

## 脚本

- `scripts/spike_deepseek.py`：解析链路精度 spike，手工运行，不被 pytest 收集，不变。
- `scripts/self_test_live.py`：对真实 uvicorn 进程和真实模型的开发自测，**不被 pytest 收集、不进 CI**；v1 版本依赖 `draft_token`、`Max-Age=604800`、`cleanup_done` 启动日志，已随 v2 失效，由任务 3.4 按 0.2.0 改造；**只在 11a 自测演练中、凭证由 DL 经本机环境变量提供时运行**，9a 开发阶段不调用真实模型。
