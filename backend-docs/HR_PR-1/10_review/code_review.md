# Code Review Report — HR_PR-1（backend，第一批：任务 1.1–1.7）

## 1. Review 结论
- Review 模式：Ticket-aware Review
- 持久化：是（本文件）
- 结论：**BLOCKED**（1 BLOCK / 1 QUESTION / 7 SUGGEST）
- Reviewer：Yin Yang（dev-lead，审查 agent 代行；被审查 Workbench：backend）
- 日期：2026-11-10
- 审查对象：已合并到 feature 的 backend 第一批，提交 f13ae9d、8edf837、9da84b5、ca571be、c43113d、6d0764a、b3a1391（基线 feature@dd929b2）
- 上下文限制：
  - 本批只含共享基础（core / schemas / field_validation / identity_key / api 基础），**尚无** clients、repositories、services 编排和四个接口路由。B-02、B-04、B-05 的运行路径本批尚未出现，不能对其下结论；B-04、B-05 的测试覆盖要求只能在任务 2.4 / 2.5 / 3.2 审查时核对。
  - 审查期间未修改任何源码、测试、配置；未更新 `_progress.md`（由主 agent 维护）。
  - `project-memory/review_standards.md`、`security_checklist.md` 不存在，已跳过。

## 2. Review Scope
| 文件 | 变更类型 | 所属仓库/模块 | 对应 Task/REQ/AC | 风险等级 |
|------|----------|---------------|------------------|----------|
| pyproject.toml、uv.lock、.gitignore、.env.example | 新增 | backend 工程 | 1.1 / REQ-BE-06.1、06.6 | 中（依赖、密钥） |
| tests/conftest.py、helpers.py、test_scaffold.py | 新增 | tests | 1.1 | 低 |
| src/app/core/config.py、clock.py、ids.py（+ tests/core、tests/fakes.py） | 新增 | core | 1.2 / REQ-BE-06.1、05.2 | 中（密钥配置、令牌） |
| src/app/core/errors.py、logging.py（+ tests/core） | 新增 | core | 1.3 / REQ-BE-06.3、06.4 | **高**（B-03） |
| src/app/schemas/*.py（+ tests/schemas） | 新增 | schemas | 1.4 / REQ-BE-02.2、03、04、06.4 | 中（接口契约） |
| src/app/core/db.py（+ tests/core/test_db.py） | 新增 | core | 1.5 / REQ-BE-05.1、04.5 | 中（持久化模型） |
| src/app/services/field_validation.py、identity_key.py（+ tests/services） | 新增 | services | 1.6 / REQ-BE-03.4、04.2、04.5 | **高**（幂等键 D-02、接口契约） |
| src/app/main.py、api/{middleware,error_handlers,cookies,deps}.py（+ tests/api） | 新增 | api | 1.7 / REQ-BE-05.2、06.3、06.4 | **高**（B-03、Cookie） |
| backend-docs/HR_PR-1/05_task/{tasks,changelog}.md | 修改 | 文档 | 各任务 | — |

## 3. Evidence Pack
| 证据 | 路径 | 状态 | 说明 |
|------|------|------|------|
| 仓库约定 | codes/hr-collection-agent-backend/AGENTS.md | ✅ 已确认（v1） | 非草稿，无需标注“依据未确认” |
| 需求 | backend-docs/HR_PR-1/01_requirements/requirements.md | ✅ 已读 | |
| 设计 | backend-docs/HR_PR-1/04_design/design.md | ✅ 已读（§1、§3、§5.4、§7） | |
| 任务与变更记录 | 05_task/tasks.md、changelog.md | ✅ 已读 | 1.1–1.7 均标 ✅，与代码一致 |
| 冻结契约 | backend-docs/HR_PR-1/03_api/openapi.yaml（0.1.1） | ✅ 已读 | 字段、pattern、长度上限、13 个业务码逐项比对 |
| Schema | 02_schema/sql_ddl_resume.md（§2.2.1 幂等键规则） | ✅ 已读 | |
| 跨 Workbench 评审 | 01-requirements/HR_PR-1/cross-workbench-review.md、prototype-review.md | ✅ 已读 | 与本批无新增冲突 |
| 架构约束 / ADR | project-memory/architectural_constraints.md、adr_index.md（ADR-001..006） | ✅ 已读 | 本批仅涉及 B-01/B-03/B-06 与 ADR-004 的键规范化 |
| 工程规范 | rules/backend/coding.md | ✅ 已读 | |
| 审查参考 | .github/skills/code-reviewer/references/backend.md | ✅ 已加载 | |
| 走读 / 自测报告 | — | 不存在 | 不阻断 |

## 4. BLOCKING Issues（必须修复才能合并）

### BLOCK-1：手机号校验使用 Python Unicode `\d`，与冻结 OpenAPI pattern、前端校验不一致，并削弱幂等键
**位置**：`src/app/schemas/limits.py:15`（`PHONE_PATTERN`）；`src/app/services/field_validation.py:14`（`re.compile(L.PHONE_PATTERN)` 未加 `re.ASCII`）、`field_validation.py:33`（`fullmatch`）
**证据**：
- OpenAPI `ResumeFieldsUpdate.phone.pattern: '^(1\d{10}|\+\d{6,15})$'`（openapi.yaml:466）。JSON Schema 的 pattern 按 ECMA-262 解释，`\d` 只匹配 ASCII 0–9；前端 `PHONE_PATTERN = /^(1\d{10}|\+\d{6,15})$/`（FieldRules.ts:8）同样只接受 ASCII。
- Python 3 的 `re` 对 `str` 默认 `\d` 匹配全部 Unicode 十进制数字。本人在 worktree 内用只读脚本复现：
  - `validate_core_fields('a', '1'+'٣'*10, 'a@b.c')` 返回 `[]`（通过）。
  - `validate_core_fields('a', '+'+'٣'*8, 'a@b.c')` 返回 `[]`（通过）。
  - `phone_key('1'+'٣'*10)` 返回 `'1٣٣٣٣٣٣٣٣٣٣'`，没有映射成 ASCII 数字。
- 现有测试没有任何非 ASCII 数字用例（`tests/services/test_field_validation.py` 的 `test_valid_phones` / `test_invalid_phones`），`tests/schemas/test_openapi_alignment.py::test_patterns_match_openapi` 只比对 pattern 字符串，比对不出正则引擎的语义差异。
**问题**：backend 接受 OpenAPI 与前端都会拒绝的手机号（阿拉伯-印度数字、全角数字 `１３８…` 等 Unicode 数字）。同一个人用 ASCII 数字与用 Unicode 数字写的手机号会得到不同的 `phone_key`，因此绕过 ADR-004 / D-02 的幂等键，可以产生重复记录；邮箱同理不受影响，但手机号键受影响。
**影响**：违反“与冻结 OpenAPI 的 pattern 一致”和 D-02 的“规范化后判重”；绕过 `uq_resumes_identity` 的判重语义（唯一约束只对字节串有效）。该缺陷发生在本批交付的共享校验单点，后续任务 2.3 / 2.4 会直接复用，越早修越便宜。
**修复建议**：
- `field_validation.py` 中以 `re.ASCII`（或把 `\d` 替换为 `[0-9]`）编译手机号正则；`limits.py` 的 pattern 字符串保持与 OpenAPI 完全一致不变。
- 补测试：全角数字、阿拉伯-印度数字、`+` 后非 ASCII 数字均 → `invalid_format`；`phone_key` 对合法输入的结果为纯 ASCII。
- 同步检查邮箱正则：`[^\s@]` 在 Python 中的 `\s` 含 Unicode 空白，与 ECMA `\s` 基本一致，本次未发现差异，无需改动。
**违反约束**：冻结 OpenAPI 0.1.1 的 `phone.pattern`；AGENTS.md“字段长度上限、手机号/邮箱 pattern 以其为唯一来源”；ADR-004 / D-02（规范化幂等键）。

## 5. QUESTIONS（需要人类裁决）

### QUESTION-1：Pydantic 模型命名后缀（“以 Request、Response、Dto 结尾”）与按 OpenAPI 同名的领域模型冲突
**位置**：`src/app/schemas/resume_fields.py`（`WorkExperience`、`ProjectExperience`、`Education`、`StringField`、`StringListField`、`WorkExperienceListField`、`ProjectExperienceListField`、`EducationListField`、`ResumeFields`、`ResumeFieldsUpdate`）、`schemas/draft.py:12`（`OriginalFileInfo`）、`schemas/errors.py:8`（`ErrorDetail`）
**问题**：AGENTS.md“命名与编码约定”和 `rules/backend/coding.md` §2 都要求 Pydantic 模型以 Request / Response / Dto 结尾。上述模型沿用 OpenAPI schema 名称（design §3.3 与前端 F-02“与 OpenAPI 同名”也这么写），因此与字面规则冲突。AGENTS.md 同时说 `schemas` 承载“请求、响应及领域模型”，规则本身对“领域模型”是否适用并不清楚。
**需要谁裁决**：Dev Lead
**不同答案的影响**：
- 例外（OpenAPI 镜像模型保持原名，规则限定为请求/响应模型）：无需改代码，建议在 AGENTS.md 命名条款里写明例外，避免日后每个审查者重复提出。
- 不例外（统一加 `Dto` 后缀）：本批 12 个 BaseModel 要改名，`tests`、design、前端同名约定都要同步；成本高、收益有限，不建议。

## 6. SUGGESTIONS（不影响合并，建议后续优化）

### SUGGEST-1：非法 JSON 请求体时 `details[].field` 为 `"[1]"`
**位置**：`src/app/services/field_validation.py:78-90`（`_path`）
**现状**：本人复现：`PATCH` 发送 `{bad` 时，`loc=("body", 1)` 经 `_path` 变成字段名 `[1]`、reason `invalid_format`。该值不含用户内容，不构成泄露，但字段名没有意义，前端按 `parseFieldPath` 解析会得到 `null`。
**建议**：`json_invalid` 类错误统一落到 `body`（或 `fields`），测试补充断言（现有 `test_invalid_json_body` 只断言 `code`）。

### SUGGEST-2：兜底 500 响应缺少 `X-Request-ID` 响应头
**位置**：`src/app/api/middleware.py:36-43`、`error_handlers.py:92-96`
**现状**：本人复现：路由内未捕获异常时，响应体含 `request_id`，但响应头没有 `X-Request-ID`（`Exception` 处理器由 Starlette 最外层 `ServerErrorMiddleware` 执行，在 `RequestIdMiddleware` 包装的 `send` 之外）。请求日志里的 `request_id` 与响应体一致，可追溯，不影响 B-03。
**建议**：在 `_handle_unexpected` 里给 `JSONResponse` 补 `headers={"X-Request-ID": …}`，并把现有 `test_request_id_header_matches_body_and_is_unique` 的场景扩到 500。

### SUGGEST-3：`stack` 字段含绝对路径且长度无上限
**位置**：`src/app/core/logging.py:34-37`
**现状**：本人复现一次 500，`stack` 字符串包含 `.venv/…/site-packages/…` 全路径，约 20 帧、数 KB。不含用户数据，符合 design §7.3；但会把本机目录结构（含用户名）写进日志。
**建议**：只保留相对仓库的路径（或仅 `module:lineno in func`），并限制帧数（如最内层 15 帧）。

### SUGGEST-4：`log_event` 只校验字段名，不校验值，`code` 等字段可被写入自由文本
**位置**：`src/app/core/logging.py:44-54`
**现状**：白名单按键名放行，值只要是标量即可，例如 `log_event("x", code=user_text)` 不会被拦截。当前调用点（`error_handlers._log`）传入的都是枚举值，没有问题。
**建议**：后续任务引入 service / client 日志调用前，考虑对 `code`、`exception_class` 做枚举 / 标识符格式校验，或在 code review 清单里固化“只传常量”。

### SUGGEST-5：把本批新增的日志白名单字段同步到 AGENTS.md 红线
**位置**：AGENTS.md“红线”中的白名单列表 vs `core/logging.py:12-14`
**现状**：AGENTS.md 列出 `request_id、draft_id、resume_id、状态码、耗时、业务码、异常类名`；代码额外有 `count`、`stack`。design §5.4（对账告警含数量）与 §3.2 / §7.3（记录异常类型与栈）已要求这两项，所以不是设计偏差，只是 AGENTS 摘要未同步。
**建议**：DL 下次维护 AGENTS.md 时补上，避免后来者误判为越权。

### SUGGEST-6：`test_openapi_alignment.py` 在找不到 `openapi.yaml` 时静默跳过
**位置**：`tests/schemas/test_openapi_alignment.py:12-13`（`pytestmark = skipif(not OPENAPI.exists())`）；`tests/core/test_errors.py:75` 同类
**现状**：本次复跑这些用例都执行了（213 passed，0 skipped）。但 CI 若只检出代码目录，契约比对会悄悄全部跳过，仍显示绿色。
**建议**：任务 3.1 做契约测试时，在 CI 中设“必须存在，否则失败”的开关（环境变量），或把 openapi.yaml 路径缺失视为失败。

### SUGGEST-7：`deepseek_base_url` 默认值写死为 `https://api.deepseek.com`
**位置**：`src/app/core/config.py:16`
**现状**：该值不是密钥，未违反 B-01；DeepSeek 在 ADR-001 批准清单内，未违反 B-02。但 `.env.example` 与 design §3.1 把 `DEEPSEEK_BASE_URL` 列为必须由环境提供的占位符，代码默认值让“配置缺失”与“使用公开地址”无法区分。changelog 已把“实际接入地址需在 1.8 spike 时核实”列为遗留风险。
**建议**：接受当前实现；任务 1.8 spike 核实实际地址后，再决定是否把默认值改为 `None`（缺失即 `parse_unavailable`，更符合“默认阻断”的 ADR-001 精神）。

## 7. 测试与验证证据
| 项目 | 状态 | 说明 |
|------|------|------|
| `uv sync --frozen` | ✅ | 按 `uv.lock` 安装成功（本人在 worktree 复跑） |
| `uv run python -m compileall -q src` | ✅ 退出码 0 | `-q` 无输出，另跑 `compileall -f src` 实际编译 27 个文件，确认有真实编译动作 |
| `uv run pytest -q` | ✅ **213 passed**，1 warning，0 skipped | warning 为 `StarletteDeprecationWarning`（`fastapi.testclient` 使用 httpx），changelog 已登记 |
| `uv run ruff check .` | ✅ All checks passed | |
| `uv run ruff format --check .` | ✅ 54 files already formatted | |
| 数据层断言 | ✅ | `tests/core/test_db.py`（17 个测试函数）直接查 `sqlite_master`、约束、外键级联、`BEGIN IMMEDIATE` 串行 |
| 禁网 | ✅ | `tests/conftest.py` autouse 夹具封 `socket.connect` / `create_connection`，`test_scaffold` 有验证 |
| 本人探测（只读脚本，已删除） | ✅ / ⚠️ | 校验异常、未知字段、500、404 路由均不回显用户值（✅）；暴露 BLOCK-1、SUGGEST-1/2/3 |
| 密钥与真实简历 | ✅ 未发现 | `git ls-files codes/` 无 `.env`、`.venv`、`.pyc`；`.env.example` 仅占位符；测试数据均为合成（`ZZ-…`、`13800138000`、`a@b.cc`）；`uv.lock` 无私有索引或凭证 |
| 覆盖率 | 未测 | 本批未跑 `pytest --cov`，不声明覆盖率达标 |
| B-04 / B-05 测试覆盖 | 不适用（本批无对应代码） | 任务 2.4 / 2.5 / 3.2 审查时必查 |

### 维度结论
| 维度 | 结论 |
|------|------|
| 架构合规 | ✅ 依赖方向 api → services（`error_handlers` 仅导入纯函数 `issues_from_pydantic`）、services → schemas / core，core 不反向依赖；无越层调用，无 ORM / 调度库 / 图像库；`core/db.py` 全部为常量 DDL 与参数化执行，无字符串拼接 SQL（`PRAGMA busy_timeout` 的值经 `int()` 转换）。DDL 与 `sql_ddl_resume.md` 一致（changelog 称程序化提取，测试覆盖约束与索引）。 |
| 业务逻辑 | ⚠️ 因 BLOCK-1 不通过；其余：核心三项 `required` / `too_long` / `invalid_format` 收集全部问题；`details` 只含字段路径与 reason；`+86` 去前缀只在 `+86` 后恰 11 位大陆号时触发（O-04，与 DDL 文档 §2.2.1 一致，`86` 无加号分支为已声明的无害死代码）；邮箱键 trim + lower；姓名键合并内部空白。 |
| 编码规范 | ⚠️ QUESTION-1（命名后缀）；注释与 docstring 为英文；无裸 `except`，`transaction()` 里的 `except BaseException` 会回滚并重新抛出，不吞异常。 |
| 安全 | ✅ 未发现 B-01 / B-03 问题：密钥为 `SecretStr`，`repr` / `model_dump_json` 不泄露（有测试）；错误文案为类属性常量，构造器不接收自由文本；校验异常丢弃 `input` / `msg`；未捕获异常日志只记类名与栈帧；Cookie 属性由单点构造，令牌由服务端生成。仅按“未发现可见安全问题”表述，不宣称安全已通过（clients、存储、上传尚未实现）。 |
| 测试覆盖 | ✅（对本批范围）：213 个用例覆盖正常 / 异常 / 边界，且有数据层断言与脱敏断言；缺口见 BLOCK-1（非 ASCII 数字）。 |

### 逐项评估 worker 自报偏差
| # | 偏差 | 建议 | 依据与条件 |
|---|------|------|------------|
| 1 | Pydantic 层不强制 phone / email 的 pattern，改为去掉空格和连字符后在 `field_validation` 校验 | **接受（有条件）** | OpenAPI 对 phone 明确“pattern 针对提交值，服务端校验前同样去除空格与连字符作为兜底（G-02）”，若在模型层按原值匹配会拒绝 `138 0013 8000`，偏差有契约依据；pattern 常量集中在 `limits.py`，有字符串比对测试。条件：（a）先修 BLOCK-1；（b）任务 2.3 / 2.4 的路由或服务**必须**调用 `validate_update` / `validate_core_fields`，并有接口级测试断言坏手机号 → 422（本批只能证明单点函数正确，我已复现 `PATCH {"fields":{"phone":"abc"}}` 仅经 Pydantic 模型时返回 200，见 changelog 1.4 遗留风险）；（c）email 模型层同理，由同一函数覆盖。 |
| 2 | 日志白名单新增 `count`、`stack` | **接受** | design §5.4 要求对账告警含数量，§3.2 / §7.3 要求记录异常类型与栈；`stack` 只含文件 / 行 / 函数名，不含异常消息，有测试断言。见 SUGGEST-3（路径与长度）、SUGGEST-5（同步 AGENTS）。 |
| 3 | `issues_from_pydantic` 放在 `field_validation`（services）而非 api | **接受** | design §7.3 要求把校验异常 `loc` / `type` 映射集中处理并由 `error_handlers` 复用；它是纯函数、不依赖 FastAPI，api → services 的方向合规；放 api 层反而让任务 2.3 的 service 内校验无法复用。 |
| 4 | 未知路由 / 不允许的方法返回原状态码（404 / 405），业务码为 `internal_error` | **接受** | 契约 13 个业务码里没有 not_found / method_not_allowed，且这些路径不属于四个接口；响应仍是统一错误体，不泄露内部细节，有测试 `test_unknown_route_uses_unified_error_body`。注：该码与文案“服务异常”对 404 略不贴切，不影响契约，建议 DL 知悉即可。 |
| 5 | `deepseek_base_url` 默认值取 `https://api.deepseek.com` | **接受** | 非密钥、可被环境变量覆盖、目标属 ADR-001 批准服务；见 SUGGEST-7（1.8 spike 后再定是否改为无默认值）。 |

## 8. Review Standards 候选沉淀
- **正则语义与契约语言一致**：Python 校验 OpenAPI / JSON Schema 的 `pattern` 时，必须使用 `re.ASCII` 或显式字符类，避免 `\d`、`\w` 的 Unicode 语义偏离契约和前端；对应补充“非 ASCII 数字”用例。
- **幂等键输入必须是契约允许的字符集**：规范化函数前的格式校验若比契约宽松，会让不同写法绕过判重。
- **契约对齐测试要比较语义，不止字符串**：除比对 pattern 字符串外，应以样本集分别用 Python 与 ECMA 引擎（或 `jsonschema` 校验）跑同一批正反例。
- **全局红线与错误响应**：兜底异常路径也要验证响应头 / 响应体 / 日志三者的 `request_id` 一致。

## 9. 正向反馈
- 错误体只来自常量文案，`AppError` 构造器不接受自由文本，从机制上杜绝文案拼接用户数据；校验异常统一丢弃 `input`，并有 `ZZ-secret` 哨兵字符串测试验证响应与日志都不含该值。
- `log_event` 白名单“传错即抛”，在测试期就暴露误用，符合 design。
- 幂等键规范化与手机号去噪各只有一个实现点（`identity_key` 复用 `strip_phone`），且 `phone_key` 幂等性有表驱动测试。
- 契约测试直接读取冻结的 `openapi.yaml`：13 个业务码、文案、22 键顺序、各上限均与契约比对。
- 禁网夹具、`SecretStr`、精确版本锁定（`==`，有测试）、`.env.example` 仅占位符，B-01 / B-06 基础扎实。
- `core/db.py` 的 DDL 程序化取自文档，并测试了约束、索引、外键级联、写者串行。

---

## Dev Lead 裁决（2026-11-10）

| 项 | 裁决 |
|---|---|
| BLOCK-1 | 必须修复：手机号正则改为只匹配 ASCII 数字（`re.ASCII` 或 `[0-9]`），补 Unicode 数字反例测试；修复后由审查 agent 复审 |
| QUESTION-1 | 保留与 OpenAPI components 同名的模型名；AGENTS.md 命名条款补例外"与 OpenAPI components 同名的模型不受 Request/Response/Dto 后缀限制" |
| SUGGEST-3、SUGGEST-5 | 本次随 BLOCK-1 一起处理：`stack` 去掉绝对路径并限制长度；日志白名单新增的 `count`、`stack` 同步到 AGENTS.md 红线 |
| 其余 SUGGEST | 记为跟踪项，在后续相关任务中顺带处理 |
| 自报偏差 | 按审查建议全部接受；pattern 移到 field_validation 的条件为：BLOCK-1 已修复，且 2.3/2.4 路由调用并有接口级测试 |

---

## 复审（第一批修复）

- 日期：2026-11-10
- Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 复审范围：仅限 fix 提交 d5afabf（代码与测试）、538a131（AGENTS.md），已合并到 feature（bbfd4ed）；本 worktree 已执行 `git merge feature`。其余内容与「Dev Lead 裁决」一节未改动。
- 模式：只读审查；除本文件外未修改任何文件。

### 逐项关闭情况
| 项 | 状态 | 证据 |
|---|---|---|
| BLOCK-1 手机号 Unicode `\d` | **已关闭** | `field_validation.py:15` 改为 `re.compile(L.PHONE_PATTERN, re.ASCII)`；`identity_key.py:9` 的 `_MAINLAND_RE` 同样加 `re.ASCII`，所以校验与幂等键去 `+86` 前缀两处都只认 ASCII 数字。`limits.py:15` 的 `PHONE_PATTERN` 字符串未改动，仍与 OpenAPI 原文逐字一致。 |
| 反例测试是否有效 | **有效** | `tests/services/test_field_validation.py::test_non_ascii_digits_rejected` 6 个参数（`1`+阿拉伯-印度数字、全角数字 11 位、`+`+全角、`+`+天城文、`+`+阿拉伯-印度数字、ASCII 中混入 1 个 `U+0660`），同时断言 `validate_core_fields` 与 `validate_update` 返回 `("phone","invalid_format")`；正向用例 `test_ascii_digits_still_accepted` 保留。`test_identity_key.py::test_non_ascii_digits_do_not_reach_dedup_key_as_mainland_numbers` 断言 `+86`+`1`+10 个非 ASCII 数字不会被去前缀。这些输入在修复前（Unicode `\d`）都会通过，即用例在修复前会失败，不是空转。 |
| PHONE_PATTERN 与 OpenAPI 一致性测试 | **仍在且通过** | `tests/schemas/test_openapi_alignment.py::test_patterns_match_openapi` 未改动，复跑通过（该文件在复跑中未被跳过）。 |
| SUGGEST-3 stack 去绝对路径、限长 | **已关闭** | `core/logging.py`：`_display_path` 把路径转成相对 `codes/hr-collection-agent-backend` 的 `src/app/...`，项目外文件只保留文件名；`MAX_STACK_FRAMES=12`（取最内层 12 帧）、`MAX_STACK_CHARS=2000`。新增 `test_stack_has_no_absolute_paths`（不含仓库绝对路径、`/Users/`，不以 `/` 开头）与 `test_stack_is_bounded_to_max_frames_and_chars`（递归 50 层，帧数 ≤12、长度 ≤2000、保留最内层 `recurse`）。仍不含异常消息（原有 `test_exception_logs_class_and_stack_not_message` 通过）。 |
| SUGGEST-5 / 白名单同步 AGENTS.md | **已关闭** | `AGENTS.md` 红线日志条款已含 `count`、`stack`，并写明 `stack` 只含项目相对路径、行号、函数名，不含异常消息和绝对路径，最多 12 帧、2000 字符，与代码常量一致；“最后更新”行已说明修订内容。 |
| QUESTION-1 命名例外 | **已关闭** | `AGENTS.md` 命名条款下新增例外：与 OpenAPI components 同名的模型（`ResumeFields`、`WorkExperience`、`ErrorDetail`、`OriginalFileInfo` 等）不受 Request/Response/Dto 后缀限制，符合 DL 裁决。 |

### 复跑验证（merge 后 HEAD）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ 成功（Checked 34 packages） |
| `uv run python -m compileall -q src` | ✅ 退出码 0；另跑 `compileall -f src` 实际编译 27 个文件 |
| `uv run pytest -q` | ✅ **223 passed**，1 warning（既有的 `StarletteDeprecationWarning`），0 failed，0 skipped；较首轮 213 个增加 10 个（反例 6+1、identity_key 1、logging 2），与 d5afabf 的新增用例一致 |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 54 files already formatted |

### 复审中的观察（不阻断）
- 邮箱正则 `EMAIL_PATTERN` 无 `\d`，`\s` 的语义差异首轮已评估为无影响，本次未改，符合预期。
- 原 SUGGEST-1、2、4、6、7 仍按 DL 裁决作为跟踪项，不在本次复审范围；原偏差 #1 的条件（2.3 / 2.4 路由调用校验并有接口级测试）仍待这些任务审查时核对。

### 更新后的结论
- BLOCK：0（BLOCK-1 已关闭）；QUESTION：0（QUESTION-1 已由 DL 裁决并落到 AGENTS.md）；SUGGEST：5 项未处理的跟踪项（SUGGEST-1、2、4、6、7）。
- **结论：PASS_WITH_SUGGESTIONS**（原 BLOCKED 解除）。

---

## 第二批审查（任务 1.8：clients / DeepSeekClient / pdf_renderer，HIGH_RISK：B-02 / B-06）

- 日期：2026-11-10
- Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：提交 c8b1f10（合并 71d8704），基线为第一批修复后的 feature；本 worktree 已 `git merge feature`。
- 本批结论：**BLOCKED**（1 BLOCK / 1 QUESTION / 5 SUGGEST）
- 上下文限制：未真实调用模型（无凭证）；spike 精度与 token 数据只按 changelog 记录评估，未独立复现。本批 `RawParseResult` 仍是“未信任的字典”，状态值校验与“不得猜测补全”的最终落实在任务 2.1 的 `ParseNormalizer`，不在本批。

### Review Scope
| 文件 | 变更类型 | 风险 |
|---|---|---|
| `src/app/clients/deepseek_client.py`、`resume_parser_client.py` | 新增 | **高**（B-02、B-06、B-01、B-03） |
| `src/app/clients/pdf_renderer.py` | 新增 | 高（处理不可信文件） |
| `src/app/clients/prompts.py` | 新增 | 高（提示词注入） |
| `src/app/core/logging.py`、`schemas/parse.py` | 修改 | 中（B-03） |
| `pyproject.toml`、`uv.lock`（`pypdfium2==5.15.2`） | 修改 | 中（供应链） |
| `scripts/spike_deepseek.py`、`tests/synthetic.py`、`tests/clients/*`、`tests/fakes.py` | 新增 | 中 |
| `AGENTS.md`、`design.md`、`tasks.md`、`changelog.md` | 修改 | — |

### BLOCKING Issues

#### 第二批-BLOCK-1：模型标识只取自配置，代码没有强制“只允许 deepseek-flash”，与 ADR-001 修订 1、design §6、AGENTS.md 不一致
**位置**：`src/app/clients/deepseek_client.py:110`（`"model": self._settings.deepseek_model`）；`src/app/core/config.py:17`（`deepseek_model: str = "deepseek-flash"`，无校验）；`tests/core/test_config.py:52`（断言 `DEEPSEEK_MODEL=other-model` 会被接受）
**证据**：
- ADR-001 修订 1：“仍然只使用 `deepseek-flash`，不使用同一凭证下可见的其他模型（如 `deepseek-v4-pro`）”。
- design.md §6 `DeepSeekClient` 行（c8b1f10 修订）：“模型名取自配置，**且只允许获批的 `deepseek-flash`**”；AGENTS.md 技术栈表：“且只允许该获批模型”。
- 本人用 `httpx.MockTransport` 构造 `Settings(deepseek_model="deepseek-v4-pro", deepseek_base_url="http://example.invalid")` 并调用 `DeepSeekClient.parse`：请求实际带 `"model": "deepseek-v4-pro"` 发往 `example.invalid`，没有任何拦截（脚本已删除，未改动仓库）。
- “只允许 deepseek-flash”的断言只存在于 `scripts/spike_deepseek.py` 的 `main()`（`assert settings.deepseek_model == "deepseek-flash"`），不在运行时路径；且 `assert` 在 `python -O` 下会被移除。生产路径唯一的防线是环境变量不被改错。
- worker 自报的越界事件（向 `deepseek-v4-pro` 发过 3 个合成请求）正是此类风险的实际例子。
**问题**：B-02 是 BLOCK 级约束，HIGH_RISK 任务要求“更强证据”。当前实现把“只发给获批模型”交给部署配置，违反 design/AGENTS 写明的“只允许”。
**影响**：一次环境变量误配（或 `.env` 被复用）就会把真实简历发往未获批模型，且无告警、无测试发现。
**修复建议**：在 `Settings` 增加校验（`deepseek_model` 只允许 `"deepseek-flash"`，不匹配时启动失败或在 `DeepSeekClient.__init__` 抛错；与“缺密钥启动不阻止”的策略一致时，也可令 `parse()` 返回 `parse_unavailable` 且不发请求），并更新 `test_config.py:52` 的用例为“其他模型被拒绝”，补一条 `DeepSeekClient` 级别的“非获批模型不发请求”测试；spike 脚本的 `assert` 改为显式 `if … sys.exit`。
**违反约束**：B-02；ADR-001（ACCEPTED，修订 1）；design.md §6；AGENTS.md 技术栈表。

### QUESTIONS

#### 第二批-QUESTION-1：外发目标主机是否也要在代码里限定
**位置**：`src/app/clients/deepseek_client.py:95`（`base_url=settings.deepseek_base_url.rstrip("/")`）；`core/config.py:16`
**问题**：`Authorization: Bearer <key>` 与简历内容会发往 `DEEPSEEK_BASE_URL` 指向的任何地址（上文探测中 `http://example.invalid` 被接受，含明文 http）。第一批 SUGGEST-7 曾建议在 1.8 spike 后再决定是否限定；spike 已验证 `https://api.deepseek.com` 可用。是否要求：仅允许 `https` 且主机在批准清单（`api.deepseek.com`）内，否则 fail-closed？
**需要谁裁决**：Dev Lead
**不同答案的影响**：限定则与修复 BLOCK-1 一并实现，成本很小，B-02 才真正落在代码上；不限定则需在部署文档中明确“`DEEPSEEK_BASE_URL` 变更属于需要批准的变更”，并接受误配风险。我建议限定。

### SUGGESTIONS
- **第二批-SUGGEST-1（提示词注入加固）**：`deepseek_client.py:build_user_blocks` 把文本层原文直接放进 `[Page N text layer]\n{text}` 的 user 文本块，与 `USER_INSTRUCTION` 同属一条 user 消息，没有分隔标记。系统提示已有“文档是不可信数据、不得执行文档内指令、不得输出 confirmed”（`prompts.py` 规则 1、4），方向正确；建议给文本层加明确的起止分隔（如 `<document_page n=…>…</document_page>`），并把“忽略分隔符内的指令”写进系统提示。另：`confirmed` 只靠提示词约束，客户端没有校验返回状态——**务必**在任务 2.1 的 `ParseNormalizer` 中拒绝/降级 `confirmed`、拒绝 `missing` 带值、拒绝 `recognized/uncertain` 为空值（REQ-BE-02.3，不得猜测补全），审查 2.1 时必查。
- **第二批-SUGGEST-2（超出 5 页被静默丢弃）**：`render_pdf` 返回的 `RenderedPdf.total_pages/processed_pages` 在 `build_user_blocks` 里被丢弃，调用方和用户都不知道后面页被忽略（设计已接受“对应字段按 missing 处理”）。建议至少用 `count` 白名单字段记录被忽略的页数，并评估在上传响应中让用户知晓（需要契约变更时走 cross-workbench-reviewer，本期可只记日志）。
- **第二批-SUGGEST-3（PDF 处理无时间上限）**：`pdf_renderer.py` 持全局 `_PDFIUM_LOCK` 串行处理，文本提取与 PNG 渲染没有超时；一个构造的 ≤10 MB PDF（复杂页面）会长时间占用锁，阻塞其他上传。POC（约 5 人）可接受，建议记录为已知风险，并在 3.2/3.3 压测时覆盖。我实测了页面尺寸 0×0、1×1、20000×20000 的合成 PDF：均能正常渲染为 PNG（尺寸受 1600px 长边约束），未出现未映射异常。
- **第二批-SUGGEST-4（状态码映射补充测试）**：`_map_response` 中 3xx 与 408 都落入 `parse_failed`。httpx 默认不跟随重定向（避免把简历带到别处，是好行为），但没有测试固化；建议补“302 不跟随、只发 1 次请求”的用例，并评估 408 是否应属 `parse_unavailable`（design §7.2 未列）。
- **第二批-SUGGEST-5（spike 脚本）**：脚本只在内存生成合成文档、不打印响应、不含 `v4-pro`，符合 B-06；除 BLOCK-1 的 `assert` 问题外，建议在脚本头部再声明“不要在其中设置 `DEEPSEEK_BASE_URL` 为非批准地址”，并与 QUESTION-1 的结论保持一致。

### HIGH_RISK 审查结论（供 DL 确认任务 1.8 是否标 ✅）
**结论：暂不建议标 ✅。** 在第二批-BLOCK-1 修复并复审通过、QUESTION-1 裁决后再标。其余 HIGH_RISK 检查均通过，见下表。

| 检查项 | 结论 | 证据 |
|---|---|---|
| 与 ADR-001 修订 1 一致：仅 deepseek-flash；PDF 本地转换，文本层优先、PNG 兜底、最多 5 页；记录 token | ✅ 实现一致 | `pdf_renderer.py`：`MIN_TEXT_CHARS=50`（非空白字符）、`MAX_PAGES=5`、`LONG_EDGE_PX=1600`、`MAX_TEXT_CHARS_PER_PAGE=6000`；`deepseek_client.py` 解析 `usage` 并写 `prompt_tokens/completion_tokens`；照片直接 `image_url` |
| B-02：外发只经 clients 层 | ✅ 代码路径；⚠️ 模型/主机未强制 | `httpx` 仅在 `clients/deepseek_client.py` 使用；见 BLOCK-1、QUESTION-1 |
| 未向未获批模型发送内容（运行代码与脚本） | ✅ 代码与脚本无 `v4-pro` | `git grep -n v4-pro` 只命中 ADR-001、changelog、_progress（均为文字记录）；spike 脚本有 flash 断言（见 BLOCK-1 对其局限的说明） |
| 越界事件记录 | ✅ 已如实记录 | changelog Task-1.8“探测期事故”，ADR-001 修订 1 已载明禁止项 |
| B-01：密钥只来自 `SecretStr`，不入日志/错误/测试/仓库 | ✅ | `deepseek_client.py` 仅在构造 `Authorization` 头时 `get_secret_value()`；`git grep -nE "sk-[A-Za-z0-9]{8,}"` 无命中；测试用 `SecretStr` 夹具，`test_failures_never_log_bodies_or_keys` 断言日志不含 key/Bearer |
| B-03：日志白名单、错误体不回显、httpx 日志级别 | ✅ | 白名单新增 `prompt_tokens/completion_tokens`（仅数字，AGENTS.md 已同步）；`configure_logging` 把 `httpx/httpcore` 压到 WARNING（`logging.py`，有用例）；错误文案为常量；日志用例断言不含哨兵简历文本、`base64`、`image_url` |
| 失败映射与 design §7.2 | ✅ | 401/403/404/429/5xx→`parse_unavailable`；其他 4xx→`parse_failed`；超时四种→`parse_timeout`；`ConnectError`/`ReadError`/`RemoteProtocolError`→`parse_unavailable`；无 key→`parse_unavailable` 且不发请求；空/非 JSON/非对象/缺 choices→`parse_failed`；全部不重试且保留 `__cause__` |
| 新增 402→`parse_unavailable` | ✅ 合理，**接受** | 余额不足是服务侧不可用而非文件问题，换文件无益；与 design §7.2 已同步 |
| 提示词注入防护 | ⚠️ 有基础防护，建议加固 | 见 SUGGEST-1 |
| 严格解析、不猜测补全、不允许 confirmed | ⚠️ 本批仅提示词层 | 客户端只保证“JSON 对象”；落实在 2.1，见 SUGGEST-1 |
| `pdf_renderer` 边界 | ✅ | 测试覆盖 49/50/51 字符阈值、5 页上限、长边 1600（横/竖）、PNG 有效且含墨迹、单页文本 6000 上限、4 种损坏输入→`parse_failed`、6 线程并发一致；我另验证 0×0、1×1、20000×20000 页尺寸不抛未映射异常 |
| 新依赖 `pypdfium2==5.15.2` | ✅ | 元数据许可证 BSD-3-Clause / Apache-2.0（含 PDFium 二进制依赖许可）；`pyproject.toml` 精确 `==`；`uv.lock` 来源为 pypi.org/files.pythonhosted.org，无私有索引；设计中明确不使用 AGPL 的 PyMuPDF |
| 数据层/隐私 | ✅ | 测试仅用虚构人物（`ZHANG SAN`、`13800138000`、`EXAMPLE CORP`）；未提交真实简历 |

### 本批复跑（merge 后）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅（安装 `pypdfium2==5.15.2`） |
| `uv run python -m compileall -q src` | ✅ 退出码 0；`compileall -f src` 实际编译 31 个文件 |
| `uv run pytest -q` | ✅ **295 passed**，1 warning（既有 `StarletteDeprecationWarning`），0 failed，0 skipped |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 63 files already formatted |

### 正向反馈
- 把 PDF 转换完全封装在 clients 内，services 和测试不感知；文本层优先既省 token 又避免手机号/邮箱视觉误读。
- 失败映射表驱动测试完整，且每条失败路径都断言“只发 1 次请求（不重试）”。
- 日志脱敏测试覆盖成功、401/400/500、超时四条路径。
- 提示词与 `ResumeFields` 键集合用 `assert` 保持同步，防漂移。
- changelog 如实披露越界事件、偏差和遗留风险。

### 更新后的本批结论
**BLOCKED**（第二批-BLOCK-1）。修复 BLOCK-1 并裁决 QUESTION-1 后，由审查 agent 复审，通过后建议 DL 在 tasks.md 将 1.8 标 ✅。

---

## Dev Lead 裁决（第二批，2026-11-10）

| 项 | 裁决 |
|---|---|
| BLOCK-1 | 必须修复：Settings 校验 `deepseek_model` 只能为 `deepseek-flash`，其他值启动失败；`test_config.py` 中"other-model 被接受"的断言改为反例测试；spike 脚本中的 `assert` 改为显式判断 |
| QUESTION-1 | 限定 `DEEPSEEK_BASE_URL`：只允许 `https`，主机只能是 `api.deepseek.com`，否则启动失败（测试用 MockTransport，不受影响） |
| SUGGEST（PDF 超时、提示词分隔） | 随本次修复一起处理 |
| 其余 SUGGEST | 记为跟踪项；"normalizer 拒绝 confirmed"必须在任务 2.1 中落实 |
| 1.8 HIGH_RISK | 修复并复审通过后，再由 DL 确认标 ✅ |

---

## 复审（1.8 修复）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 复审范围：仅限修复提交 8e5f9f5（已合并到 feature 67c5728；本 worktree 已 `git merge feature`）。原有各节与各「Dev Lead 裁决」未改动；只读审查，除本文件外未改任何文件。

### 逐项关闭情况
| 项 | 状态 | 证据 |
|---|---|---|
| 第二批-BLOCK-1 模型未锁定 | **已关闭** | 三层防线：（1）`core/config.py`：`deepseek_model: Literal["deepseek-flash"]`，`model_config` 加 `hide_input_in_errors=True`；（2）`deepseek_client.py:__init__` 构造时再次校验 `settings.deepseek_model != APPROVED_MODEL or not is_approved_base_url(...)` 抛 `ValueError`，覆盖 `model_copy`/`model_construct` 绕过；（3）请求体 `"model"` 固定取常量 `APPROVED_MODEL`，不再读配置。测试：`test_config.py` 12 种模型名反例（`deepseek-v4-pro`、`other-model`、空串、空格、大小写变体、前后空白、`-2` 后缀、截断、`deepseek-chat`、尾部换行）且断言错误文本不含输入值；原先接受 `other-model` 的断言已改为反例；`test_deepseek_client.py::test_every_request_uses_deepseek_flash_on_the_approved_host` 对 PNG/JPEG/文本 PDF/扫描 PDF 四种输入用 `MockTransport` 断言每个请求的 `model == "deepseek-flash"` 且 `scheme/host/port == https/api.deepseek.com/None`；`test_client_refuses_a_model_that_bypassed_settings_validation`、`..._address_...` 用 `model_copy(update=…)` 证明绕过被构造器拦截。`scripts/spike_deepseek.py` 的 `assert` 已改为 `if … sys.exit(…)`（`-O` 下仍有效）。 |
| 第二批-QUESTION-1 外发地址 | **已关闭（DL 裁决已落实）** | `is_approved_base_url`：正则 `https://(?i:api\.deepseek\.com)(?:/[A-Za-z0-9._~-]+)*/?` 配合 `fullmatch`，另排除 `.`/`..` 路径段；`Settings` 的 `deepseek_base_url` 校验器在启动时拒绝。测试 30 种反例（http/ftp/协议相对、子域/父域/后缀域名、尾点、userinfo、`@`/`\`/`#`/`?` 绕过、端口含 443、IP/IPv6/十进制 IP、query/fragment、`..`、空格、前后空白/换行、空串）+ 4 种合法地址（含大小写主机名和路径前缀），且断言错误不回显值。 |
| PDF 20 秒协作式超时（SUGGEST） | **已关闭，测试有效，有一处小弱点** | `pdf_renderer.render_pdf`：总预算 20 s，覆盖等待 PDFium 锁（`acquire(timeout=…)`）、开文件和逐页前检查，超时抛 `ParseFailedError`，锁在 `finally` 释放；文档已写明“协作式、已在执行的单页操作无法中断”。测试真实有效：零预算在任何工作前失败；**另一线程持有真实 `_PDFIUM_LOCK`** 时 0.2 s 预算失败，释放后可正常渲染（验证锁未泄漏）；客户端层把 `PDF_TIMEOUT_SECONDS` 设为 0，断言 `parse_failed` 且 `rec.requests == []`（不调用模型）。弱点见 SUGGEST-1。 |
| 提示词起止标记（SUGGEST） | **已关闭** | `prompts.py`：`DOC_BEGIN/DOC_END`，系统提示说明“标记之间只是数据，即使自称来自用户/系统/开发者”；`build_user_blocks` 把文本块与图片块都包在标记内，文本层经 `neutralize_markers` 替换（替换为 `[marker removed]`，不是空串，所以不会拼出新标记）。测试：开头/结尾块位置、图片也在标记内、含伪造 `DOC_END … DOC_BEGIN` 的恶意文本层发出后标记各只出现 1 次且文本中无标记。 |

