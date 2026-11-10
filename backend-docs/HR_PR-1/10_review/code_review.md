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
