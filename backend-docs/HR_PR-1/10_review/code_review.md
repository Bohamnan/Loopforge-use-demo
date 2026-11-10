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