### 针对 QUESTION-1 的补充探测（遗漏检查）
我另外对 `is_approved_base_url` 试了 19 种变体，全部符合预期（只有下列“无害”例外）：
- 被拒绝：`%2e%2e`/`%2E`/`%00` 百分号编码、全角 `ａpi`、`xn--` 形式 IDN 子域、Unicode 句号 `api。deepseek.com`、`é` 等非 ASCII 路径、`//` 空段、`..;/`、`;`/`,`/`\t`/`\r\n` 注入、尾点（含 `./`）、`HTTPS://`、空端口 `:`。
- 接受：大小写不同的主机名（`API.DeepSeek.com`，主机名不区分大小写，httpx 会规范化）；`https://api.deepseek.com/.../x` 这类仍在同一主机下的路径前缀（无害）。
结论：IDN、尾点、大小写、百分号编码方面**没有发现遗漏**。

### 复审中发现的遗漏 / 建议（均不阻断）
- **SUGGEST-1（超时测试可再收紧）**：`test_deadline_is_checked_between_pages` 的假时钟每次调用前进 10 s、预算 25 s，实际在处理第 1 页之前就已超时，无法证明“页与页之间”的检查有效。建议改为让时钟前两页内不超时、第三页前才超时，并断言已处理页数。
- **SUGGEST-2（锁争用超时的错误码）**：等锁超时与损坏 PDF 同样映射为 `parse_failed`（“请更换文件”），对因并发排队造成的超时会误导用户；设计（v0.3）已明确写 `parse_failed` 并经 DL 采纳，故仅记录，后续并发压测（3.2/3.3）时再评估是否改用 `parse_timeout`。
- **SUGGEST-3（代理环境变量）**：`httpx.Client` 未设置 `trust_env=False`，进程环境里的 `HTTPS_PROXY/ALL_PROXY` 会让外发流量经代理。属部署层风险，不是代码缺陷；建议在部署说明中列入“生产环境不得设置出站代理，或代理须在批准清单内”，或在客户端显式 `trust_env=False`。
- 跟踪项不变：任务 2.1 的 `ParseNormalizer` 必须拒绝 `confirmed` 状态并校验 `missing`/`recognized` 与值的一致性（REQ-BE-02.3）。

### 复跑（merge 后）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ |
| `uv run python -m compileall -q src` | ✅ 退出码 0；`-f` 实际编译 31 个文件 |
| `uv run pytest -q` | ✅ **361 passed**，1 warning（既有 `StarletteDeprecationWarning`），0 failed，0 skipped（第二批审查时为 295，+66 个，与新增的反例/超时/标记用例一致） |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 63 files already formatted |

### 1.8 HIGH_RISK 最终结论
**建议 DL 将任务 1.8 标 ✅。** BLOCK 0、QUESTION 0；B-01（`SecretStr`、无 `sk-` 值）、B-02（模型与地址在配置层、客户端构造层、请求体三处锁定，所有请求经 clients 层且有 MockTransport 逐请求断言）、B-03（日志白名单、httpx 日志降级、错误不回显）、B-06（仅合成数据）及与 ADR-001 修订 1 的一致性均通过。上述 3 条 SUGGEST 与 2.1 的 normalizer 要求作为跟踪项，不阻断标 ✅。

---

## 第四批审查（任务 1.9–1.10：草稿库/草稿文件存储、正式库/归档文件存储）

- 日期：2026-11-10；Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：提交 de985a7（1.9，含上一批复审建议 `trust_env=False` 与收紧后的页间超时用例）、3f74106（1.10）；已合并 feature（7c1cdf4），本 worktree 已 `git merge feature`。
- 本批结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 7 SUGGEST；另有 2 个 worker 提出的 DL 确认点，我的建议均为“接受”，见下）
- 上下文限制：本批只有存储原语，B-04（确认前不入库）与 B-05（保存顺序、补偿、对账）的运行路径在 2.4/2.5，**本批不能对其下结论**，只核对原语是否足以支撑。

### Review Scope
| 文件 | 风险 |
|---|---|
| `src/app/repositories/draft_repository.py`、`draft_file_store.py` | 中高（令牌哈希、SQL、文件安全） |
| `src/app/repositories/resume_repository.py`、`archive_file_store.py` | **高**（B-05 基础、ADR-004 幂等基础、原始简历文件） |
| `src/app/clients/deepseek_client.py`（`trust_env=False`）、`tests/clients/test_{deepseek_client,pdf_renderer}.py` | 高（B-02） |
| `tests/repositories/*`（4 个文件） | — |

### 核对结果
| 检查项 | 结论 | 证据 |
|---|---|---|
| 两库物理分离、无外键（C-12、ADR-003） | ✅ | 两个仓储各自只持有自己的 `db_path`；`DraftRepository` 不引用 `resumes`，`ResumeRepository` 不引用 `drafts`；跨库无 FK，库内 FK 仅正式库子表 → 主表（沿用第一批 DDL） |
| 令牌只存 SHA-256 | ✅ | `DraftRecord.token_hash` 是唯一令牌字段，无明文列；`test_plain_token_is_never_stored` 直接查库断言；哈希由 `core/ids.hash_token` 产生（调用方负责） |
| SQL 全参数绑定 | ✅ | 所有值都用 `?`；唯一的 f-string 只插入模块常量 `_COLUMNS`（带 `noqa: S608`，无外部输入）；`test_sql_is_parameter_bound`、`test_values_are_parameter_bound` 以注入串验证只作数据 |
| 写事务 `BEGIN IMMEDIATE` | ✅ | 所有写操作经 `core.db.transaction`；`create_aggregate`、`insert`、`delete*`、`touch_and_get`、`transaction()` 均在其中 |
| 文件名服务端生成、扩展名白名单、独占创建 | ✅ | `DraftFileStore.save`：`f"{draft_id}{EXTENSIONS[content_type]}"`（仅 pdf/jpg/png，来自已校验的内容类型）、`open(..., "xb")` 不覆盖并 `fsync`；`ArchiveFileStore` 名称由 `tmp_name/final_name` 生成，ID 与扩展名白名单校验；用户文件名不参与路径 |
| 拒绝路径穿越与符号链接逃逸 | ✅（逃逸）⚠️（目录内符号链接，见 SUGGEST-1） | `_NAME_RE`/`_ID_RE` 白名单正则 + `resolve()` 后 `parent == root`；8 种越界名、指向目录外的符号链接被拒且外部文件不受影响（测试）；`ArchiveFileStore._path` 拒绝符号链接，`scan` 将符号链接归入 unknown 且不触碰 |
| 清理永不访问 `file/` | ✅（本批范围） | `DraftFileStore` 根目录固定为 `{DATA_DIR}/drafts`，无任何指向 `file/` 的路径；`test_store_never_touches_files_outside_its_directory`；`list_files` 只列常规文件并跳过符号链接。清理服务本身在 2.6 |
| `ArchiveFileStore` 原语支撑 B-05 / 对账 | ✅ | tmp 与终态同目录（测试验证同设备）；`promote` 为 `os.replace` 原子重命名（测试验证同 inode，非复制）并尽力 fsync 目录；`stage` 复制后 fsync；`discard_tmp` 只拼 tmp 名，不可能触及终态文件（有测试）；`exists_tmp/final`、`scan`、`remove` 足以支撑 2.5 的“roll-forward tmp / 删无记录 tmp / 删无记录终态 / 记录缺文件仅告警”四种情形；**未提前实现**保存顺序、重复分支、补偿与对账决策（changelog 声明，代码走读一致） |
| `create_aggregate` 单事务、整体回滚、唯一身份冲突 → `DuplicateIdentityError` | ✅ | 主表与三类子表在同一个 `transaction()` 内；异常触发 `ROLLBACK`；仅当错误消息含 `resumes.name_key` 才转 `DuplicateIdentityError`，`file_path` 唯一、CHECK、外键、触发器注入失败均原样抛出（测试“其他完整性错误不被吞”“最后一张子表失败 → 四表均无数据且仓储可继续使用”） |
| 并发测试有效性 | ✅ | `test_concurrent_same_identity_yields_exactly_one_record`：4 线程用 `Barrier` 同时提交同身份、不同 `id`/`file_path`，结果恰为 1 个 `created` + 3 个 `duplicate`，且主表与子表计数均为 1，证明 BEGIN IMMEDIATE + `uq_resumes_identity` 在并发下成立（ADR-004 基础）；`test_concurrent_read_modify_write_loses_no_update`：两线程各 10 次读改写，最终各键均为 10 |
| `trust_env=False` 测试是否真实有效 | ✅ | `deepseek_client.py` 增加 `trust_env=False`；测试设置 6 种代理环境变量后断言 `client._http._mounts == {}` 且 `trust_env is False`。我另外验证：设置同样的 `HTTPS_PROXY` 时，默认 `httpx.Client` 的 `_mounts` 数量为 **1**，`trust_env=False` 为 **0**，所以该断言能区分有无修复（changelog 也称去掉修复后该测试失败）。缺点：依赖 httpx 私有属性 `_mounts`，升级 httpx 时需留意（SUGGEST-7） |
| 页间超时用例收紧 | ✅ | 新用例用伪时钟让每页文本提取“耗时 10 秒”、预算 25 秒，断言 `len(processed) == 3`，即第 1 页之后才超时、在第 4 页前停止；关闭了上一轮 SUGGEST-1 |
| 分层 | ✅ | repositories 只含 SQL/文件操作，无业务判断；依赖仅为 `core`、`schemas`（`NewResume` 使用 `Education` 等模型）；`*_key` 由调用方传入，仓储不做规范化 |

### BLOCKING Issues
无。

### QUESTIONS
无。

### worker 提出的两个 DL 确认点
1. **部署环境需要 SQLite ≥ 3.35（`RETURNING`）——建议接受。** design §5.5 本身就以 `DELETE ... RETURNING file_path` 为设计（不是实现自行引入）；本机 uv 管理的 Python 为 3.50.4，系统库为 3.51.3，都满足。风险在于将来部署到自带旧 SQLite 的镜像（如 3.34 及以下）。建议：在 AGENTS.md 运行环境中写明“SQLite ≥ 3.35”，并在 `init_*_db` 里加一行启动时检查（`sqlite3.sqlite_version_info >= (3, 35)`，不满足则明确报错），见 SUGGEST-2。
2. **`stage` 失败时自行清理残留 tmp 作为兜底——建议接受。** ADR-005 把“提交前失败清 tmp”放在 service 补偿，但 `stage` 只删除**自己刚创建的、带随机 ID 的 tmp 名**，不可能碰终态文件，也不改变 2.4 的补偿职责（`discard_tmp` 仍幂等，可重复调用），测试覆盖“源文件缺失”“复制中途失败”两种情形。唯一注意：2.4 不要因此省略自己的补偿调用。

### SUGGESTIONS
- **第四批-SUGGEST-1（目录内符号链接会让 `delete` 删掉别的草稿文件）**：`draft_file_store.py:resolve/read/delete` 先 `resolve()` 再比较父目录；符号链接若指向**同目录内另一文件**，`resolve()` 返回目标路径，校验通过。我复现：在 `drafts/` 内创建 `a.pdf → b.pdf`，`read("a.pdf")` 返回 b 的内容；`delete("a.pdf")` 返回 True，**b.pdf 被删除，链接 a.pdf 仍在**。前提是攻击者已能在服务端数据目录写入文件，POC 威胁很低，且 changelog 已披露“被视为目录内文件”（但没有提到 `delete` 会删目标）。建议：校验时用 `os.lstat`/`is_symlink()` 拒绝符号链接（与 `ArchiveFileStore._path` 一致），读取用 `O_NOFOLLOW`。
- **第四批-SUGGEST-2（SQLite 版本启动检查）**：见上，把 `RETURNING` 依赖变成启动时的明确错误，而不是首次清理/删除时的运行期 `OperationalError`。
- **第四批-SUGGEST-3（`promote` 会静默覆盖已存在的终态文件）**：`archive_file_store.py:promote` 使用 `os.replace`，如果同名终态文件已存在会被替换。ID 是新生成的 UUID 所以正常路径不会发生，但归档原件是 B-05 保护的对象，建议在 `promote` 前检查终态不存在（存在则抛错），或改用“`os.link` + 删除 tmp”的不覆盖语义，并补一条测试。
- **第四批-SUGGEST-4（草稿文件写入失败留下半个文件）**：`draft_file_store.py:save` 在 `write/fsync` 失败（如磁盘满）时不清理已创建的文件（`ArchiveFileStore.stage` 做了）。孤儿扫描（2.6）有 1 天余量会兜底，但建议 `save` 失败时 `unlink`，避免占用磁盘。
- **第四批-SUGGEST-5（`list_files` 的竞态）**：`entry.stat()` 在 `iterdir` 与 `stat` 之间若文件被并发删除会抛 `FileNotFoundError`，清理扫描会因此中断；建议捕获并跳过。
- **第四批-SUGGEST-6（`stage` 用 `"wb"` 打开 tmp）**：非独占创建，且会写穿预先存在的同名符号链接；建议在 2.4 保证每次保存使用新 ID 的前提下改为 `"xb"`（失败重试应换新 ID，已有 tmp 说明有残留需先对账）。另：`NewResume` 重复检测靠 `exc` 文本里的 `resumes.name_key`，当前 SQLite 版本下可靠且有测试，升级 SQLite 时留意；ID 正则不强制 UUID（风险已披露，字符集安全，接受）。
- **第四批-SUGGEST-7（测试脆弱点）**：`trust_env` 测试读取 `httpx.Client._mounts` 私有属性；建议同时保留当前断言和 `trust_env is False`（已有），升级 httpx 时重点关注，或补一个用 `MockTransport` 之外的最小行为测试。

### 遗留风险评估
| 风险 | 评估 |
|---|---|
| ID 正则不强制 UUID | 接受：字符集 `[A-Za-z0-9-]{1,64}` 不含路径分隔符与点，服务层生成 UUID v4；可选收紧为 UUID 正则（需同步测试用的短 ID）。 |
| 符号链接指向目录内另一文件 | 不止“被视为目录内文件”：`delete` 会删除目标，见 SUGGEST-1；POC 可接受，建议顺手修复。 |
| 并发确认时源文件被先到者删除 | 属 2.4 范围，届时核对。 |

### 本批复跑（merge 后）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ |
| `uv run python -m compileall -q src` | ✅ 退出码 0；`-f` 实际编译 35 个文件 |
| `uv run pytest -q` | ✅ **449 passed**，1 warning（既有 `StarletteDeprecationWarning`），0 failed，0 skipped（上一批为 361） |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 71 files already formatted |
| SQLite 版本 | uv 管理的 Python 3.50.4；系统 3.51.3（均 ≥ 3.35） |

### 正向反馈
- 原语与策略分离清晰：`ArchiveFileStore` 只提供 stage/promote/discard/scan/remove，保存顺序与补偿完全留给 2.4/2.5，没有提前实现。
- 并发测试直接对着 ADR-004 的幂等承诺（唯一索引 + BEGIN IMMEDIATE）设计，并同时检查子表计数。
- 触发器注入“最后一张子表失败”的回滚测试，比单纯断言异常更能证明整体回滚。
- 复审建议当轮就落实并附带“去掉修复测试会失败”的证据。

### 更新后的本批结论
**PASS_WITH_SUGGESTIONS**。建议 DL 接受两个确认点；SUGGEST-1、2、3 建议在 2.4 开工前或随 2.4 一并处理，不阻断 1.9、1.10 通过审查。

---

## Dev Lead 裁决（第四批，2026-11-10）

| 项 | 裁决 |
|---|---|
| 结论 | 1.9–1.10 通过 |
| DL 确认点 ①：SQLite ≥ 3.35 | 接受。本项目只在本机部署，选占用最小、能运行的方案：继续用 Python 自带的 SQLite（本机 3.50.4），不另装数据库服务。AGENTS.md 写明版本要求，并在 init_*_db 加启动检查（SUGGEST-2） |
| DL 确认点 ②：stage 失败自清 tmp | 接受（按审查建议） |
| SUGGEST-1（目录内符号链接）、SUGGEST-3（promote 静默覆盖） | 在 2.4 之前修复：DraftFileStore 拒绝符号链接（lstat + O_NOFOLLOW）；promote 前检查终态文件已存在则报错，不覆盖 |
| 其余 SUGGEST | 记为跟踪项 |


---

## 第六批审查（存储加固 + 任务 2.1–2.3：上传创建草稿、读取续期、提交校对结果）

- 日期：2026-11-10；Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：合并提交 cfb87b3，含 `6295fe5`（存储加固）、`fb1210f`（2.1）、`bac0405`（2.2）、`71785cc`（2.3）；本 worktree 已 `git merge feature`，HEAD 含 cfb87b3。对照 design、tasks、openapi.yaml 0.1.1、ADR-001..006、AGENTS.md（项目根与 backend 代码根）。
- 本批结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 6 SUGGEST；另有 4 个待 DL 裁决的偏差，我的建议均为“接受”，见下）
- 上下文限制：B-05 保存顺序、补偿与对账在 2.4/2.5，本批不下结论。B-04 只能确认“本批三个接口不写正式库”，“确认后才入库”的正向路径在 2.4 审查。未做真实模型调用，也未实测并发与超大上传。

### Review Scope
| 文件 | 变更类型 | 对应 Task | 风险 |
|---|---|---|---|
| `core/db.py`、`repositories/draft_file_store.py`、`archive_file_store.py` | 修改（加固） | 第四批 SUGGEST-1/2/3 | 中高（文件安全） |
| `services/upload_validation.py`、`api/routes/resume_drafts.py`（POST）、`api/deps.py`、`main.py` | 新增/修改 | 2.1 | **高**（上传、文件落盘、令牌） |
| `services/parse_normalizer.py` | 新增 | 2.1 | **高**（模型输出为不可信数据，B-04） |
| `services/draft_service.py`（create/get/update）、`field_validation.py`、`api/error_handlers.py`、`api/cookies.py` | 新增/修改 | 2.1–2.3 | **高**（令牌哈希、B-04、错误响应） |
| `tests/**`（api、services、repositories、core） | 新增/修改 | — | — |

### 核对结果
| 检查项 | 结论 | 证据 |
|---|---|---|
| 上传校验与大小限制 | ✅（读取阶段）⚠（前置限制，见确认点 ⑤） | `upload_validation.validate_upload`：缺文件 → 扩展名白名单（先于读取）→ 64KB 分块、超 10485760 字节立即抛 `FileTooLargeError` → 空文件 → 魔数与扩展名一致；`content_type` 只来自魔数，客户端 Content-Type 被忽略（有测试）；10MB 恰好通过、+1 报 413 且不调用模型 |
| 令牌与哈希 | ✅ | `ids.generate_token`＝`secrets.token_urlsafe(32)`（256 位），库内只存 `hash_token`（SHA-256）；`create`/`get`/`update` 均先哈希再查；明文令牌只出现在 Set-Cookie；Cookie 属性 `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`，由 `cookies.py` 单点生成；404/422/失败路径不设置 Cookie |
| SQL 参数绑定 | ✅ | 本批未新增 SQL 文本；`get/touch_and_get/update_fields/delete_by_token_hash` 复用第四批已审的仓储，值全部 `?` 绑定 |
| 文件路径安全 | ✅ | 文件名＝服务端 UUID + 魔数得出的扩展名，用户文件名只作展示（basename、截断 255）；`DraftFileStore` 经 `lstat` 拒绝任何符号链接、`read` 用 `O_NOFOLLOW`，`list_files` 只列普通文件；`ArchiveFileStore.promote` 已存在即 `FileExistsError`，不覆盖（`lexists` 覆盖悬空链接）。第四批 SUGGEST-1/2/3 均落实，有红灯验证记录 |
| SQLite ≥ 3.35 启动检查 | ✅ | `core/db._init` 在创建任何文件前检查 `sqlite_version_info`；测试用 3 个过低版本与 3 个合法版本验证，过低时不创建文件 |
| 错误响应不泄露内部 | ✅ | `details` 只含字段路径 + reason 代码，`issues_from_pydantic` 丢弃 `input/msg`；任意异常 → `InternalError`（固定文案）；测试用哨兵值断言 6 个字段 + 核心三项不回显；错误体统一 `{code,message,request_id}`；`log_event` 的 `stack` 不含异常消息 |
| B-04（确认前不入库） | ✅（本批范围） | `services/`、`api/` 无任何 `ResumeRepository`/`ArchiveFileStore`/`resumes.db` 引用（grep 确认）；POST/GET/PATCH 只写 `drafts.db` 与 `data/drafts/`；`normalize` 拒绝模型返回的 `confirmed`（降为 `uncertain`），`check_invariants` 在出口断言“无 confirmed、missing⇔空值”；有“全部字段声称 confirmed”的提示注入样本测试；PATCH 路由 docstring 与代码一致“不代表用户确认保存” |
| 日志脱敏 | ✅ | `draft_created` 只记 `draft_id`；清理失败只记类名与栈帧；测试断言日志不含文件名、文件内容、令牌、提交值；`log_event` 白名单未放宽 |
| 契约一致（openapi 0.1.1） | ✅ | 三个接口路径、operationId、状态码（201/200、400/413/415、404、422）、Set-Cookie 续期（同值、Max-Age=604800）、`expires_at`＝最后活动 + 7 天；响应由测试用 OpenAPI 校验；PATCH 的“出现即 confirmed、null/[] 确认留空、区块整体替换、核心三项不得留空、不回显值”与描述一致；GET 不返回 next_field/question（C-03） |
| 分层 | ✅ | 路由只做解析与转换，`validate_upload` 在 services，`DraftService` 不含 SQL（事务经仓储 `transaction()`）；`deps` 懒创建 `DeepSeekClient`（无密钥也能启动），经 clients 层出口，B-02 不变 |
| 过期与滑动续期 | ✅ | `get` 与清理使用同一规则（空闲超过 7 天；恰好 7 天有效）；过期草稿不被刷新；`touch_and_get` 单语句刷新 `last_active_at`，不改 `updated_at`；`update` 在 `BEGIN IMMEDIATE` 内读-合并-写，2 线程各 10 次更新不同字段全部保留（并发测试） |
| 失败补偿（O-02/O-03） | ✅ | `create` 在 `except BaseException` 内清理临时文件后重新抛出，覆盖模型错误、归一失败、插入失败与意外异常；旧草稿仅在新草稿成功后删除，失败只记 `old_draft_cleanup_failed` |
| 测试 | ✅ | 见下表；2.3 有变异验证（把 `validate_update` 调用改为空，23 个用例失败），已读 changelog，未重做 |

### BLOCKING Issues
无。

### QUESTIONS
无（下列偏差已按“DL 确认点”给出建议，裁决前不改变本批结论）。

### 已知偏差：待 DL 裁决，建议均为“接受”
1. **PATCH 一次性合并返回 Pydantic 错误与核心字段语义错误——建议接受。** `error_handlers._handle_validation` 对 PATCH 路径把 `issues_from_pydantic` 与 `core_issues_from_raw(exc.body["fields"])` 去重合并，只输出字段路径与 reason，不含值；与 design §5.2“收集全部问题”和用户体验一致，不增加泄露面。代价：校验逻辑有 Schema 与 `field_validation` 两处，靠 `_check_core` 单点实现收敛，可接受。注意：请求体校验先于令牌检查，无 Cookie 且 body 非法时返回 422 而非 404，不泄露信息，可接受。
2. **模型给值却标 `missing` 时保留值并降为 `uncertain`——建议接受。** 优于丢值（丢值要用户重打）也优于信任（`recognized` 会让用户误以为可信）；用户必须在对话中确认才会变 `confirmed`，不违反 B-04“不猜测补全”（值来自简历而非推测）。已写入测试和 changelog；建议把该规则补进 design §1“解析结果降级规则”，保持文档与实现一致。
3. **标量去首尾空白、手机号保留展示值——建议接受。** 展示值保留用户写法，幂等键由 `identity_key.phone_key`（去空格/连字符、`+86`/`86` 前缀）规范化，二者分离合理；`build_identity` 对展示值也只做 `strip`。2.4 须保证：校验用 `validate_core_fields`（去噪后匹配），存储用展示值，键用 `identity_key`，避免两处规范化不一致。
4. **上传请求体缺少前置大小限制——建议 POC 接受并登记跟踪项。** 我读取的事实：Starlette 在进入路由前已把整个 multipart 体写入 `SpooledTemporaryFile`（超过 1MB 落盘），`_read_limited` 只限制随后读入内存的量，所以超大上传仍会先占用临时磁盘并读完整个体。POC 为本机 `127.0.0.1`、约 5 人，无外部攻击面，最坏后果是临时磁盘/带宽占用，请求结束后临时文件被回收。若将来对外暴露，需加 Content-Length 前置检查（超限直接 413，约 15 行纯 ASGI 中间件，chunked 传输仍须另行限制）。PATCH 的 JSON 体同样没有大小前置限制，字段上限在解析之后才生效，同一条跟踪项覆盖。

### SUGGESTIONS（不阻断）
- **第六批-SUGGEST-1（PATCH 文本列表与区块条目不清理空白项）**：`draft_service._confirmed_node` 对文本列表和区块原样存储。我复现：`skills=[" ", "", "a"]` 存为 `[' ', '', 'a']` 且状态 `confirmed`；`educations=[{}]` 存为一条全 `None` 的条目。与 `normalize` 的“空条目丢弃”不一致，且 changelog 只说明了“不做元素去空白”。建议文本列表丢弃空白项并去首尾空白，区块丢弃全空条目（空集合则等同确认留空），并补测试；若 DL 希望“用户提交原样”，请在 design 写明。
- **第六批-SUGGEST-2（`original_filename` 未过滤控制字符）**：`_display_name` 只取 basename 并截断 255，换行、NUL 等控制字符会原样存库并回显。JSON 序列化会转义，且日志不记文件名，当前无注入路径；建议过滤控制字符（或替换为空），避免日后用在响应头或文件系统时出问题。
- **第六批-SUGGEST-3（`DraftFileStore.delete` 的 TOCTOU 窗口）**：`lstat` 检查与 `unlink` 之间仍有极小窗口（changelog 已披露，`read` 已用 `O_NOFOLLOW`）。目录由服务端独占，POC 可接受；可用 `os.unlink(dir_fd=...)` 配合目录文件描述符进一步收紧。登记跟踪项即可。
- **第六批-SUGGEST-4（`get` 的两语句）**：`get_by_token_hash` 与 `touch_and_get` 之间草稿被清理会返回 404（已处理为 `DraftNotFoundError`，无数据风险）。若想一步到位，可让 `touch_and_get` 的 SQL 带 `last_active_at >= cutoff` 条件，把过期判断与刷新合成一条语句；非必要。
- **第六批-SUGGEST-5（design 文档同步）**：把“有值但声称 missing → uncertain”“PATCH 合并错误报告”“标量去首尾空白”写进 design，避免 3.1 契约测试与 2.4 实现各自解读；并在 AGENTS.md 增加“上传体大小无前置限制”的已知限制说明。
- **第六批-SUGGEST-6（`create` 中 `except BaseException`）**：能保证清理，但同时拦截 `KeyboardInterrupt/SystemExit` 时仍会重新抛出，行为正确；ruff 通过。建议改为 `except Exception` 再加 `finally` 标记成功位的写法更易读，纯风格项。

### 测试与验证证据
| 项目 | 状态 | 说明 |
|---|---|---|
| B-04 | ✅（本批） | 本批三个接口不接触正式库（grep 无引用）；`normalize` 的 confirmed 拒绝与提示注入样本有测试；正向“确认后入库”在 2.4 |
| B-05 | 不适用 | 2.4/2.5 |
| 数据层断言 | ✅ | 上传：行、文件内容、令牌哈希与 Cookie 一致；GET：`last_active_at` 刷新且 `updated_at` 不变；PATCH：库内 `fields_json` 与 `updated_at`，422 时均未变化 |
| 异常路径 | ✅ | 缺文件/空文件/魔数不一致/413/415、模型三类失败、归一失败、意外异常、插入失败、404 四种令牌、38 种非法 PATCH |
| 安全 | ✅ | 无密钥入库（本批新增代码未出现凭证）；日志与错误响应脱敏有测试 |
| mock 策略 | ✅ | 解析器用 fake `ResumeParserClient`（`tests/fakes.py`），仓储用真实 SQLite 与临时目录；无真实模型调用 |

### 本批复跑（merge 后，本 worktree）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ Checked 35 packages |
| `uv run python -m compileall src`（先清 `__pycache__`） | ✅ 退出码 0，输出 39 行 `Compiling '...'`，确认有真实编译动作 |
| `uv run pytest` | ✅ **721 passed**，1 warning（既有 `StarletteDeprecationWarning`），0 failed，0 skipped（上一批为 449，本批净增 272） |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 85 files already formatted |
| 额外探针 | `PYTHONPATH=src` 调用 `_confirmed_node` 复现 SUGGEST-1；运行后 `git status` 无变更 |

### 正向反馈
- 把“模型输出不可信”做成出口不变式（`check_invariants`）加提示注入样本测试，B-04 的防线落在数据层，而不是靠约定。
- 校验、规范化和幂等键各有单点实现（`_check_core`、`identity_key`），为 2.4 复用打好基础。
- 错误响应只含字段路径和 reason，测试用哨兵值反向证明不回显；日志白名单没有为方便而放宽。
- 第四批 SUGGEST 当批落实并附红灯验证；偏差与遗留风险在 changelog 中披露充分，包括上传体大小这类不利事实。

### 更新后的本批结论
**PASS_WITH_SUGGESTIONS**。建议 DL 接受 4 个偏差；SUGGEST-1 建议在 2.4 开工前处理（确认保存会读取这些列表），其余记为跟踪项。进入 2.4 前请带上：展示值与幂等键分离的约定（偏差 3）。

---

## 第七批审查（任务 2.3a 图像预处理 + SUGGEST-1/2；任务 2.4 确认保存，HIGH_RISK：B-04 / B-05）

- 日期：2026-11-10；Review 模式：Ticket-aware Review；Reviewer：Yin Yang（dev-lead，审查 agent 代行）
- 审查对象：合并提交 `bc06373`（含 `850e019`，2.3a）、`0f914a5`（含 `0ccee34`，2.4）；本 worktree 已 `git merge feature`，HEAD `f35bf7f`。对照 tasks 2.3a/2.4、ADR-001/004/005、design §3.6/3.7/5.3/6/9.3、openapi.yaml 0.1.1、AGENTS.md、architectural_constraints（LLM 请求体 ≤ 1 MB）。
- 本批结论：**BLOCKED**（1 BLOCK / 1 QUESTION / 5 SUGGEST）。BLOCK-1 是 B-04 入口的一行级修复，QUESTION-1 是 B-05 的一个未覆盖故障点；两者处理后建议复审通过。
- **HIGH_RISK 最终结论建议**：B-04 —— 有条件通过（BLOCK-1 修复并补测试后通过）；B-05 —— 通过，附 QUESTION-1（提交后抛普通异常的补偿，建议修）；2.4 不建议在 BLOCK-1 修复前标记完成。
- 上下文限制：未做真实 DeepSeek 调用，未验证“压缩后仍可被模型识别”（只有 `test_downscaled_resume_is_still_readable` 的合成可读性）；Pillow 13.0.0 的已知漏洞公告未联网核对（只核了锁文件来源为公共 PyPI、无凭证 URL、精确版本）；对账（2.5）未实现，崩溃类用例只断言对账起点状态。

### Review Scope
| 文件 | 变更类型 | 对应 Task | 风险 |
|---|---|---|---|
| `clients/image_prep.py`、`clients/deepseek_client.py`、`pyproject.toml`/`uv.lock` | 新增/修改 | 2.3a | 高（外发请求体、不可信图片解码） |
| `services/draft_service.py`（列表/区块清理、`is_draft_expired`）、`services/upload_validation.py` | 修改 | 2.3a（第六批 SUGGEST-1/2） | 中 |
| `services/resume_service.py`、`api/routes/resumes.py`、`api/deps.py`、`main.py`、`schemas/resume.py` | 新增/修改 | 2.4 | **高**（唯一写正式库、B-04/B-05） |
| `tests/services/{fault_injection,conftest,test_resume_service,test_resume_service_faults}.py`、`tests/api/test_resumes_confirm.py`、`tests/clients/*` | 新增 | 2.3a/2.4 | — |

### 2.3a 核对结果
| 检查项 | 结论 | 证据 |
|---|---|---|
| 请求体 ≤ 1 MB 对所有外发路径成立 | ✅ | `build_user_blocks` 是 `parse()` 唯一构造入口：照片、PDF 渲染页统一经 `fit_images`；非图片块（文本层、标记、prompt）先算 `_body_size(text_only+tail)` 作为开销，剩余预算按图片数平分，每张再扣 128 字节块开销并按 ×4/3 折算原始字节；最后对完整 blocks 再算一次 `_body_size`，超限即 `ParseFailedError`。`_body_size` 用 `json.dumps` 默认分隔符（比 httpx 紧凑序列化更宽，是上界）。纯文本 PDF（无图）不走 `fit_images`，由末尾总检兜住。`parse()` 先 `build_user_blocks` 后 `post`，超限抛错时不发起外部调用（`test_image_that_cannot_fit…`、`test_text_beyond_budget…` 用 mock transport 断言 0 次请求） |
| 四类用例 | ✅ | 近 10MB 照片、5 页扫描 PDF、文本+图片混合、压到下限仍超限；断言的是 `len(request.content)`（真实序列化后的字节），不是估算值 |
| prompt 与 base64 开销 | ✅ | SYSTEM_PROMPT 与 `response_format` 等都在 `_build_payload` 内，`_body_size` 包含；header 不计入，见 SUGGEST-1 |
| 超限不外发 | ✅ | 同上；`ParseFailedError` 映射 502 `parse_failed`，与 architectural_constraints 一致 |
| Pillow 解压炸弹/像素上限 | ✅（附 SUGGEST-2） | 先读头部 `size`，`w*h > 50,000,000` 即拒绝，不解码；Pillow 自身 `DecompressionBombError` 也被捕获。我实测：1000 万量级之外的 7000×7000 噪声 PNG（147MB 数据，超过上传上限，仅作压力）0.6s 压成 577KB；7200×7200（5184 万像素）被拒绝 |
| 损坏图片 | ✅ | `_load` 捕获 `OSError/ValueError/SyntaxError/UnidentifiedImageError/DecompressionBombError`；我对合成 PNG/JPEG 做截断 + 随机字节变异共 317 个样本（含 10 万×10 万的伪造 IHDR、宽 0），结果只有 `ParseFailedError`（216）与成功（101），无其他异常类型泄出 |
| 透明通道/EXIF | ✅ | RGBA/LA/调色板透明合成到白底；`exif_transpose` 处理方向 |
| 依赖治理 | ✅ | `pillow==13.0.0` 精确版本；`uv.lock` 来源为 pypi.org，无凭证 URL；只在 `clients/image_prep.py` 使用；AGENTS.md 已同步“图像库仅限已批准 Pillow” |
| 第六批 SUGGEST-1（列表/区块清理） | ✅ | `_clean_strings`、`_clean_entry`：文本列表去空白项并 trim，区块丢弃全空条目，空集合即确认留空；`test_text_list_*`、`test_entry_inner_lists_*` 覆盖，作者有红灯记录 |
| 第六批 SUGGEST-2（文件名控制字符） | ✅ | `_display_name` 过滤 Unicode 类别 C* 与 Zl/Zp；`test_original_filename_has_control_characters_removed` |

### 2.4 逐条结论（HIGH_RISK）
| 检查项 | 结论 | 证据 |
|---|---|---|
| **B-04：确认前不入库** | ✅（路径）/ ❌（入口取值，见 BLOCK-1） | 正式库只被 `resume_service.py`（经 `deps.py` 装配）触达，`test_only_the_save_path_touches_the_resume_repository` 以源码扫描固化；upload/GET/PATCH 路径无引用（grep 确认）。`confirm()` 第一行 `confirmed is not True` → `ConfirmationRequiredError`，早于取草稿，不写任何库；API/服务层均有“缺失/false/None 不写库、草稿仍在”的用例 |
| `confirmed` 取值严格性 | ❌ | 见 BLOCK-1：`CreateResumeRequest.confirmed: bool` 为 Pydantic 宽松模式，`"yes"`、`"true"`、`1`、`"on"` 会被转成 `True` 并**成功写库**（我已实测：上传后 `POST {"confirmed":"yes"}` → 201） |
| confirmed 前置 / 顺序 | ✅ | 顺序与 design §5.3 一致：确认 → 取草稿（无/过期 → 404）→ 核心三项（422 + details）→ 规范化 → 查键 |
| 核心三项校验 | ✅ | `validate_core_fields` 与 PATCH 共用 `_check_core`；缺失/超长/格式非法都有用例；details 只含字段路径与 reason |
| identity_key 规范化三处一致 | ✅ | ① 校验：`strip_phone` 后匹配 `^(1\d{10}\|\+\d{6,15})$`（re.ASCII）；② 存储：展示值 `name/phone/email` 只做 `strip`（`build_identity`）；③ 查键与唯一索引：同一个 `Identity` 的 `*_key` 同时用于 `find_by_identity_key` 与 `INSERT`，`uq_resumes_identity(name_key, phone_key, email_key)` 兜底。`test_stored_display_value_and_keys_use_their_own_normalisation` 与 API 用例（`+86 138-0013-8000` / 大小写邮箱命中同一人）固化。注：校验后 `86` 无加号前缀的分支不可达（会先被格式校验拒绝），无害。**变异 M2**（查键处改用未规范化的 phone）→ 同键用例失败（`IntegrityError`→`save_failed`） |
| 幂等（ADR-004） | ✅ | 先查后写 + 唯一索引冲突回查：命中返回已有 `resume_id`/首次 `created_at`，200 `already_saved=true`；不新增、不覆盖、不回显内容（API 用例断言响应恰为 `{**first, already_saved: true}`，库中 `job_title` 仍是首次值，`file/` 只有 1 个终态文件、无 tmp，草稿行与草稿文件均被删）；同键两线程并发（Barrier 使两者都通过预查）一个 201、一个 200，`count(*)=1` |
| **B-05：保存顺序** | ✅ | `check key → stage(tmp+fsync) → create_aggregate(BEGIN IMMEDIATE，主表+子表) → promote(os.replace, 先 lexists 拒绝覆盖) → _finish(先删草稿行再删文件)`，与 ADR-005 一致；tmp 与终态在同目录，rename 原子；`_finish` 先行后文件，行删失败则保留文件（不会出现行指向已删文件） |
| 补偿：stage 失败 | ✅ | `stage` 自身在失败时 `unlink`，服务层再 `_discard_tmp`；源文件缺失先再查键，命中走重复分支，未命中且草稿已不存在 → `draft_not_found`，仍存在 → `save_failed`；用例同时断言 `file/` 为空、两库行数、草稿行与文件仍在，且同一令牌重试成功 |
| 补偿：事务内失败（主表后/子表后） | ✅ | `transaction()` 对 `BaseException` 回滚；用例断言 `resumes` 与三张子表均为 0 行、tmp 已清、草稿保留，重试成功后教育子表 1 行。**变异 M1**（删去事务失败分支的 `_discard_tmp`）→ `db_after_main` 用例失败（`archive_names()` 残留 tmp） |
| 补偿：提交后重命名失败 | ✅ | 重试一次；仍失败 → 保留 tmp、记 `promote_failed`（warning/error）、`SaveFailedError`；记录与 tmp 并存、草稿保留。**变异 M3**（重试改为单次）→ `promote` 注入 `times=2` 的用例失败，`times=1` 用例也受影响。用户再次确认得到 `already_saved=true` 并收尾 |
| 崩溃类（提交后重命名前 / 提交前） | ✅（起点状态） | `SimulatedCrash(BaseException)` 绕过所有 `except Exception`，断言：记录+子表在、仅 tmp（名 `.{id}.pdf.tmp`）、草稿在；提交前崩溃：无记录、有孤立 tmp，供 2.5 对账（对账用例留给 2.5，见偏差 3） |
| 并发同键 | ✅ | 见上；另有 `_after_source_missing`（后到者发现草稿文件已被先到者删除）的再查键路径，`test_source_missing_then_key_found_is_duplicate`。**变异 M4**（删去该再查键）→ 该用例失败 |
| 重命名失败后的对账起点 | ✅（范围内） | 终态名 `{resume_id}{ext}` 已存入 `resumes.file_path`（`final_name`），tmp 名由 id 推出，2.5 只需 `list_refs` + `scan` 即可 roll-forward；窗口内再次确认不会丢弃该 tmp（用例断言“记录的 tmp 未被 discard”）。局限见 SUGGEST-3 |
| Cookie 清除 | ✅ | 201 与 200 均 `Set-Cookie: draft_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`（`cookies.clear` 单点，API 用例逐字比较）；失败路径（422/404/500）不清除，草稿保留可重试，与 openapi 一致 |
| 重复分支不回显已有内容 | ✅ | 响应只含 `resume_id/already_saved/saved_at`；`ResumeRef` 不带个人内容（见 SUGGEST-5 关于存在性探测） |
| 错误响应不泄露 | ✅ | 400/404/422/500 均为固定文案 + `request_id`；`validation_failed.details` 只有字段路径与 reason；`save_failed` 不含异常消息；坏 JSON 体仅返回 `field:'[0]'`、`invalid_format`，无输入回显（我实测） |
| 日志脱敏与无值日志 | ✅ | 新增事件只带 `resume_id/draft_id/count/exception_class` 与栈帧；`test_logs_contain_no_personal_data_filename_or_token` 覆盖成功、重复、校验失败、`promote` 失败四条路径，断言姓名/手机/邮箱/文件名/令牌与令牌哈希均不出现，且确认 `resume_saved`、`promote_failed` 事件确实被记录（非空断言） |
| 分层 | ✅ | 路由只做解析与转换；SQL 仅在仓储；补偿集中在 `ResumeService`；`FaultInjector` 通过子类注入，生产代码无分支 |
| SQL | ✅ | 新增 SQL 全部参数绑定；`create_aggregate` 只把名为 `resumes.name_key` 的约束冲突翻译为重复，其他 `IntegrityError` 原样上抛 |

### 故障注入用例是否真的同时断言库与文件系统
是。`test_resume_service_faults.py` 的每个用例都通过 `ResumeEnv.count()`（独立连接 `SELECT count(*)`）、`query()`（关键列）、`archive_names()`（`file/` 目录列表）、`draft_rows()`、`draft_file_names()`（草稿库与草稿目录）断言，`_assert_clean_failure`/`_assert_saved_once` 把四项绑在一起，不依赖返回码。**变异验证 5 处**（`resume_service.py` 逐一修改，运行 2.4 的服务/故障/API 三组用例，均已 `git checkout` 还原，`git status` 无变更）：

| 变异 | 结果 |
|---|---|
| M1 事务内失败分支去掉 `_discard_tmp` | ✅ 被杀：`test_failure_inside_transaction_rolls_back_everything[db_after_main]` 失败 |
| M2 查键用原始手机号替代 `phone_key` | ✅ 被杀：`test_same_identity_returns_existing_record…` 失败 |
| M3 `_promote` 重试次数 2→1 | ✅ 被杀：`test_rename_failing_twice…` 失败 |
| M4 去掉“源文件缺失后的再查键” | ✅ 被杀：`test_source_missing_then_key_found_is_duplicate` 失败 |
| M5 `confirmed is not True` → `is None` | ✅ 被杀：`test_without_confirmation_nothing_is_written[False]` 失败 |

用例缺口（对应下面的问题）：没有“`confirmed` 为非布尔真值”的用例（BLOCK-1）；没有“提交后抛普通 `Exception`”的用例，`db_after_commit` 只用了 `SimulatedCrash`（QUESTION-1）。

### BLOCKING Issues
#### BLOCK-1：`confirmed` 未做严格布尔校验，非布尔真值也能触发写库（B-04）
**位置**：`src/app/schemas/resume.py`（`confirmed: bool`）；`services/resume_service.py`（`confirmed is not True` 只能防住 Python 层的非 True）
**证据**：design §5.3“`confirmed === true`”、tasks 2.4“`confirmed === true` 前置”、openapi `confirmed: boolean`。实测（临时探针，已删除）：上传草稿后 `POST /api/v1/resumes {"confirmed":"yes"}` → **201 并写库**。Pydantic v2 默认宽松模式会把 `"yes"/"true"/"on"/"1"/1` 转成 `True`。
**问题**：B-04 是 BLOCK 级约束，“用户明确确认”的唯一判据是这个字段；契约声明为布尔 `true`，实现却接受字符串与整数。前端按契约会发布尔，但这是唯一的入口防线，不应依赖调用方自律。
**影响**：任何 `"1"`、`1`、`"yes"` 之类的误传（调用方 bug、脚本）都会被当作用户确认而入库；与“确认才入库”的契约不一致，测试也没有覆盖。
**修复建议**：把字段改为 `StrictBool`（或 `Field(strict=True)`），非布尔值按现有处理器走 `validation_failed`/`confirmation_required`（须定一个：openapi 只写“缺失或 false → confirmation_required”，建议非布尔值同样归 `confirmation_required`，并在 `_handle_validation` 里识别 `bool_type` 错误）；补参数化用例 `"yes"/"true"/1/"1"/"on"/null/[]/{}` 全部 422 且 `count(*)=0`、草稿与 `file/` 不变，并过一次红灯。
**违反约束**：B-04；design §5.3。

### QUESTIONS
#### QUESTION-1：提交之后才抛出普通异常时，补偿会删除 tmp，留下“有记录无文件”（B-05）
**位置**：`services/resume_service.py` `_save_new`，`except Exception` 分支（约 120–124 行）
**证据**：我在 `FaultyResumeRepository.create_aggregate` 的 `db_after_commit` 点注入 `RuntimeError`（非 `SimulatedCrash`），结果：`resumes` 1 行、`file/` **空**（tmp 被 `_discard_tmp` 删除）、草稿仍在，接口返回 `save_failed`。此后用户重试会命中幂等键走重复分支并**删除草稿与草稿文件**，原始文件就永久丢失，而 2.5 的情形④只告警不修复。
**问题**：当前代码把“`create_aggregate` 抛异常”一律当作“未提交”。大多数情况成立（事务内失败会回滚），但 COMMIT 之后的异常（`conn.close()`、COMMIT 返回 IOERR 而事务实际已持久化等“提交结果不明”）会违反 B-05 的核心不变式。概率很低，后果是不可恢复的数据丢失。
**需要谁裁决**：Dev Lead（是否在 2.4 内修）。我的建议：修，改动很小——在通用异常分支里先按 `resume_id` 查一次 `resumes`（仓储加 `exists(resume_id)`，只读），存在则视为已提交，转入 `_promote`/`_finish`；不存在才 `_discard_tmp` + `save_failed`；补一个 `db_after_commit` 抛普通异常的用例（预期 201/记录与终态文件齐全）。
**不同答案的影响**：接受现状＝在极端 IO 故障下可能出现不可自动恢复的“有记录无文件”，需在 AGENTS.md 登记为已知限制；修复＝约 10 行 + 1 个测试，B-05 在“提交结果不明”下也成立。

### SUGGESTIONS（不阻断）
- **第七批-SUGGEST-1（1 MB 的口径与余量）**：`MAX_REQUEST_BYTES = 1024*1024` 且只计 body。若 LLM 侧的“1 MB”按 10⁶ 字节计，或其网关把请求头计入，当前最坏情形会超出约 4.8 万字节。建议向项目方确认口径；不确认则取 1,000,000 并扣除 4 KB 头部余量，成本是图片略小。
- **第七批-SUGGEST-2（像素上限与解码内存）**：`MAX_SOURCE_PIXELS = 50,000,000` 意味着一个很小的 PNG（高压缩）可解出约 150MB 的 RGB（`_flatten`/`exif_transpose` 还会再拷贝一到两份）。上传上限只有 10MB，本机 POC 单用户可接受；建议降到 25,000,000（约 5000×5000，足够 A4 扫描 600dpi），并在 `Image.open` 时指定 `formats=("PNG","JPEG")`，与上传阶段魔数校验一致，缩小解码器攻击面。
- **第七批-SUGGEST-3（提交后重命名失败的窗口）**：对账只在启动时运行，期间 `file/` 只有 tmp，而用户再次确认会得到 `already_saved=true`（甚至 200 告知“已保存”）。建议在重复分支里顺带“若 `exists_tmp` 且无终态则尝试 `promote`”（best effort，失败只记日志），把窗口从“直到重启”缩到“下一次确认”；也可只登记为已知限制（ADR-005 已披露）。
- **第七批-SUGGEST-4（文档同步）**：在 design/AGENTS.md 记录三个偏差的最终口径（见下），并把“`confirmed` 非布尔 → 错误码”补进 openapi 描述；2.3a 的 changelog 已写明用例数，但 AGENTS.md 的依赖表建议同时给出 Pillow 的用途边界（已写）与安全公告跟踪方式。
- **第七批-SUGGEST-5（存在性探测）**：重复分支返回已有 `resume_id` 与 `saved_at`，任何能上传并命中 (姓名,手机,邮箱) 的人都能探测“某人是否已入库”。ADR-004/D-04 已接受，POC 本机约 5 人无外部面；若将来对外暴露，需要重新评估（例如只返回 `already_saved` 而不返回 id）。

### worker 偏差评估
1. **`confirmed` 检查放在 service——建议接受。** 规则在 service 层是业务前置条件，且放在取草稿之前，与 design 流程图一致；路由只做解析。但这使得 Schema 层的取值严格性成为唯一缺口，见 BLOCK-1（接受偏差的前提是 BLOCK-1 修复）。
2. **过期草稿按 `draft_not_found`、抽出 `is_draft_expired`——建议接受。** 与 GET/PATCH 及清理任务共用同一规则（空闲超过 TTL；恰好 TTL 有效），不放行已过期草稿入库，B-04 更保守；抽出函数后 `DraftService._is_expired` 委托到它，行为未变，原有用例通过。过期草稿不会被本接口删除，由清理任务回收。
3. **崩溃类用例对账后断言留给 2.5——建议接受。** 本批已断言了对账的起点状态（记录+tmp / 无记录的 tmp / 草稿保留），并且重复确认不丢弃该 tmp；2.5 的 tasks 已写明联调。要求：2.5 须补“对账后终态文件内容正确、tmp 消失、记录不变”的断言，并复用 `FaultyArchiveStore` 构造这些起点。
4. **覆盖率/CRAP 未实测——已由我补测。** 来源：`uv run pytest --cov=app --cov-branch`（本地，pytest-cov），整体 98%（行+分支）。`resume_service.py` 93%，未覆盖：118–119（`duplicate_vanished`）、140–141（`_resolve_source` 抛 `ValueError`）、152–154（stage 时源文件仍在但归档侧缺失）、204–205（`tmp_cleanup_failed`），均为防御性分支，行为上都是 `save_failed` 或仅记日志；`image_prep.py`、`deepseek_client.py`、`routes/resumes.py` 100%。CRAP：未运行 `~/tools/crapper`（该工具不会读取 Python 的 `.coverage`，按 0% 覆盖估算会失真），手工估算：`ResumeService.confirm`/`_save_new`/`_stage` 的圈复杂度分别约 5/6/5，覆盖率均 ≥ 90%，CRAP < 10，**未经工具实测**。

### 测试与验证证据
| 项目 | 状态 | 说明 |
|---|---|---|
| B-04 | ⚠ | 路径与顺序有测试；取值严格性缺失（BLOCK-1） |
| B-05 | ✅（附 QUESTION-1） | 10 类故障点：stage 两处、事务内两处、并发、提交后崩溃（两点）、提交前崩溃、重命名失败一次/两次、收尾三种失败；全部同时断言库与文件系统 |
| 数据层断言 | ✅ | `count(*)`、`file_path` 列、子表行数、`job_title` 未被覆盖、`file/` 与草稿目录列表 |
| 异常路径 | ✅ | 缺确认、令牌 None/空/未知/过期、核心三项缺失与非法、模型不参与本接口 |
| 安全 | ✅ | 日志与错误响应脱敏有测试；无密钥；Pillow 精确版本；解压炸弹/损坏图片 317 个变异样本无异常泄出 |
| mock 策略 | ✅ | 真实 SQLite + 临时目录；故障通过子类注入；外发用 `httpx.MockTransport` 断言 0 次/请求字节数 |

### 本批复跑（merge 后，本 worktree）
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅（首次补装 `pillow==13.0.0`，其余已就绪） |
| `uv run python -m compileall src`（先清 `__pycache__`） | ✅ 退出码 0，42 行 `Compiling '...'`，有真实编译动作 |
| `uv run pytest` | ✅ **795 passed**，1 warning（既有 `StarletteDeprecationWarning`），0 failed（基线 795，与之相符） |
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 93 files already formatted |
| `uv run pytest --cov=app --cov-branch` | 整体 98%（见偏差 4） |
| 变异与探针 | 5 处变异 + 4 个临时探针测试文件，均已删除/还原；`git status --short` 在代码根与仓库根均无变更 |

### 正向反馈
- 请求体预算同时校验“估算（分配）”与“真实总量（出口再算一次）”两道，漏估不会外发；纯文本 PDF 也被出口总检兜住。
- 补偿全部集中在 `ResumeService`，故障注入用子类替身实现，生产代码零测试分支；`BaseException` 的 `SimulatedCrash` 准确模拟了“进程被杀不执行补偿”。
- 用例同时断言两个库与两个目录，并有 5 处我的变异都被杀；“记录的 tmp 在重复确认时不被丢弃”这种细节也有用例固定。
- 先把 `_after_source_missing` 的再查键写成独立路径，避免把并发已保存误报为失败；日志测试带“非空断言”，防止“因为没打日志所以没泄露”的假通过。

### 更新后的本批结论
**BLOCKED**：请先修 BLOCK-1（`StrictBool` + 红灯用例），并由 DL 裁决 QUESTION-1（建议修）。两项完成后，我建议 2.3a 通过、2.4 的 B-04/B-05 通过，SUGGEST 记为跟踪项。

## 第七批复审（任务 2.4 修复：BLOCK-1 / QUESTION-1 / SUGGEST-1~5，HIGH_RISK）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；Review 模式：复审
- 审查对象：`git merge feature` 后 HEAD `0aba56a`，确认含修复提交 `a5ff60b`、`75f3c97`、`24db1eb`、`5178f31`、`4b7abc6`、`1f650d9`（`git merge-base --is-ancestor` 逐一为真）。
- **本批结论：通过（0 BLOCK / 0 QUESTION）。HIGH_RISK 最终结论：B-04 通过，B-05 通过，建议 DL 将 2.4 标 ✅。**
- 上下文限制：未做真实 DeepSeek 调用；未联网核对 Pillow 公告（SUGGEST-4 已登记为跟踪项）；未运行 `~/tools/crapper`（本批新增代码为 1 个只读方法与 1 个分支，复杂度增量极小）。

### 逐项复核
| 项 | 结论 | 证据 |
|---|---|---|
| BLOCK-1 `confirmed` 严格布尔 | ✅ | `schemas/resume.py` 改为 `StrictBool`；`error_handlers._is_missing_confirmation` 把 `bool_type` 与 `missing` 同归 `confirmation_required`。用例 `test_without_confirmation_is_422_and_writes_nothing` 参数化 `false/缺失/"yes"/"true"/1/"1"/"on"/null/[]`，断言 422、`code=confirmation_required`、`count(*)=0`、草稿与文件仍在。契约核对：openapi 0.1.1 第 182 行「缺失或 false → 422 confirmation_required」，第 228 行响应描述同；契约未明文覆盖非布尔值，实现将其归 `confirmation_required`，与我上批建议一致，无泄露输入（固定文案 + request_id）。遗留：整个请求体不是对象（如 `[]`）时 Pydantic 报 `model_attributes_type`，仍走 `validation_failed`，同样不写库，不影响 B-04。 |
| QUESTION-1 提交后普通异常 | ✅ | `_save_new` 通用异常分支改为：先 `_committed(resume_id)`（调用新增只读 `ResumeRepository.exists`），已提交或**无法确认**则保留 tmp，仅记 `db_write_failed`/`commit_check_failed`，返回 `save_failed`；确认未提交才 `_discard_tmp`。偏向“保留”是正确的安全方向：多留的 tmp 由 2.5 对账清理，误删则不可恢复。用例 `test_plain_exception_after_commit_keeps_record_and_tmp` 断言：`resumes`、教育子表各 1 行，仅存 `.{id}.pdf.tmp`，草稿行与草稿文件仍在；重试得到 `already_saved=true` 且 tmp 仍在，对账起点可 roll-forward。事务内失败的既有用例（tmp 被清、草稿保留）仍通过。注意：本次保留 tmp 后进程内不自动 promote，依赖启动对账，作为已知限制登记（见 AGENTS.md，对应 SUGGEST-3）。 |
| `exists` 只读查询安全性 | ✅ | `SELECT 1 FROM resumes WHERE id = ?` 参数绑定；`closing(connect(...))` 独立连接，无写、无锁升级；`resume_id` 为服务端生成的 UUID，非用户输入；该方法抛错被捕获并按“已提交”处理，不会掩盖原异常（原异常仍 `raise SaveFailedError() from exc`）。`test_only_the_save_path_touches_the_resume_repository` 仍通过，正式库仍仅由保存路径触达。 |
| SUGGEST-1 请求体上限 | ✅ | `MAX_REQUEST_BYTES = 1_000_000 - 4*1024 = 995,904 ≤ 996,000`。外发路径只有一条：`build_user_blocks`→`fit_images(…, available = MAX_REQUEST_BYTES - overhead)` 与出口 `_body_size(blocks) > MAX_REQUEST_BYTES` 总检，grep 确认 `src` 内无其他引用或旁路；超限不发起请求的既有用例仍通过；新增常量断言用例。 |
| SUGGEST-2 像素与格式 | ✅ | `MAX_SOURCE_PIXELS = 25_000_000`，头部读尺寸后拒绝；`Image.open(..., formats=("PNG","JPEG"))`。用例：5100×5100 PNG（26.01MP）被拒；GIF/BMP/WEBP/TIFF 被拒；JPEG 通过。 |
| SUGGEST-3/4/5 登记 | ✅ | `AGENTS.md` 登记：对账仅启动时运行的窗口（已知限制）；SUGGEST-4（design/openapi 补写非布尔→`confirmation_required`、Pillow 公告跟踪）与 SUGGEST-5（存在性探测，对外暴露前重评）列为跟踪项；图像口径同步。`changelog.md` 增 30 行。登记属“记录而非修复”，符合我上批的不阻断定性；openapi 描述尚未补写，仍待 SUGGEST-4 跟进。 |

### 变异验证（均已还原，`git status --short` 无变更）
| 变异 | 结果 |
|---|---|
| `confirmed: StrictBool` → `bool` | ✅ 被杀：5 个参数化用例失败（`"yes"/"true"/1/"1"/"on"`），BLOCK-1 复现场景在修复版不再复现（`null`、`[]` 本身被 Pydantic 拒绝，故不依赖 StrictBool） |
| `if not self._committed(resume_id):` → `if True:` | ✅ 被杀：`test_plain_exception_after_commit_keeps_record_and_tmp` 失败，即 QUESTION-1 的“有记录无文件”场景在修复版不再复现 |
| `MAX_SOURCE_PIXELS` 25M → 50M | ✅ 被杀：`test_source_pixel_limit_is_25_million` 失败 |

### 本批复跑
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ Checked 36 packages |
| `compileall src`（先清 `__pycache__`） | ✅ 42 行 `Compiling`，有真实编译动作 |
| `uv run pytest` | ✅ **810 passed**，1 warning（既有 Starlette 弃用），基线 810 相符 |
| `ruff check .` / `ruff format --check .` | ✅ All checks passed / 93 files already formatted |

### 最终结论
**通过。** B-04（路径、顺序、取值严格性）与 B-05（保存顺序、补偿、提交后异常）均满足；2.3a 及 SUGGEST-1/2 修复到位。建议 DL 将 2.4 标 ✅。跟踪项：SUGGEST-3（对账窗口）、SUGGEST-4（openapi/design 文档补写）、SUGGEST-5（存在性探测）；2.5 须补“对账后终态文件正确、tmp 消失”的断言，并覆盖本批新增的“提交后异常保留 tmp”起点。

## 第八批审查（任务 2.5 启动对账 ReconcileService，HIGH_RISK：B-05）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；Review 模式：Ticket-aware Review
- 审查对象：`e3bd9ac`（合并提交 `14551c8`；`git merge-base --is-ancestor e3bd9ac HEAD` 为真）。对照 ADR-005、design §3.6/5.4/9.3、tasks 2.5、schema S§4.2。
- **本批结论：通过（0 BLOCK / 0 QUESTION / 4 SUGGEST）。HIGH_RISK 最终结论：B-05 的对账部分通过，建议 DL 将 2.5 标 ✅；但“对账与请求处理不竞争”目前没有任何代码保证，必须作为 2.7 的前置要求（见下）。**
- 上下文限制：对账尚未接入 `src`（`grep` 确认无调用方，留给 2.7），本批只能验证服务本身；未对真实大量文件/真实崩溃做压力测试；覆盖率见下。

### 四情形与不变式核对
| 检查项 | 结论 | 证据 |
|---|---|---|
| ① 记录+仅 tmp → roll-forward | ✅ | `_check_records`：`ref.file_path` 非终态且 tmp 命中 → `archive.promote`（`os.replace`，且先 `lexists` 拒绝覆盖）；用例按 .pdf/.jpg/.png 断言终态内容、tmp 消失、记录不变 |
| ② 无记录 tmp → 删除 | ✅ | `_remove_orphans`；仅当 `final_name(entry)` 不在记录路径且 `entry.resume_id` 不属于任何记录 |
| ③ 无记录终态 → 删除 | ✅ | 同上 |
| ④ 记录无文件无 tmp → 告警 | ✅ | `missing_files` 计数 + `reconcile_record_file_missing`（只含 resume_id），不删记录；若存在同 id 他名文件则不报“丢失”而归入冲突 |
| 幂等 | ✅ | `test_reconcile_is_idempotent`；第二次运行全为 0（2.4 联调用例中也断言） |
| 单条失败不影响其余 | ✅ | `_roll_forward`、`_remove` 各自 `try/except Exception`，计入 `failed` 并记 `reconcile_entry_failed`；有“某条 promote 失败/某条 delete 失败”两个用例 |
| 整体 aborted 时不删任何文件 | ✅ | `list_refs()` 与 `scan()` 都在任何删除之前执行，抛错 → `run()` 捕获，返回 `aborted=True`；`test_database_failure_aborts_without_deleting_anything`、`test_directory_scan_failure…` |
| 只处理 `file/`、不碰草稿目录 | ✅ | 服务构造器只收 `ResumeRepository`、`ArchiveFileStore`、`Clock`（`test_service_depends_only_on_…` 以源码固化）；`test_draft_directory_is_not_touched` |
| 只处理可识别命名 | ✅ | `scan()` 把非 `<id>.<ext>` / `.<id>.<ext>.tmp` 的文件、符号链接归为 unknown 并跳过；目录跳过；`ArchiveFileStore._path` 拒绝符号链接与路径穿越 |
| 日志不含内容 | ✅ | 事件只带 `resume_id`、`count`、`duration_ms`（均在 `ALLOWED_FIELDS`）与栈帧；`test_logs_contain_only_counts_and_ids_no_content` 含非空断言；对账失败级别为 warning/error，不静默 |
| 失败不阻止启动 | ✅ | `run()` 捕获 `Exception`（`SimulatedCrash(BaseException)` 不吞，有用例）；仍写 `reconcile_done` |
| 与 2.4 衔接 | ✅ | 提交后崩溃（`promote`/`db_after_commit` 的 `SimulatedCrash`）、重命名连续失败、提交后普通异常（QUESTION-1 修复后保留的 tmp）三个起点，在 `test_resume_service_faults.py` 里补全“对账→终态文件内容与草稿原文件一致、tmp 消失、`SELECT * FROM resumes` 不变、子表仍 1 行、二次对账为 0”；提交前崩溃：tmp 被删、草稿保留可重试 |

### “误删文件”风险路径（逐条）
| 路径 | 结论 |
|---|---|
| 读记录失败 | ✅ 先读后删，异常 → aborted，零删除（变异 M2 被杀） |
| 同 id 不同扩展名（记录 `X.pdf`，文件 `X.png` 或 `.X.png.tmp`） | ✅ 归冲突，不删不动（变异 M1 被杀） |
| 记录同时有 tmp 与终态 | ✅ 归冲突，不覆盖、不删 tmp（变异 M4 被杀） |
| 终态位置被符号链接占用 | ✅ 符号链接属 unknown，promote 的 `lexists` 拒绝覆盖，计 failed |
| 并发中的 tmp / 刚提交的终态 | ⚠ **服务本身无防护**，见 SUGGEST-1：`list_refs()` 先于 `scan()`，若与请求并发，新建的 tmp（尚无记录）或刚提交的终态（记录在快照之后）会被当作孤儿**删除**，造成“有记录无文件”。安全性完全取决于“对账完成前不接收请求” |
| 记录库被误清空/换新而文件目录有数据 | ⚠ 见 SUGGEST-2：空记录集会把 `file/` 下全部终态文件当孤儿删除（符合 S§4.2 字面，但不可逆） |

### 2.7 前置要求（必须写入 tasks 2.7）
1. `lifespan` 中 `ReconcileService.run()` 必须**同步**执行完毕后才开始接收请求（yield 之前），不得放入后台线程、不得与 `CleanupService` 调度线程并行；2.7 的“对账在首个请求前完成”用例须断言这一顺序，并以记录调用序列的假对象固化。
2. 仅支持单进程单 worker（多 worker 时各自启动对账会互相删除对方正在保存的 tmp）；需在 2.7 与 AGENTS.md 里写明，并确保不会在运行期被重复调用（本服务不是运行期可调用的）。
3. 传入对账的 `ResumeRepository` / `ArchiveFileStore` 必须与请求处理共用同一 `DATA_DIR`/`FILE_DIR` 配置，且 `init_resumes_db` 在对账之前完成（避免新建空库→SUGGEST-2 的批量误删）。

### SUGGESTIONS（不阻断）
- **第八批-SUGGEST-1（调换读取顺序，成本为零）**：把 `scan()` 放在 `list_refs()` 之前。这样即使与保存并发，也只会出现“扫描见到 tmp、记录已提交 → 去 promote（与请求的 promote 竞争，最多 `FileNotFound` 计 failed）”，而不会出现“记录尚未可见的文件被当孤儿删除”（终态文件只在提交之后才存在，后读的记录必然包含它）。作为 2.7 前置要求之外的纵深防御。
- **第八批-SUGGEST-2（批量删除保险丝）**：当记录数为 0（或孤儿终态文件数占比异常）而 `file/` 下有终态文件时，不删终态文件，只告警并返回 `conflicts`/单独计数，等人工确认。这类场景只会来自配置错误或库被替换，自动删除不可恢复。
- **第八批-SUGGEST-3（aborted 语义）**：`run()` 在 `_reconcile()` 中途抛出非预期异常时返回 `ReconcileReport(aborted=True)`，丢失已完成的计数；而模块说明“aborted 即未改动任何内容”对中途异常并不严格成立（读取阶段才严格成立）。建议调整注释，或保留已累计计数。
- **第八批-SUGGEST-4（情形④的运维入口）**：记录无文件只在启动日志告警一次；2.7/运维文档需写明处理方式（从备份恢复文件或人工处理记录），避免告警被忽略。

### 变异验证（均已还原，`git status --short` 在代码根与仓库根无变更）
| 变异 | 结果 |
|---|---|
| M1 删除“同 id 他名文件归冲突”分支 | ✅ 被杀：`test_same_id_but_different_extension_is_not_deleted` |
| M2 读记录失败时当作空列表继续 | ✅ 被杀：`test_database_failure_aborts_without_deleting_anything` |
| M3 roll-forward 改为删除 tmp | ✅ 被杀：15 个用例（含 2.4 的提交后崩溃联调） |
| M4 记录同有 tmp 与终态时删除 tmp | ✅ 被杀：`test_record_with_both_tmp_and_final_loses_nothing` |
| M5 单条失败只捕获 `FileNotFoundError`（其余异常中断） | ✅ 被杀：`test_one_failing_roll_forward_does_not_block_the_rest` |

（过程说明：我在 M3 的 shell 命令里误写了重定向，生成了一个无关的临时文件 `delete`，已立即删除，未入库。）

### 本批复跑
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ Checked 36 packages |
| `compileall src`（先清 `__pycache__`） | ✅ 43 行 `Compiling`，有真实编译动作 |
| `uv run pytest` | ✅ **839 passed**，1 warning（既有），基线 839 相符 |
| `ruff check .` / `ruff format --check .` | ✅ All checks passed / 95 files already formatted |
| 覆盖率 | `uv run pytest --cov=app.services.reconcile_service --cov-branch`（本地 pytest-cov，对账与 2.4 故障两组用例）：`reconcile_service.py` **行 97/97、分支 24/24 = 100%**；CRAP 未用 `~/tools/crapper`（该工具不读 Python `.coverage`），各方法圈复杂度 ≤ 6 且覆盖 100%，手工估算 < 10，未经工具实测 |

### 最终结论
**通过，建议 DL 将 2.5 标 ✅。** 四情形、幂等、局部失败隔离、aborted 零删除、只碰 `file/` 与日志脱敏均有测试并被变异验证；与 2.4 的三类提交后故障已联调到“终态文件内容正确、tmp 消失、记录不变”。放行前提：2.7 按上文三条前置要求落实（尤其“对账同步完成于首个请求之前”）；SUGGEST-1/2 建议在 2.7 之前或同期处理。

## 第九批审查（任务 2.6 草稿清理 CleanupService + 2.7 启动编排 lifecycle）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；Review 模式：Ticket-aware Review
- 审查对象：`40f00c5`（2.6）、`88f3099`（2.7），合并提交 `5a6080f`（两者 `merge-base --is-ancestor` 均为真）。对照 tasks 2.6/2.7、design §3.2/5.4/5.5、D§1 启动顺序、第八批「2.7 前置要求」。对账（2.5）已审过的路径不重复，只看本批对 `reconcile_service.py` 的改动。
- **本批结论：通过（0 BLOCK / 0 QUESTION / 3 SUGGEST）。建议 DL 将 2.6、2.7 标 ✅。对账“保险丝”建议接受（附一条文档同步要求，不需 DL 额外裁决，仅知会）。**
- 上下文限制：未做 uvicorn 真实进程启动演练（作者已披露，生命周期以 `TestClient` 的 `with` 块验证）；调度线程“间隔到达再次清理”用缩短间隔 + 事件等待验证，未做长时间运行；清理与确认的竞态沿用 design §5.5 的 POC 接受结论，我未重新论证。

### 第八批「2.7 前置要求」逐条落实
| 要求 | 结论 | 证据 |
|---|---|---|
| 对账在 yield 前**同步**执行且仅一次 | ✅ | `lifespan` 先调 `lifecycle.start()`，`start()` 依次 `prepare_directories → init_databases → reconcile → cleanup → start_scheduler`，之后才 `yield`。`reconcile()` 在启动线程内直接调用，不起线程。用例：`test_reconcile_runs_synchronously_in_the_starting_thread`、`test_requests_start_after_the_whole_sequence`、`test_real_start_reconciles_before_the_first_request`（真实步骤，请求前已修复） |
| 不与清理调度并行 | ✅ | 调度线程 `_schedule` 只调 `self.cleanup()`；`test_reconcile_is_called_once_even_when_the_scheduler_ticks` 在多次 tick 后断言对账仅 1 次；`test_only_the_lifecycle_module_uses_the_reconcile_service` 用源码扫描固定“只有 lifecycle.py 引用 ReconcileService” |
| 单进程单 worker 说明 | ✅ | `lifecycle.py` 模块头与 AGENTS.md（运行形态、对账约束）均写明 `--workers 1`，并解释原因（对账会删无记录文件） |
| 两库先于对账初始化、请求与启动共用同一目录配置 | ✅ | `init_databases` 在 `reconcile` 之前；`test_requests_and_start_up_share_the_same_directories`；`test_real_start_with_missing_database_never_wipes_the_archive` |
| 对账/清理失败不阻止启动；建目录/初始化失败终止启动 | ✅ | `reconcile()`、`cleanup()` 各自 `try/except Exception` 记日志；`test_reconcile_failure_does_not_block_start…`、`test_database_initialisation_failure_stops_the_start`（此时调度线程尚未创建，无泄漏） |
| 调度线程异常不终止、停止时 join | ✅ | `cleanup()` 吞普通异常，循环继续（`test_cleanup_failure_does_not_block_start_and_does_not_kill_the_thread`）；`stop()` 先 `Event.set()` 再 `join(5s)`，超时记 `scheduler_stop_timeout`，守护线程不会拖住退出；`stop()` 幂等；`with TestClient` 无线程泄漏用例 |

### 2.6 CleanupService
| 检查项 | 结论 | 证据 |
|---|---|---|
| 只清草稿（库行 + 草稿文件），不碰 `file/` | ✅ | 构造器只收 `DraftRepository`、`DraftFileStore`、`Clock`（源码扫描用例固定）；`test_archive_directory_is_never_changed` 往 `file/` 放文件，清理前后目录不变；`DraftFileStore.delete` 对非草稿命名/符号链接抛 `ValueError`，被当作“不属于我们”跳过 |
| 过期判断与 `is_draft_expired` 一致 | ✅ | 清理用 `DELETE … WHERE last_active_at < cutoff`（cutoff = now − ttl 天，`format_utc` 固定宽度字符串，字典序等价时间序）；`is_draft_expired` 是 `parse_utc(last_active_at) < now − ttl`。同为严格小于：恰好 7 天保留、+1 秒删除，用例固化 |
| 先删行后删文件 | ✅ | `delete_expired(...RETURNING file_path)` 先提交，再逐个删文件；崩溃只留孤儿文件，不留指向缺失文件的行（`test_rows_are_deleted_before_their_files`） |
| 孤儿 1 天窗口 | ✅ | 文件被引用或 `modified_at >= now−1d` 一律不删；上传“先写文件后写行”的进行中保护成立 |
| 读取失败不删孤儿 | ✅ | `list_files()`/`list_file_paths()` 任一失败 → 返回 (0,1)，不删任何文件（`test_unreadable_row_list_means_no_orphan_is_deleted`） |
| 单条失败不影响其余、普通异常不抛出 | ✅ | 每个文件删除各自捕获并计 `failed`；行删除失败整体捕获 |
| 日志无内容 | ✅ | 事件只带 `count` 与异常类/栈帧；`test_logs_contain_only_counts` |
| 幂等 | ✅ | `test_cleanup_is_idempotent` |

### 重点评估 (a)：先写实现后补测试，测试是否真能转红
我对 lifecycle/清理逐一做变异，**全部被杀**（共 8 处；还原后 `git status --short` 无变更）：
| 变异 | 结果 |
|---|---|
| A 对账与清理换序 | ✅ `test_start_order_…`、`test_requests_start_after_the_whole_sequence` 失败 |
| B 对账放入后台线程 | ✅ `test_reconcile_runs_synchronously_in_the_starting_thread`、`test_real_start_reconciles_before_the_first_request` 失败 |
| H 对账先于数据库初始化 | ✅ 启动顺序用例失败 |
| F 调度线程里调用对账 | ✅ `test_reconcile_is_called_once_even_when_the_scheduler_ticks` 失败 |
| E `stop()` 不置位事件 | ✅ `test_stop_joins_the_scheduler_thread` 失败 |
| C 取消保险丝 | ✅ `test_real_start_with_missing_database_never_wipes_the_archive`、`test_final_files_are_kept_when_there_are_no_records_at_all` 失败 |
| D 去掉孤儿 1 天窗口 | ✅ `test_orphan_window_is_one_day` 等 2 个失败 |
| G 去掉“被引用文件不删” | ✅ 5 个用例失败（含 `test_referenced_file_is_never_an_orphan_however_old`） |

结论：测试并非“事后贴合实现”，有断言顺序、线程归属、调用次数的行为级用例，且 A/B/F/H 使用记录调用序列的假对象与真实步骤两种口径。作者在 changelog 中也披露了 8 处自检变异，与我的结果一致。

### 重点评估 (b)：对账“保险丝”（零记录不删终态文件）
**判断：合理，建议接受（需知会 DL，不需要额外裁决）。**
- 理由：终态文件只在事务提交之后才会出现，且本期没有删除记录的功能，所以“零记录但有终态文件”不可能由正常运行产生，只会来自误删/换成空库/配置指向错误目录。此时按 Schema §4.2 字面执行会一次性、不可逆地清空整个归档，风险远大于残留几个文件。保险丝只改变这一种状态，tmp 仍照常处理，情形①④与“有记录”时的③不变。
- 孤儿会不会永久残留？仅在**记录数恒为 0** 时残留，而此状态只有在上述外部原因下存在；一旦出现任何一条记录，下次启动③恢复正常删除。每次启动都会写 `reconcile_conflicts`（含数量），AGENTS.md 运维表给了处置步骤（先核对 `DATA_DIR`/`FILE_DIR`，确认后人工清理）。所以不是静默残留。
- 残余缺口（不阻断）：库被替换成“只有少量记录的库”时，保险丝不触发，其余终态文件仍会被删。这是该保险丝的固有边界，见 SUGGEST-1。
- 文档：Schema §4.2 的表格仍是原字面，本批只改了 AGENTS.md。要求在 `sql_ddl_resume.md` §4.2 情形③加一句脚注（零记录例外，引用本节），否则文档与行为不一致，见 SUGGEST-2。

### 对账改动（本批新增）核对
- SUGGEST-1（先 `scan()` 再 `list_refs()`）：✅ 已落实且有读取顺序用例，我的变异覆盖到顺序语义在 2.5 评审中已说明。
- SUGGEST-3（中途异常保留已累计计数并 `aborted`）：✅ `counts` 提到 `run()` 里，异常时 `counts.report(aborted=True)`，`counts.log()` 在 try 之外，日志仍输出。
- 2 个原用例补了“一条无关记录”以避开保险丝：改动合理，不是放宽断言（被测行为不变）。

### SUGGESTIONS（不阻断）
- **第九批-SUGGEST-1（保险丝的残余缺口）**：可再加一条比例保险丝（例如孤儿终态文件数超过记录数的 N 倍、或超过某绝对值时只告警不删）；POC 约 5 人规模可不做，已在 AGENTS.md 范围内说明即可。
- **第九批-SUGGEST-2（文档同步）**：在 `sql_ddl_resume.md` §4.2 情形③及 design §5.4 增加“零记录时终态文件保留并告警”的注记；`tasks.md` 2.5 的“情形③”描述同步。
- **第九批-SUGGEST-3（未覆盖行）**：`lifecycle.py` 第 76 行（`scheduler_stop_timeout` 告警）未覆盖；可补一个让清理阻塞超过 join 超时的用例，或接受（仅日志）。

### 本批复跑
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ Checked 36 packages |
| `compileall src`（先清 `__pycache__`） | ✅ 45 行 `Compiling` |
| `uv run pytest` | ✅ **876 passed**，1 warning（既有），与基线一致 |
| `ruff check .` / `ruff format --check .` | ✅ All checks passed / 99 files already formatted |
| 覆盖率 | `uv run pytest --cov=… --cov-branch`（本地 pytest-cov，全量用例）：`cleanup_service.py` 行 65/65、分支 6/6 = 100%；`reconcile_service.py` 100%；`lifecycle.py` 97%（缺第 76 行）。CRAP 未用 `~/tools/crapper`（不读 Python `.coverage`），手工估算各方法复杂度 ≤ 5，< 10，未经工具实测 |
| 工作区状态 | 变异全部还原，`git status --short` 无变更 |

### 最终结论
**通过。** 2.7 的三条前置要求全部落实并被变异验证；2.6 只清草稿、过期规则与 `is_draft_expired` 一致、失败隔离且日志脱敏。保险丝改变了 Schema §4.2 情形③在“零记录”时的字面行为，评估为合理的安全加固，建议接受并补文档注记（SUGGEST-2）。建议 DL 将 2.6、2.7 标 ✅。

## 第十批审查（backend 阶段 3：3.1 契约、3.2 端到端与脱敏、3.3 质量实测、文档注记、CRAP 重构）

- 日期：2026-11-10；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；Review 模式：Ticket-aware Review
- 审查对象：`c3da583`（3.1）、`4c688d6`（3.2）、`191c335`（3.3）、`8786810`（文档注记）、`5a7e0eb`（CRAP 重构），合并提交 `11505e4`（四个功能提交 `merge-base --is-ancestor` 均为真）。
- **本批结论：通过（0 BLOCK / 0 QUESTION / 4 SUGGEST）。建议 DL 将 3.1–3.3 标 ✅；backend 可进入联调，前提是联调前先完成“真实 DeepSeek 联调”和“uvicorn 真实进程演练”两项（见残余项）。**
- 上下文限制：未做真实 DeepSeek 调用、未起 uvicorn 真实进程、未做并发容量实测；本 worktree 无 `codes/…/.env`（被 `.gitignore` 忽略，是作者本机文件），我没有读取过它；`~/tools/mutator` 未运行，以手工变异代替。

### 3.1 契约一致性
| 检查项 | 结论 | 证据 |
|---|---|---|
| 契约文件未被改动 | ✅ | `git diff 793bbf2 HEAD -- backend-docs/HR_PR-1/03_api` 无任何输出；`openapi.yaml` 最后一次提交仍是 `4ba4d15`（0.1.1 兼容修订）；测试还断言 `info.version == "0.1.1"` |
| 比对的是冻结文件本身 | ✅ | `tests/openapi_support.py` 直接读 `backend-docs/HR_PR-1/03_api/openapi.yaml`（`yaml.safe_load`），不复制、不内联期望值 |
| 路径 / 方法 / operationId | ✅ | `app.openapi()` 与冻结文档逐项相等 |
| 状态码 | ✅（替代方案成立） | 见下 |
| 限长 / `maxItems` / `pattern` | ✅ | 更新 schema 与三类条目 schema 的限制与代码常量相等；`PHONE_PATTERN`/`EMAIL_PATTERN` 与冻结 pattern 字符串相等；并发起真实请求：恰等于上限被接受，超 1 个得 422 `too_long`，且不回显输入值 |
| 响应体 | ✅ | 每个真实响应用 `jsonschema`（Draft 2020-12）对冻结文档里该状态码声明的 schema 校验，`$ref` 取自冻结文档 |

**对“`app.openapi()` 只含成功码和默认 422，改用真实响应比对”的评估：足以防漂移，且比比对 `app.openapi()` 更强，建议接受。** 理由：① 错误码由统一错误处理器产生，FastAPI 生成文档本来就不含它们，用它比对只会得到“恒缺失”的假信号；② 测试以 **25 个场景各发一次真实请求**，并用 `test_every_documented_status_is_produced_by_a_scenario` 断言“场景覆盖的 (路径, 方法, 状态码) 集合 == 冻结文档的集合”，冻结文档新增或删除一个状态码，测试即转红；③ `test_every_documented_error_code_is_produced` 要求 13 个 `ErrorCode` 枚举都被真实产出；④ 同时校验 `Set-Cookie`（属性与 `Max-Age` 取自描述）、未声明 `Set-Cookie` 的响应必须没有 Cookie。我实测变异：把 `draft_not_found` 的 HTTP 状态 404→410，契约用例 `get_404`、`patch_404` 与 e2e 同时失败；把文本列表上限 50→51，限长/条数用例失败。两种漂移都被抓到。局限：代码若新增“冻结文档之外”的状态码，而场景没有触发它，测试不会发现——这是黑盒测试的固有边界，可接受。

### 3.2 端到端与脱敏
| 检查项 | 结论 | 证据 |
|---|---|---|
| 日志/stdout 覆盖面 | ✅ | `caplog.set_level(DEBUG)` 作用于**所有 logger**（不止 `app`），再并上 `capsys` 的 stdout/stderr；断言姓名、姓、手机、邮箱、原文件名、模型响应标记、提示注入文本、令牌及其哈希、API 密钥、非法字段值均不出现，并有“事件确实被记录”的非空断言 |
| 错误响应不回显 | ✅ | 12 类错误请求（`test_error_responses_never_echo…`）；内部异常不含细节；响应中不含令牌或其哈希 |
| 密钥/令牌不落盘 | ✅ | 对 `data/`、`file/` 全部字节扫描：令牌明文、API 密钥均不存在；`.env.example` 仅占位符；仓库密钥模式扫描，并有 `test_secret_scanner_detects_the_patterns_it_claims_to` 防“扫描器失效” |
| 请求体只含 1 次模型请求、API 密钥只在 Header | ✅ | 断言每步一次外发、请求体里无密钥、唯一外发主机 `api.deepseek.com` |
| 提示注入 | ✅（范围内） | 恶意模型输出（声称已确认、注入文本、额外键）不产生 `confirmed`，上传后正式库 0 行、`file/` 为空；模型不能通过额外键触发保存。注意：这证明“模型输出无法越权写库”，不证明模型被注入后不会提取错信息——后者由人工校对环节兜底 |
| 变异：故意在日志里打印合成数据 | ✅ 被杀 | M1 在 `resume_service` 保存成功后用标准库 `logging.getLogger("app").warning("saved %s", identity.phone)`（绕过白名单）→ `test_logs_and_stdout_contain_no_personal_data_filename_token_or_model_body` 失败；M2 同处 `print(identity.email)` 到 stdout → 同一用例失败；M3 让内部异常响应带出异常消息 → `test_internal_errors_hide_details…` 失败 |

### 3.3 质量数字（自行复现，未采信自报）
| 项 | 自报 | 我的复现 | 一致 |
|---|---|---|---|
| `uv run pytest` | 1001 passed，3 warnings | **1001 passed，3 warnings**（13.9s） | ✅ |
| `uv sync --frozen`、`compileall`（先清缓存） | 通过，有 Compiling | Checked 36 packages；45 行 `Compiling` | ✅ |
| ruff check / format | 通过 | All checks passed / 102 files already formatted | ✅ |
| 覆盖率分层（`pytest --cov=app --cov-branch` + coverage JSON 按目录汇总，行+分支） | services 97.8、repositories 98.9、clients 99.1、core 99.4、api 97.5、schemas 100、root 100 | services 702/687 语句、208/203 分支 → **97.8**；repositories 98.9；clients 99.1；core 99.4；api 97.5；schemas 100；root 100 | ✅ 逐层一致 |
| crapper（`~/tools/crapper/crapper src`，工具自己重跑 `coverage run -m pytest`） | 203 个函数，CRAP>10 为 0，最大 9.0，>5 的 21 个 | 解析工具输出：**203 个、>10 的 0 个、最大 9.0、>5 的 21 个**；最大值为 `_remove_orphans`（reconcile）、`field_validation._path`、`parse_normalizer._block`，均 9.0 | ✅ |
| dryer（默认阈值） | No duplicate candidates found | **No duplicate candidates found** | ✅ |

自报中未发现与实测不符之处。我在代码根生成的 `.metrics/`、`target/` 已删除，`git status --short` 无变更。mutator 未运行，报告也已如实声明。

### CRAP 重构（`5a7e0eb`）评估
- **外发请求体字节级不变：已自行复验 ✅。** 我把重构前（`793bbf2`）的 `deepseek_client.py` 作为临时模块，与现版本对同一输入比较 `json.dumps(build_user_blocks(...))`：约 9MB 噪声 PNG、约 8.4MB 噪声 JPEG 大照片、5 页扫描 PDF（28.8MB 噪声页图，超过上传上限，仅作压力）三种输入均 **identical**。临时模块已删除，无遗留。
- **1 MB 预算与 996,000 上限仍成立 ✅。** 三种输入的完整请求 JSON 序列化大小分别为 768,740 / 777,464 / 817,162 字节，均 ≤ `MAX_REQUEST_BYTES`（995,904）≤ 996,000；`MAX_REQUEST_BYTES`、预算逻辑与出口总检未改；原有 `test_large_jpeg_photo_request_body_within_1mb`、`test_five_page_scanned_pdf_request_body_within_1mb` 仍通过。
- 拆分合理：`build_user_blocks` CC 14→2，拆为 `_collect_items`/`_pdf_item`/`_assemble`；`parse_normalizer` 的两个 CC=10 函数同时拆分。重构暴露了两个测试盲点（单个垃圾项应降级为 `uncertain`；文本块/图片块顺序与预算扣除），并补了用例。

### 残余项评估与建议
| 残余项 | 评估 | 建议 |
|---|---|---|
| uvicorn 真实进程演练 | 生命周期（建目录→建库→对账→清理→调度）仅用 `TestClient` 的 `with` 块验证；真实进程的信号停止、`--workers 1`、监听地址未验证 | **联调前必做**：用 `uvicorn --workers 1` 起一次，验证启动日志顺序、`Ctrl-C` 能干净退出（调度线程 join）、重启后对账幂等；L1 工作量 |
| 真实 DeepSeek 联调（C-01/ADR-001 待核验） | 目前全部是 `MockTransport`；“压缩后图片仍可被模型识别”（第七批已指出）、响应格式与超时行为均未验证 | **联调阶段 spike，需 DL 提供凭证**：使用合成简历、本机 `.env`；验证 JSON 响应格式、10MB 照片压缩后的识别率、20 秒 PDF 渲染上限 |
| 约 5 人并发容量 | SQLite 默认 journal + `busy_timeout=5000`，单进程；未压测 | 联调时做一次简单并发上传+确认（5 个并发，合成数据），关注 `database is locked` 与 `save_failed`；POC 规模下风险低，可后置 |
| 本地 `.env` 的使用边界 | 文件被 `.gitignore` 忽略、未跟踪，作者声明未读取其内容；仓库扫描不覆盖它 | 仅用于本机联调；不得提交、不得复制到文档/日志/会话；联调结束后由持有者确认只留在本机；若曾出现在任何终端输出或截图中，应视为泄露并轮换密钥 |

### SUGGESTIONS（不阻断）
- **第十批-SUGGEST-1（契约测试不应静默跳过）**：`pytestmark = skipif(not openapi_available())`——若契约文件路径变动或在仅检出 `codes/` 的 CI 里运行，整组 97 个用例会被**静默跳过**并仍显示通过。建议在 CI/交付检查里把“跳过数 = 0”作为门禁，或在文件缺失时改为失败。
- **第十批-SUGGEST-2（生成文档不带错误响应）**：作者已登记：若希望 `app.openapi()` 本身准确，需在路由上声明 `responses`（代码改动）。POC 可不做；若前端用生成类型，则须做。
- **第十批-SUGGEST-3（3 条测试警告）**：e2e 伪造 Cookie 用例使用 per-request cookies（httpx 弃用）+ 1 条 Starlette 提示；升级依赖前清理，避免日后变成错误。
- **第十批-SUGGEST-4（报告口径）**：`quality_report.md` §2 写明覆盖率来源为 pytest-cov，§4 写明 CRAP 的覆盖率来自 crapper 自己重跑，口径已区分，建议保留。

### 本批复跑
| 命令 | 结果 |
|---|---|
| `uv sync --frozen` | ✅ Checked 36 packages |
| `compileall src`（先清 `__pycache__`） | ✅ 45 行 `Compiling` |
| `uv run pytest` | ✅ **1001 passed**，3 warnings，与基线一致 |
| `ruff check .` / `ruff format --check .` | ✅ All checks passed / 102 files already formatted |
| 变异（共 5 处，均还原） | M1/M2 日志泄露、M3 内部异常泄露、M4 状态码 404→410、M5 列表上限 50→51：全部被杀；`git status --short` 无变更 |

### 最终结论
**通过：建议 DL 将 3.1–3.3 标 ✅，backend 阶段 3 完成。** 契约未被改动，用“25 个真实场景 + 冻结文档三元组集合相等”替代 `app.openapi()` 比对是有效的防漂移手段；脱敏断言覆盖全部 logger、stdout 与错误响应，3 处泄露变异均被抓到；3.3 的数字（测试、覆盖率分层、CRAP、重复代码）全部复现一致；CRAP 重构的外发请求体与重构前字节级一致，预算上限成立。**可进入联调**，条件：联调前完成 uvicorn 真实进程演练，并在 DL 提供凭证后做真实 DeepSeek spike；`.env` 仅限本机使用。


---

## v2 第一批审查（阶段 1：1.2、1.3、1.4、1.5、1.7、1.9、1.10、1.11、1.12）

- Review 模式：Ticket-aware Review；持久化：是（本节）
- 日期：2026-11-11；Reviewer：Yin Yang（dev-lead，审查 agent 代行）；被审查 Workbench：backend
- 范围：`git diff 4eecf2e 0fb8eda -- codes/hr-collection-agent-backend`（48 个文件；src +1246/-341，tests +1057/-2064，含删除 `tests/selftest/`）
- 依据：requirements v2、design v0.4、OpenAPI 0.2.0、`sql_ddl_resume.md` v0.2.0、tasks v2.0、仓库 `AGENTS.md`（v2）。合并 `feature`（7627e71）后审查。
- 结论：**PASS_WITH_SUGGESTIONS**（0 BLOCK / 0 QUESTION / 5 SUGGEST）
- **HIGH_RISK 1.12：建议标 ✅。** 其余阶段 1 任务建议保持 ✅。
- 上下文限制：只审了阶段 1；`ChatService`、建议校验管线（`suggestion_validation`）、路由尚未落地，B-04 的"服务层"一半留待阶段 2 审查。

### 红线核对（逐项，含证据）
| 红线 | 结论 | 证据 |
|---|---|---|
| B-02 只用 deepseek-flash、只经 clients | ✅ | `chat()` 与 `parse()` 共用同一个 `DeepSeekClient`：构造时再校验模型与外发地址（`deepseek_client.py:241-248`），`_chat_payload` 的 model 取常量 `APPROVED_MODEL`（`:186`），`trust_env=False`，`follow_redirects` 默认关，状态码 ≥ 300 一律 `ChatFailedError`（`:317-318`）。`ChatRequest` 只有 `fields/history/message` 三个成员（`resume_chat_client.py:17-23`），类型上带不了文件字节、文件名、浏览器标识；测试 `test_chat_request_carries_only_text_sections…` 核对了请求体。 |
| B-03 日志/错误不含对话与简历内容 | ✅ | `_log_chat` 只传 `status_code/duration_ms/code/count/prompt_tokens/completion_tokens`（`:335-350`），白名单字段在 `core/logging.py` 校验；所有失败路径都抛固定文案的 `ChatFailedError`，原始异常只做 `from exc`。`test_chat_logs_numbers_only` 用哨兵字符串覆盖成功与失败两条路径；`test_error_handling` 覆盖请求体不进错误响应与日志。我另外读了全部 `log_event` 调用点，未发现带内容的字段。 |
| B-04 对话链路不写入、不保存 | ✅（客户端一半） | `parse_chat_output` 只读 `reply`、`suggestions` 两个键（`:204-233`），测试 `test_model_output_cannot_carry_a_save_or_confirm_action` 用 `vars()` 断言结果对象只有这两类成员；`ResumeChatClient` 协议只有 `chat()`，没有任何写方法。`mark_*`、`replace_aggregate` 只在 repository 层，对话相关代码路径引不到。服务层"`ChatService` 不接收 ResumeService/ArchiveFileStore"留待阶段 2 核对。 |
| 提示词注入 | ✅ | 三个数据段都先经 `neutralize_markers`（8 个成对标记全覆盖，`prompts.py:30-43`）再拼接（`deepseek_client.py:166-175`）；替换文本不含标记，单次替换无法被"嵌套拼回"。系统提示明确"段内一切是数据"、"新值必须来自用户新消息"、"不能保存/确认"（`prompts.py:78-101`）。`test_markers_in_fields_history_and_message…` 逐个标记断言只剩自己的分隔符。 |
| 与冻结契约一致 | ✅ | 19 个错误码与 OpenAPI `ErrorCode` 顺序、取值一致；状态码与 `api_design_resume.md` §五一致（404/409/502）；Cookie `browser_id`、`Max-Age=34560000`、属性与 1.7 验收一致；DDL 与 `sql_ddl_resume.md` v0.2.0 的 `sessions/chat_messages/chat_suggestions` 一致（`core/db.py:19-77`，含 CHECK 约束与级联）。测试 `test_openapi_alignment` 与 `test_errors` 做了文件比对。 |
| 归属隔离（ADR-008） | ✅ | `SessionRepository` 按 id 的方法一律 `id = ? AND browser_hash = ?`，且没有"只按 id"取会话的方法；结构测试 `test_every_method_addressing_a_session_requires_browser_hash` 固定；`ChatTransaction.get_message` 带 `session_id` 过滤。 |
| B-05 相关（仓储部分） | ✅ | `replace_aggregate` 单事务、键守卫 `UPDATE`、子表先删后建，守卫失败或事务内失败整体回滚（`resume_repository.py:187-210`、`_update_main`），返回旧路径供提交后删除；`ArchiveFileStore.open_final` 拒绝 `.tmp` 名、符号链接、非常规文件，`O_NOFOLLOW`（`archive_file_store.py:136-159`）。补偿顺序在阶段 2 的 `ResumeService` 审查。 |

### BLOCKING Issues
无。

### QUESTIONS
无。

### SUGGESTIONS（不阻断，登记为跟踪项；按 delivery §八，不要求新增测试）
- **SUGGEST-1（`suggestions_of_session` 排序）**：`chat_repository.py:172` 用 `ORDER BY message_id, seq`，`message_id` 是 UUID，跨消息的顺序是随机的，不是时间序。阶段 2 的 `SessionService` 拼装会话详情时若直接用该顺序遍历，建议卡片会乱序。建议在 2.x 里按消息 `seq` 分组（或把排序改为联表 `chat_messages.seq`）。属 2.x 实现时一并处理的跟踪项。
- **SUGGEST-2（空白消息的责任归属）**：`schemas/chat.py:18` 的 docstring 写 "not blank"，但 `Field(min_length=1)` 只拒绝空串；全空白（如 `"   "`）会通过 DTO。OpenAPI 明确该情形"在服务层按 `required` 拒绝"（`openapi.yaml:1038`），所以实现不矛盾，但请在 2.x `ChatService` 里落实并有一条用例；同时把 docstring 改成与契约一致的说法，避免误导。
- **SUGGEST-3（对话日志与设计略有出入）**：设计 §5.2a 写"日志记保留/丢弃建议数量"，实现只记保留数 `count`（`deepseek_client.py:348`）；`build_chat_payload` 因体积超限抛 `ChatFailedError` 时没有任何日志（`:196-200`、`:296`），排查"为什么没发请求"时无线索。两处都只涉及数字/固定码，不碰内容；有空时补一行 `log_event("chat_call", code=...)` 即可，不需新增测试。
- **SUGGEST-4（阶段 1 遗留的 v1 模块目前不可导入）**：`services/draft_service.py`、`cleanup_service.py`、`resume_service.py`、`api/routes/resume_drafts.py`、`api/routes/resumes.py` 仍 `import` 已删除的 `draft_repository`、`schemas.draft`、`get_draft_token`，`main.py` 已不引用它们，所以应用能起，但 `ruff` 与 `compileall` 都发现不了这类断链。这些文件是阶段 2 的改写/改名对象（2.1、2.3、2.6、2.7 …）。建议在阶段 2 结束的验收清单里加一条"`src/` 下不再有 `draft` 命名的模块，且 `python -c "import pkgutil..."` 逐模块导入通过"，以免漏删。
- **SUGGEST-5（冗余测试，建议合并）**：`test_deepseek_client.py` 新增的 `test_every_failure_class_is_chat_failed_without_retry` 参数化 12 例中，HTTP 401/429/500/400 四例走的是同一个分支（`status_code >= 300`，`:317`），保留 1 例（如 500）即可；"空体/非 JSON/非对象/缺 reply/reply 空白/reply 非字符串/suggestions 非数组"属于不同解析分支，应保留。另外 `test_prompts.py` 的 `test_neutralize_markers_removes_both_markers` 已被新增的 `…removes_every_section_marker` 覆盖，可删除前者。两处合计可减约 4 例，不影响覆盖。

### 其他观察（非问题）
- 阶段 1 范围内模块覆盖率（`pytest --cov`，仅统计 clients、core、repositories、schemas）：`deepseek_client` 99%、`session_repository` 100%、`chat_repository` 97%、`resume_repository` 97%、`archive_file_store` 96%；`core/lifecycle.py` 55%，其中未覆盖部分正是阶段 2（2.6/2.7）要重写的内容。
- 测试/源码新增行数比 1057 : 1246 ≈ 0.85 : 1，低于预算（生产 ≈ 2:1），未见过度；高风险的 1.12 的测试集中且每条都对应一条红线或一个解析分支。
- `init_drafts_db` 升级时在同一事务内丢弃 v1 `drafts` 表（`core/db.py:217`），v1 草稿的临时文件由阶段 2 的启动孤儿清扫（2.6）回收，设计一致；请在 2.6 的用例里保留一条"升级后遗留的 v1 临时文件被清扫"。
- `scripts/self_test_live.py` 仍是 v1 契约，按 tasks 3.4 处理，不在本批。

### 已知且不计入问题：阶段 2/3 范围内的失败
全量 `pytest` 目前在收集阶段因 `tests/services/conftest.py` 导入已删除的 `app.repositories.draft_repository` 而中止（属 2.x 改写的 `tests/services/*`、`tests/contract`、`tests/e2e`、`tests/api/test_resume_drafts_*`、`test_resumes_confirm`）；`tests/core/test_lifecycle.py` 12 例失败（调度线程已删除，属 2.6/2.7 重写）。均在 tasks.md "v1 测试的处置"表的改写/删除清单内，不作为 BLOCK。

### 本批复跑
| 命令 | 结果 |
|---|---|
| `pytest tests/clients tests/core tests/repositories tests/schemas tests/api/test_cookies_deps.py tests/api/test_error_handling.py tests/test_scaffold.py`（排除 `test_lifecycle.py`） | ✅ 全部通过（含 `--noconftest` 下 `test_field_validation.py`） |
| `ruff check .` / `ruff format --check .` | ✅ All checks passed / 109 files already formatted |
| DDL 与 `sql_ddl_resume.md` 核对 | ✅ 由 `test_openapi_alignment`/`test_db` 的结构断言 + 人工对读 `core/db.py:19-77` |
| 未做 | 未运行真实 DeepSeek；未跑全量 `pytest`（收集即中止，原因见上）；未做变异测试（本批未预算，1.12 的红线断言已逐条对读代码） |


---

## v2 第二批审查（backend 阶段 2：2.1–2.13 与第一批 SUGGEST-1..5）

- 范围：`git diff be3f7be 8fb9b5c -- codes/hr-collection-agent-backend backend-docs/HR_PR-1/05_task/tasks.md`（合并 feature 后审查）。
- HIGH_RISK：2.4 首次保存、2.5 对账陈旧旧版规则、2.9 确认更新、2.10 建议校验、2.11 发送对话、2.12 应用/取消。
- 已知不计：`tests/contract`、`tests/e2e`、`scripts/self_test_live.py` 的失败与旧契约引用（属阶段 3：3.1/3.2/3.4）。
- 验证：排除上述两目录后 pytest 全部通过，`ruff check` 通过；总覆盖率 98%（`resume_service` 90%、`chat_service` 96%、`reconcile_service` 99%、`suggestion_validation` 100%、`orphan_sweep` 100%、`archive_query` 100%）。未做变异测试，未调用真实 DeepSeek。覆盖率来源：本次 `pytest --cov` 实测。

**结论：PASS_WITH_SUGGESTIONS（BLOCK 0 / QUESTION 0 / SUGGEST 4）**

### 一、红线证据

| 红线 | 结论 | 证据 |
|---|---|---|
| B-01 | ✅ | diff 内无密钥；`deps._deepseek` 只经 `Settings` 取配置，懒创建 |
| B-02 | ✅ | 对话与解析共用 `DeepSeekClient`，外发只经 clients；`ChatService` 只持有 `ResumeChatClient` 协议 |
| B-03 | ✅ | `log_event` 对异常只记类名与裁剪栈；`chat_message_rejected` 只记长度（`error_handlers._log_rejected_message`、`ChatService.send`）；`test_logs_hold_no_message_reply_or_suggestion_values`、`test_chat_messages` 验证；404 不含内容 |
| B-04 对话不写正式库 | ✅ | `ChatService.__init__` 无 ResumeService/ResumeRepository/ArchiveFileStore，`get_chat_service` 同；`test_chat_service_cannot_reach_saving_or_the_archive`、`test_talking_about_saving_never_writes_the_formal_database` |
| B-04 三项必填须出现在用户消息 | ✅ | `suggestion_validation.occurs_in_message`（name/phone/email 规范化后子串）；核心项为 `null` 一律丢弃（不能清空核心项）；`test_suggestion_validation` 覆盖 |
| B-04 经历块建议丢弃 | ✅ | `L.SUGGESTION_FIELDS` 白名单 + 模块级 `assert ⊆ ResumeFields`；`test_success_stores...` 含 `work_experiences` 被丢弃 |
| B-04 应用才改字段 | ✅ | `apply` 在同一 BEGIN IMMEDIATE 内重校验（`ResumeFieldsUpdate` + `validate_update`）→ `merge_update`（与 PATCH 同一函数）→ 标记 applied；任一失败整卡回滚（`test_one_failing_suggestion_voids_the_whole_card`）；`send` 不持有连接调用模型（`test_no_write_transaction_is_held...`），模型失败/会话期间被保存或删除均不落库 |
| B-05 确认更新 | ✅ | `update_existing`：唯一版本名 stage+promote（`{id}-{token_hex(4)}`）→ `replace_aggregate` 单事务 → 删旧 → 标记 applied；事务前失败记录与旧文件不变；回滚删新文件；提交结果未知以记录指向为准（`_points_at`）；`test_resume_update_faults` 覆盖 stage/promote/事务/崩溃/删旧失败/标记失败 |
| B-05 首次保存 | ✅ | 顺序 查键→stage→create_aggregate→promote→finish 未变；`_committed` 未知按已提交处理（保留 tmp 交对账）；竞态重复走 `_duplicate`；`test_resume_service_faults` |
| B-05 对账陈旧规则 | ✅ | `_remove_orphans`：仅当记录自己的终态文件存在才删其他版本；自己文件缺失 → 保留并计 conflict；tmp 命中记录一律 conflict 不删；无记录时终态文件全部保留；先扫目录后读记录。`test_stale_*`、`test_old_version_is_kept_and_counted_when_the_records_own_file_is_missing`。`_VERSION_SUFFIX_RE` 只匹配末尾 `-8位hex`，不会误吞 UUID 形 id |
| 文件下载 | ✅ | 路径只来自数据库；`open_final` 仅匹配终态名、`lstat` 拒符号链接、`O_NOFOLLOW`、`fstat` 必须普通文件；`Content-Disposition` 为 RFC5987 编码并剔除控制字符，`nosniff`；缺失 → `file_not_available` |
| 会话归属 | ✅ | 所有会话/对话/确认/更新入口均 `browser_hash` + 同一 `SessionNotFoundError`，不存在与非本人不可区分；apply/cancel 对他会话消息、用户消息同为 404（`test_message_ids_of_other_sessions...`） |

### 二、与 OpenAPI 0.2.0 一致性
10 个路径与 operationId 逐一对应（sessions 5、messages/apply/cancel 3、`/resume` POST+PUT、`/resumes` 3）；状态码：创建 201/已存在 200、更新 200、对话 201、删除 204，`confirmation_required`/`validation_failed` 422，`update_not_available`/只读 409，`save_failed` 500、对话失败 502 与文档一致。`/resumes*` 无需浏览器标识，与 OpenAPI 明示（ADR-009，已知风险 X-09）一致。契约自动比对属阶段 3（3.1），本次未跑。

### 三、范围扩散检查：未发现越界
- `SessionTransaction.touch`：design.md §5（对话时序，约 318 行）要求对话刷新 `last_active_at`，GET 不刷新（TQ-v2-05）；只更新 `last_active_at`，限定 reviewing，范围内。
- `archive.is_available` 只读注入 `SessionService`：design §3.3/§4（`ArchiveFileStore` 新增只读 `is_available`、`SessionService` 只持 `ResumeReader`），以 `Callable` 注入使其拿不到写接口，范围内。
- `suffix8 = secrets.token_hex(4)`：与 design「`{resume_id}-{suffix8}`」及对账正则 `[0-9a-f]{8}` 一致，范围内。
- 其余：无 tasks.md 以外的接口、字段、依赖、配置；`app.state.deepseek` 共用客户端是 design 明确的“解析与对话共用一套”。第一批 SUGGEST 落实情况：#1 `suggestions_of_session` 改按 `m.created_at, m.seq, s.seq` ✅；#2 schema docstring 改为与 OpenAPI/服务层一致 ✅；#3 `chat_message_rejected`/`chat_suggestions`/`chat_suggestions_dropped` 日志已补 ✅；#4 v1 的 draft/cleanup/resume 旧模块与旧路由已删 ✅；#5 `test_neutralize_markers_removes_both_markers` 已不存在 ✅。

### 四、测试发散检查
- 规模：本批 tests 新增 2343 / 删除 2322，src 新增 1534 / 删除 505；新增行比约 1.5:1（参考 1:1）。其中约一半是对 v1 测试的改名与缩减，真正净增集中在 chat（约 450 行）、更新/故障（约 280 行）和对账陈旧规则。整体判断：**基本合理，略偏高，未见失控**。
- 逐类判断：chat/suggestion/apply（防 B-04、B-03、并发）、resume_update(+faults)（防 B-05）、reconcile 陈旧规则（防误删唯一文件）均对应红线，保留；session_service 与 sessions API 测试防归属 404、只读、删除不触及正式库，保留；各 API 路由的“非本人 404”是每条路由的接线检查，虽与服务层语义重复，但成本很小，保留。
- 建议删减/合并（SUGGEST，合计约 60–90 行）：
  1. `test_reconcile_service.py::test_unexpected_error_in_the_middle_of_the_run_is_contained`（341）与 `test_one_failing_delete_does_not_block_the_rest`（280）防的是同一风险（单个删除失败不阻断），建议删前者（约 18 行）。
  2. `test_run_duration_comes_from_the_injected_clock`（407，约 20 行）只验证日志耗时字段，不防红线风险，建议删。
  3. `test_roll_forward_keeps_the_extension` 的 `[.pdf,.jpg,.png]` 参数化三例等价，保留 `.pdf` 与一个非 pdf 即可（约 4 行）。
  4. `test_resume_update_faults.py` 的 `["stage","stage_mid_copy","promote"]` 三个故障点断言完全相同，可合并为 `stage_mid_copy` 与 `promote` 两例（运行成本，行数约 0）。
  5. `test_reconcile_service.py::test_service_depends_only_on_resume_repository_and_archive_store` 是结构性断言，与已有“不碰草稿目录”测试部分重叠，可选合并（约 12 行）。
  以上均为 SUGGEST，不阻断；只有 BLOCK 可要求新增测试，本批无 BLOCK，不要求新增。

### 五、SUGGEST（跟踪项）
- SUGGEST-1（B-04，低）：`occurs_in_message` 对 `name` 用规范化后的子串判断，极短姓名（如单字/单字母）几乎必然出现在任意消息中，门槛形同虚设。风险被“用户必须点击应用”兜住，不是越权写入；建议登记为跟踪项，必要时对长度 <2 的姓名建议直接要求用户在消息中单独给出。
- SUGGEST-2（覆盖，低）：`resume_service.update_existing` 的核心项校验失败（114 行）与身份不匹配（120 行）两个分支未被测试覆盖。已保存会话的字段不可再 PATCH（只读），这两处在正常流程不可达，属防御代码；建议要么加注释说明“防御性、不可达”，要么保持现状，不要求补测。
- SUGGEST-3（可维护性，低）：`confirm` 与 `update_existing` 各含一段相同的“取字段→`validate_core_fields`→`build_identity`”代码，可抽成私有方法（`resume_service.py` 约 108–116 行与 82–90 行附近）。
- SUGGEST-4（测试，见第四节）：约 60–90 行测试可删或合并。

### 六、建议
- 各 HIGH_RISK 任务 2.4、2.5、2.9、2.10、2.11、2.12 均有代码与测试证据，建议标 ✅；2.1–2.3、2.6–2.8、2.13（非 HIGH_RISK）tasks.md 已标完成，与代码一致。
- 未验证项：真实 DeepSeek 调用、OpenAPI 契约自动比对（3.1）、端到端（3.2）。
