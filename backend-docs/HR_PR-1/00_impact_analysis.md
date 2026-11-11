# HR_PR-1 影响分析 — backend Workbench（v2 delta）

**分析人**：Yin Yang（backend）
**分析日期**：2026-11-11
**代码仓库**：/Users/yanyin/orca/workspaces/workspce-coding/feature-backend/codes/hr-collection-agent-backend
**依据**：PRD v2 `01-requirements/HR_PR-1/prd.md`；HLD v2 `01-requirements/HR_PR-1/solution-design.md`（§3 第 2/4/6/7/8 步、§4、§5 Backend、§8）；ADR-007/008/009 及 ADR-003/006 的 v2 修订；`.kiro/decisions/design/2026-11-11-HR_PR-1需求变更v2.md`；仓库约定 `AGENTS.md`（状态：已确认，内容仍是 v1）
**深度**：本项目为本机 POC，整体 L2（见 `.kiro/decisions/design/2026-11-10-HR_PR-1降级L2防止过度.md`）；红线点（B-02、B-03、B-04）按 L3 深度写清楚，其余只写到"改什么、往哪个方向改"。

## 变更履历

| 版本 | 日期 | 变更摘要（为何重新分析） | 驱动 CR |
|---|---|---|---|
| v1（初版 + v3 增量） | 2026-11-10 | 新项目，所有影响均为新增；经 Dev Lead 答复和跨 Workbench 裁决（C-01..C-15）回写 | — |
| v2 | 2026-11-11 | **整篇覆盖**为 delta 文档：v1 代码已落地（21/21 任务），本版从当前 v1 代码出发，分析 PRD v2（#3 补充、#4 补 1 条、新增 #5 对话问答、#6 历史会话、#7 查看已归档简历）要改什么。v1 全文可由 git 历史追溯 | HR_PR-1-CRv2 |

> **前提**：本文所有"现有实现"均已逐文件阅读核实（`src/app/` 下全部模块）；`文件:行号` 取自当前 `feature-backend` 工作区。未实现、也无法从代码与文档确定的内容标注 `⚠`。本任务只做分析，没有调用 DeepSeek，也没有读取 `.env`。

---

## 一、PRD v2 场景枚举与代码路径

| 编号 | 来源 | 场景 | 当前代码路径（v1） | v2 状态 |
|---|---|---|---|---|
| V2-3a | 故事#3 | 自然语言说明修改 → 回复 + 修改建议（字段、原值、新值） | 无 | 新增（chat 接口） |
| V2-3b | 故事#3 | 一次多处修改，同条建议逐项列出 | 无 | 新增 |
| V2-3c | 故事#3 | 用户"应用" → 更新字段并视为已确认；"取消" → 不变 | `draft_service.merge_update`（`draft_service.py:108`）已有"写入并置 confirmed" | 复用 + 新增应用/取消接口 |
| V2-3d | 故事#3 | 新值不合规 → 不提供"应用"并说明原因 | `field_validation.validate_update`（`field_validation.py:66`）、`ResumeFieldsUpdate` 的长度约束 | 复用 + 新增建议校验 |
| V2-3e | 故事#3 | 意图不明/无具体新值 → 追问，不推测 | 无 | 提示词 + 无建议即可（⚠ 模型行为，无法确定性保证，见风险） |
| V2-3f | 故事#3 | 新值非用户提供 → 不得提出；姓名/手机/邮箱尤其不得推测 | 无 | 新增确定性规则（ADR-007 跟进项 2） |
| V2-3g | 故事#3 | 逐项修改保留不变 | `PATCH /api/v1/resume-drafts/current`（`resume_drafts.py:46`） | 保留逻辑，路径随会话化变化 |
| V2-4a | 故事#4 | 对话说"确认提交"不直接保存 | `ResumeService.confirm` 仅由 `POST /resumes`（`resumes.py:14`）调用 | chat 接口不得调用保存；输出解析只接受"回复 + 建议"，不接受任何保存动作 |
| V2-5a | 故事#5 | 针对本简历内容提问并作答 | 无 | 新增（同一 chat 接口） |
| V2-5b | 故事#5 | 询问流程 → 说明缺少/待确认字段，保存前须姓名、手机号、邮箱 | 无 | 提示词注入当前字段与状态 |
| V2-5c | 故事#5 | 范围外问题拒答并引导继续校对 | 无 | 仅靠提示词（⚠ 非确定性） |
| V2-5d | 故事#5 | 简历中没有的内容如实说"未识别到" | 无 | 提示词 |
| V2-5e | 故事#5 | 同条消息既问又改 → 回答 + 建议 | 无 | 固定 JSON 同时含 reply 与 suggestions |
| V2-5f | 故事#5 | 回复失败 → 提示稍后重试，简历信息与对话内容不受影响 | `ParseFailed/Unavailable/Timeout` 三个错误（文案是"解析/重新上传"，不适用） | 新增 chat 专用错误；失败不写任何字段 |
| V2-6a | 故事#6 | 打开系统列出本浏览器的会话（名称、状态、最近活动时间，倒序） | 无；v1 仅有"当前草稿" | 新增 |
| V2-6b | 故事#6 | 新建会话并上传 → 出现在列表；未上传的新会话不在列表 | `DraftService.create`（`draft_service.py:133`）上传时才建行 | 天然满足（空会话仅前端状态） |
| V2-6c | 故事#6 | 选"校对中" → 恢复对话与简历信息 | `DraftService.get`（`:167`）按 token 取唯一草稿 | 改为按会话 id + 归属取；新增消息读取 |
| V2-6d | 故事#6 | 选"已保存" → 只读展示对话与已保存简历 | 无 | 新增（简历内容读正式库） |
| V2-6e | 故事#6 | "校对中"会话间互不影响 | v1 每次上传会**删除旧草稿**（`draft_service.py:162-163` `_delete_previous`） | 必须取消该行为 |
| V2-6f | 故事#6 | 删除（校对中 / 已保存两种）；不自动清理 | `CleanupService` + 调度线程（`cleanup_service.py`、`lifecycle.py:112-120`） | 取消调度与过期清理；新增手动删除 |
| V2-7a | 故事#7 | 列表（姓名、手机、邮箱、岗位、保存时间，倒序，无搜索）；空列表 | `ResumeRepository` 只有 `find_by_identity_key/exists/list_refs/create_aggregate`（`resume_repository.py:76-112`），无列表 | 新增 |
| V2-7b | 故事#7 | 详情：完整字段 + 原始文件名 + 保存时间 | 仓储无读取详情方法；子表写入见 `:136-168` | 新增 |
| V2-7c | 故事#7 | 查看/下载原始文件；文件缺失 → 不可用提示，简历仍可看 | `ArchiveFileStore` 无读取接口（仅 stage/promote/discard/remove/scan） | 新增 |
| V2-7d | 故事#7 | 只读，不提供修改与删除 | — | 只加 GET 路由即满足 |

---

## 二、涉及现有模块

| 模块/文件 | 路径 | v1 职责 | v2 影响 |
|---|---|---|---|
| Cookie 构造 | `src/app/api/cookies.py:1-30` | 唯一构造 `draft_token`；Max-Age = `draft_ttl_days*86400` | 修改 |
| 依赖装配 | `src/app/api/deps.py:28-78` | 取 cookie 令牌；装配 DraftService/ResumeService（带 `ttl_days`） | 修改 |
| 草稿路由 | `src/app/api/routes/resume_drafts.py:15-58` | `POST /resume-drafts`、`GET/PATCH /resume-drafts/current` | 修改（会话化） |
| 保存路由 | `src/app/api/routes/resumes.py:14-35` | `POST /resumes`，成功后 `cookies.clear` | 修改 |
| 错误处理 | `src/app/api/error_handlers.py:19-21,69-86` | 以路径常量区分上传/PATCH/确认的校验错误映射 | 修改 |
| 应用工厂 | `src/app/main.py:16-47` | 注册两个路由，`app.state.parser_client` | 修改 |
| DeepSeek 客户端 | `src/app/clients/deepseek_client.py:147-226` | `parse`（图片/PDF）；超时/错误映射；日志只记状态码/耗时/token | 修改（新增 chat） |
| 提示词 | `src/app/clients/prompts.py:25-64` | 解析提示词、`DOC_BEGIN/END`、`neutralize_markers` | 修改（新增对话提示词与分隔标记） |
| 解析客户端协议 | `src/app/clients/resume_parser_client.py:8-16` | `parse` | 不变 |
| 配置 | `src/app/core/config.py:38-41` | `draft_ttl_days`、`cleanup_interval_seconds`、`cookie_secure` | 修改 |
| 数据库 | `src/app/core/db.py:11-32,144-160` | `drafts` 表（`token_hash` 唯一）、`SCHEMA_VERSION=1` 两库共用 | 修改 |
| 错误模型 | `src/app/core/errors.py:7-23` | 13 个错误码 | 修改（新增码） |
| 启动编排 | `src/app/core/lifecycle.py:61-120` | 建目录→初始化库→对账→清理→启动调度线程 | 修改 |
| 日志 | `src/app/core/logging.py:13-25` | 白名单字段 | 修改（视设计加 `session_id`、`message_id`） |
| 草稿仓储 | `src/app/repositories/draft_repository.py:11-123` | 以 `token_hash` 为键的单草稿读写/过期删除 | 修改（会话仓储） |
| 草稿文件 | `src/app/repositories/draft_file_store.py` | 草稿临时文件读写删，拒绝符号链接 | 不变（沿用） |
| 正式库仓储 | `src/app/repositories/resume_repository.py:70-168` | 写入聚合、按身份键查 | 修改（新增只读查询） |
| 归档文件 | `src/app/repositories/archive_file_store.py:59-154` | tmp/final 原语；`_path` 同时放行 tmp 与 final | 修改（新增只读 final 打开） |
| 草稿服务 | `src/app/services/draft_service.py:114-229` | 创建/读取/更新；`is_draft_expired`；`merge_update`；`to_response` 含 `expires_at` | 修改 |
| 保存服务 | `src/app/services/resume_service.py:44-258` | 确认保存；`_finish` 删草稿行与文件；`_load_draft` 含过期判断 | 修改 |
| 清理服务 | `src/app/services/cleanup_service.py:35-97` | 过期草稿删除 + 孤儿文件清扫 | 修改（裁剪） |
| 对账服务 | `src/app/services/reconcile_service.py` | 启动时对账 `file/` | 不变 |
| 字段校验 | `src/app/services/field_validation.py:28-79` | 核心三项校验、`validate_update` | 不变（复用） |
| 身份键 | `src/app/services/identity_key.py:11-35` | 姓名/手机/邮箱规范化 | 不变（复用于"出现在用户消息中"的比对） |
| 草稿 DTO | `src/app/schemas/draft.py:20-36` | `DraftResponse`（含 `expires_at`） | 修改 |
| 保存 DTO | `src/app/schemas/resume.py` | `CreateResumeRequest/Response` | 修改（视契约） |
| 字段模型 | `src/app/schemas/resume_fields.py` | 22 字段、`ResumeFieldsUpdate` | 不变（建议校验直接复用） |

---

## 三、变更影响评估

### 3.1 新增

| 编号 | 新增内容 | 对应场景 |
|---|---|---|
| N-1 | `services/chat_service.py`：对话编排（取会话快照 → 调模型 → 校验建议 → 写消息/建议） | V2-3a/3b/5a-5f |
| N-2 | `services/suggestion_validation.py`：建议校验（字段白名单、字段规则、三项必填须出现在用户消息中、去掉与现值相同的建议） | V2-3d/3f |
| N-3 | `services/session_service.py`：会话列表、读取、删除（两种情形）、归属校验 | V2-6a/6c/6d/6f |
| N-4 | `services/archive_query_service.py`：归档列表、详情、原始文件定位 | V2-7a/7b/7c |
| N-5 | `repositories/chat_repository.py`：对话消息、修改建议的读写 | V2-3/5/6 |
| N-6 | `clients/resume_chat_client.py`：`ResumeChatClient` 协议（`chat`），与 `ResumeParserClient` 并列 | V2-3a/5a |
| N-7 | `api/routes/chat.py`（发送消息、应用/取消建议）、`api/routes/archive.py`（`GET /resumes`、`GET /resumes/{id}`、`GET /resumes/{id}/file`） | V2-3c/7 |
| N-8 | `schemas/chat.py`、`schemas/session.py`、`schemas/archive.py`：对话、会话、归档 DTO（每字段需注释，见 `rules/coding.md` 第四节） | 全部 |
| N-9 | 新增错误码（具体形态待契约审视）：对话失败、会话只读、建议已处理/不可应用、归档简历不存在、原始文件不可用 | V2-5f/6d/7c |

### 3.2 修改

**A. 草稿库：会话模型（PRD#6，ADR-008）**

- `core/db.py:15-32`：`drafts` 表以 `token_hash` 为**唯一**键（`uq_drafts_token_hash`），一个浏览器只能有一份草稿。改为会话表：`token_hash` 改名/重定义为 `browser_hash`（**非唯一**，建索引，列表按 `(browser_hash, last_active_at DESC)` 查），新增 `status`（`reviewing`/`saved`）、`resume_id`（可空，指向 resumes.db，无外键，沿用 C-12）、`display_name`（可空，用于列表名称，见下）。
- ⚠ **库内升级方式**：`CREATE TABLE IF NOT EXISTS drafts` 不会改已存在的 v1 表（`db.py:144-155` 只 `executescript` + 写 `user_version`），在已有 v1 库上直接改 DDL 会静默无效。且 `SCHEMA_VERSION` 是两库共用常量（`db.py:11`、`:150`），升版会连带 `resumes.db`。方向：按库分别维护版本号；v1 旧草稿 DL 已确认不迁移，因此最小做法是**新表用新名（如 `sessions`）**，旧 `drafts` 表启动时忽略（或在 v2 初始化时删除旧表并清空 `data/drafts/` 中无引用的旧文件，由孤儿清扫处理）。具体取舍放设计阶段。
- 新增表：`chat_messages`（`id`、`session_id`、`role`、`content`、`created_at`）、`chat_suggestions`（`id`、`session_id`、`message_id`、`field`、`new_value_json`、`applicable`、`reason`、`status`：`pending/applied/cancelled`）。均在 drafts.db，带 `id/created_at/updated_at`（约束"持久化实体带审计字段"）。
- `repositories/draft_repository.py:76-117`：`get_by_token_hash`、`touch_and_get`、`delete_by_token_hash`、`delete_expired` 全部以令牌或过期为键。改为 `get(session_id, browser_hash)`、`list_by_browser(browser_hash)`、`delete(session_id, browser_hash)`；**所有按会话 id 的读写条件都带 `AND browser_hash = ?`**（见 B）。`delete_expired`、`list_file_paths` 中前者删除，后者保留给孤儿清扫。
- `services/draft_service.py:133-165`（`create`）：创建时写入 `browser_hash` 与 `status=reviewing`；**删除 `old_token` 参数和 `_delete_previous`（`:162-163`、`:222-229`）**——v1 上传会删旧草稿（O-03），v2 多会话并存，保留会破坏"各会话互不影响"。
- `services/draft_service.py:167-210`（`get`/`update`）：入参由 `token` 改为 `(session_id, browser_id)`；`is_draft_expired`（`:40`）、`_is_expired`、`ttl_days`、`to_response` 的 `expires_at`（`:53-67`）全部删除；`update` 保持 `BEGIN IMMEDIATE` 内读-合并-写，**新增：`status=saved` 的会话拒绝修改**（PRD#6"不能再修改"）。
- `schemas/draft.py:20-28`：`DraftResponse.expires_at` 随 TTL 取消而失效，需改契约（跨 Workbench，见待澄清 Q-backend-02）。

**B. 确认后会话保留并关联 resume_id（含 already_saved，ADR-008 跟进 2/3）**

- `services/resume_service.py:198-208`（`_finish`）：v1 在保存成功后**删除草稿行和文件**。v2 改为：将会话 `status` 置 `saved`、写入 `resume_id`，**保留会话与对话记录**，并删除草稿临时文件（正式区已有副本，ADR-008 跟进 2）。顺序沿用 v1 "先改库、后删文件、失败只记日志"的思路，文件删除失败只留孤儿，由启动时清扫兜底。
- `resume_service.py:192-196`（`_duplicate`，already_saved 分支）：同样走 `_finish`，把会话关联到**已有**记录的 `existing.id`，并删除本会话的临时文件（本会话的文件并未归档，正式区保留的是首次保存的那份）。
- ⚠ **共享逻辑完整性**：`resume_service.py:173` 的 `_after_source_missing` 用"草稿行是否已不存在"（`self._drafts.get_by_token_hash(draft.token_hash) is None`）判断"并发请求已保存并 finish"。v2 会话行**不再删除**，该判断恒为"存在"，会落到 `SaveFailedError`。需改为：重新读取会话，`status == saved` 且有 `resume_id` 即视为并发已完成，返回已有记录。同类位置还有 `_load_draft`（`:89-95`，含过期判断，去掉）和 `confirm` 入口（`:72-85`）：**已保存的会话再次调用确认须拒绝（只读），不能走 `already_saved` 幂等**，否则"已保存会话不能再次保存"不成立。
- `api/routes/resumes.py:32`：`cookies.clear(response, settings)` 要去掉——浏览器标识长期保留，保存后不能清 cookie，否则其余会话全部看不到。保存请求需带会话 id（契约待定）。
- 手动删除：
  - `reviewing`：事务内删会话行 + 消息 + 建议，再删临时文件（先库后文件，与 `delete_expired` 注释 `draft_repository.py:105-107` 同一原则：崩溃只会留孤儿文件，不会留指向缺失文件的行）。
  - `saved`：只删会话行 + 消息 + 建议；**不得访问 resumes.db 和 `file/`**。实现上让 `SessionService` 只依赖 drafts.db 仓储与 `DraftFileStore`，与 `CleanupService` 现有"永不碰 `file/`"（`cleanup_service.py:7-8`）同一做法，并加测试固定。
  - ⚠ 删除与进行中的操作并发（删除 vs 确认保存 vs 对话调用）：删除时行已不在，则后续写入需"会话不存在"而非静默成功。对话调用的"写回"步骤必须在 `BEGIN IMMEDIATE` 内先确认会话仍存在再写消息（见 3.2-D）。

**C. Cookie：`draft_token` → 浏览器标识（ADR-008，HLD §8 第 4/7 条）**

- `api/cookies.py:7-30`：改名（建议新名，如 `browser_id`，这样 v1 的 `draft_token` 被自然忽略，符合"旧草稿不迁移"）；`Max-Age` 不再来自 `draft_ttl_days`，改为固定长期值，**不超过 400 天（34,560,000 秒）**（浏览器上限，Chrome 超出会截断）；属性维持 `HttpOnly; SameSite=Lax; Path=/`，`Secure` 仍由 `cookie_secure` 控制（HLD §8 假设"本机 HTTP 不加 Secure 可续期"：代码属性与 v1 一致，无需改动，**浏览器行为仍需实测**）。删除 `clear`（`:28-30`）或保留给测试。
- `api/deps.py:28-35`：`get_draft_token` 改为 `get_browser_id`；建议校验格式（`secrets.token_urlsafe(32)` 的 43 位字符集），格式非法视为无标识，避免客户端自选可猜测的弱标识。
- 续期：每个带有效标识的响应重新 `Set-Cookie`（沿用 v1 `renew` 的"属性完全一致才能覆盖"原则，`cookies.py:23-25`）。首次访问无标识：只有**创建会话（上传）**时签发；列表接口遇到无标识直接返回空列表，不签发。
- 库内只存 SHA-256：沿用 `core/ids.py:29-31` 的 `hash_token` / `generate_token`，不用新增；该函数名带 "draft" 语义，仅改名/不改名由设计定，非必须。
- **所有会话访问校验归属**：`session_service`/`draft_service`/`chat_service` 的每个按会话 id 的查询都必须带 `browser_hash`；"不存在"与"不属于本浏览器"返回**同一个** 404 错误，避免探测他人会话是否存在。需有测试（两个浏览器标识互访）固定。
- v1 旧草稿不迁移（DL 已确认）：v1 `draft_token` 被忽略；旧 `drafts` 表遗留数据见 3.2-A。

**D. 对话接口（PRD#3/#5，ADR-007，红线 B-02/B-03/B-04）**

- `clients`：
  - 新增 `chat` 调用，复用 `DeepSeekClient` 已有的 HTTP 客户端、超时、`UNAVAILABLE_STATUSES` 映射和 `_parse_content`（`deepseek_client.py:127-144,147-226`）。**只用 `deepseek-flash`**：`APPROVED_MODEL` 已在构造时校验（`:153-156`），沿用，不新增模型配置。
  - **只发结构化字段，不发原文件**：消息体 = 系统提示词 + 当前 `ResumeFields` 的 JSON（含各字段 `status`，以便回答"为什么学历待确认"）+ 最近 N 条对话 + 当前用户消息；**不含**文件内容、`original_filename`、令牌。体积检查沿用 `_body_size` 与 `image_prep.MAX_REQUEST_BYTES` 的口径（约束"单次请求体 ≤ 1 MB"同样适用，超限在发送前失败，不外发）。
  - **固定 JSON 输出解析**：`response_format: json_object`（`_build_payload` 已用）；约定结构 `{"reply": str, "suggestions": [{"field": str, "value": ...}]}`；解析失败/结构不符一律映射为"回复失败"，**不写入任何字段**。注意 `_parse_content` 返回 `RawParseResult.data: dict`，可原样复用，结构校验放 services。
  - **提示词分隔标记**：新增对话用的成对标记（简历字段段、用户消息段、历史段），并把 `neutralize_markers`（`prompts.py:29-31`，目前只处理 `DOC_BEGIN/END`）泛化为处理全部标记，对**简历字段值、历史消息、当前消息**统一消毒后再放入标记内，避免简历里的恶意文本或用户输入关闭数据段。系统提示词需覆盖：数据即数据、不得编造新值、新值须来自用户本条消息、范围外拒答并引导继续校对、只输出规定 JSON。
  - 错误映射：`ParseFailedError/UnavailableError/TimeoutError` 的文案是"简历解析失败，请更换文件后重新上传"（`errors.py:88-100`），对话场景不可复用，需新增 chat 专用错误（N-9），映射规则可与 `parse` 对称（超时/传输错误/4xx/5xx）。
  - `core/lifecycle` 无关；`api/deps.py:38-45` 的 `get_parser` 需新增同样懒创建的 chat 客户端依赖（可共用同一个 `DeepSeekClient` 实例，`app.state.parser_client` 的测试注入点需增加对应的 chat fake，见第七节）。
  - 日志：`_log` 只记状态码、耗时、业务码、token 数（`:210-226`），对话直接沿用，**不记**消息、回复、建议值（B-03）。
- `services/chat_service.py`（新增）流程要点：
  1. 校验会话归属与 `status == reviewing`（已保存会话不可对话修改）。
  2. 读取字段与最近消息快照 → **释放连接**（不在事务内等待模型，避免长时间占用 SQLite 写锁；v1 `update` 的事务只包读-改-写，见 `draft_service.py:199-206`）。
  3. 调模型（同步，最长约 60 秒，沿用 `MODEL_TIMEOUT_SECONDS`）。
  4. `BEGIN IMMEDIATE` 内：确认会话仍存在且仍为 `reviewing`，写入用户消息、助手回复、建议；失败则回复失败，已有字段与对话记录不变（V2-5f）。
  - 用户消息是否在模型调用失败时也落库：⚠ 设计阶段定（建议失败时不落库，前端可重发，避免孤立的用户消息）。
- 建议校验（`suggestion_validation.py`，红线 B-04）：
  1. **字段白名单** = `ResumeFields.model_fields` 的 22 个字段；未知字段丢弃（不报错到用户）。
  2. **字段规则复用**：把建议值构造成 `ResumeFieldsUpdate`（`extra="forbid"`、各长度上限已在 schema，`resume_fields.py:130-174`），再过 `validate_update`（核心三项格式，`field_validation.py:66-79`）。不通过则该建议 `applicable=false` 并带原因代码，**不提供"应用"**（PRD#3）。原因只能是 `required/invalid_format/too_long/invalid_type` 等枚举，不回显值（沿用 D-06 / B-03）。
  3. **姓名、手机号、邮箱的新值必须出现在用户本条消息中**：比对用 `identity_key` 的规范化（`name_key`/`phone_key`/`email_key`，`identity_key.py:11-30`），把用户消息按同一规则规范化后做包含判断（手机号需先去空格/连字符、处理 `+86`）。不通过则**丢弃**该建议（ADR-007 跟进项 2），不是 `applicable=false`。注意只比对"本条消息"，不比对历史和简历内容。
  4. 与现值相同的建议丢弃（防止模型把旧值当新值"通过"第 3 点的包含判断，例如用户说"手机号不是 138… 了"）。
  5. 非三项必填字段的"新值须来自用户"目前只能靠提示词（HLD/ADR 只要求三项确定性守住），写入风险登记。
  - ⚠ **列表/块类字段是否开放建议**：`work_experiences` 等三个块字段、`skills` 等四个文本列表字段的更新语义是**整体替换**（`draft_service._confirmed_node` `:90-105`，O-11）。若允许模型建议这些字段，模型必须回传完整新列表，漏回就等于删除条目，且没有确定性手段校验。见待澄清 Q-backend-01。
- 应用/取消（V2-3c）：
  - 应用 = 在 `BEGIN IMMEDIATE` 内重读会话与建议，**重新校验**（建议保存后字段可能已被分区编辑改动、会话可能已保存/删除），通过 `merge_update`（`draft_service.py:108-111`）写入并置 `confirmed`，再把建议置 `applied`。即与分区编辑**走同一条更新路径**。多条建议同卡应用时全部成功或全部不生效。
  - 取消 = 建议置 `cancelled`，字段不变。
  - 重复应用/已处理的建议：返回明确错误（N-9）或幂等返回当前状态，形态待契约。
  - 展示"原值"：建议里存"新值"，原值在读取时取当前字段值（避免两份副本不一致）；这与"模型回传原值"无关，不信任模型给出的原值。

**E. 取消 7 天 TTL 清理调度与相关配置（ADR-008 跟进 1，HLD §8 第 5 条）**

- `core/config.py:39-40`：删除 `draft_ttl_days`、`cleanup_interval_seconds`。`extra="ignore"`（`:27`）使遗留环境变量 `DRAFT_TTL_DAYS`/`CLEANUP_INTERVAL_SECONDS` 无副作用，不会启动失败。新增可选的浏览器标识有效期（固定值也可，不一定需要配置）。
- `core/lifecycle.py:61-67,100-120`：`start()` 去掉 `cleanup()` 与 `start_scheduler()` 两步及调度线程、`stop()` 中的线程 join；`__init__` 的 `interval_seconds` 参数去除。**启动顺序变为：创建目录 → 初始化两库 → 对账 → （可选）一次孤儿清扫 → 开始接收请求**。对账约束不变：仍只在启动时同步运行一次，且代码中只有 `lifecycle.py` 引用（`tests/core/test_lifecycle.py:114` 固定）。
- `services/cleanup_service.py`：`_remove_expired`（`:58-66`）删除；`_remove_orphans`（`:68-89`）保留。
- **孤儿临时文件处理建议**：保留**仅启动时运行一次**的孤儿清扫（把 `CleanupService` 裁剪为 `OrphanSweepService` 或保留类名只留孤儿步骤），不再有定时线程。理由：v2 中会话行不再过期，孤儿只来自"文件已写、插入失败的崩溃"和"删除会话时库已删而文件删除失败"，量极小；启动时单进程单 worker，无在途上传，保留的 1 天宽限（`ORPHAN_GRACE`）仍有保护作用。清扫只依赖 drafts.db 的 `file_path` 引用集合和 `DraftFileStore`，**永不访问 `file/`**。⚠ 会话 `saved` 后临时文件被删，其行的 `file_path` 可置空或保留已失效的名字——需确保 `list_file_paths` 与此一致（不影响正确性，因为引用集合只用于"不删被引用的文件"）。
- 文档同步（非本任务产出）：`AGENTS.md` 的环境变量表、"启动顺序"、"红线"中"7 天无活动后清理"、"草稿由 `draft_token` 定位"几处在 v2 后失效，需在 architecture-advisor 阶段的仓库约定复核中更新。

**F. 归档只读：列表、详情、原始文件下载（PRD#7，ADR-009）**

- `repositories/resume_repository.py`：新增 `list_summaries()`（`id, name, phone, email, job_title, created_at`，`ORDER BY created_at DESC`；POC 数据量小，不分页；`resumes` 表无 `created_at` 索引，数据量大时再加）、`get_detail(resume_id)`（主表 + 三个子表按 `seq` 排序 + 四个 JSON 列反序列化，结构对应 `resume_repository._insert_main/_insert_sub_rows`，`:114-168`）。所有 SQL 参数绑定。
- ⚠ **正式库不保存字段状态**：`resumes` 表只存值，没有 recognized/uncertain/confirmed（`db.py:34-66`）。已保存简历详情与"已保存会话视图"返回的字段形态不能沿用带 `status` 的 `ResumeFields`；需契约明确（见 Q-backend-03）。
- `repositories/archive_file_store.py`：`_path`（`:66-72`）同时放行 tmp 与 final 名称，且只检查 `is_symlink` + 父目录；下载不能用它。新增只读 `open_final(file_path)`：只匹配 `_FINAL_RE`、拒绝符号链接、`O_NOFOLLOW` 打开（与 `DraftFileStore.read` `:64-74` 同做法）、确认解析后位于 `FILE_DIR` 内。**文件名只来自 `resumes.file_path`（库内值），不接受 URL 中用户传入的路径或文件名**（ADR-009 跟进 1）。
- 下载响应：`Content-Type` 取库内 `content_type`（上传时已由魔数校验，只有 pdf/jpeg/png 三种）；`Content-Disposition` 的文件名取 `original_filename`，需去除 CR/LF/引号并按 RFC 5987 编码（`filename*=UTF-8''…`），不回显内部路径（ADR-009 跟进 2）；建议加 `X-Content-Type-Options: nosniff`。内联展示还是强制下载由契约定（不阻断）。
- 文件缺失（PRD#7"原始文件暂不可用，简历信息仍可看"）：详情接口不因缺文件失败（可附 `file_available` 之类标志或由下载接口返回专用错误，形态待契约）。注意已知窗口：提交后重命名失败时 `file/` 只有 tmp（`AGENTS.md` "已知限制"），此时下载应视为"不可用"，不要读 tmp。
- 访问边界：ADR-009 把"仅监听 127.0.0.1"作为唯一访问边界，但**代码并不强制**——监听地址只写在运行命令里（`AGENTS.md` 构建与运行），`main.py` 无任何约束。风险登记，建议 ADR-009 跟进项 5 落实到 `AGENTS.md` 红线（不属本文档产出）。

**G. 日志白名单（B-03）**

- 对话链路不新增内容字段。现有可用：`draft_id`（会话化后含义为会话 id，是否改名由设计定）、`resume_id`、`status_code`、`duration_ms`、`code`、`exception_class`、`count`、`prompt_tokens`、`completion_tokens`（`logging.py:13-25`）。
- 若需要日志中区分会话与消息，**只能新增 ID/数字类**字段：`session_id`、`message_id`（均为服务端生成的 UUID/整数）。以下一律不得记录：用户消息、模型回复、建议字段名对应的值、简历字段、浏览器标识（原值或哈希）、文件名。`log_event` 在字段不在白名单时直接抛 `ValueError`（`:81`），加字段需同步 `tests/core/test_logging.py`。

### 3.3 不变

- 上传校验 `upload_validation.py`、解析归一化 `parse_normalizer.py`、PDF/图像预处理 `pdf_renderer.py`/`image_prep.py`、`ResumeParserClient` 协议与 `DeepSeekClient.parse`（解析链路）。
- 字段模型 `resume_fields.py`、字段校验 `field_validation.py`、身份键 `identity_key.py`（均被复用，不改）。
- 确认保存的核心顺序与补偿：复制到 tmp → 单事务写库 → 原子重命名（`resume_service.py:102-129`）及 `ReconcileService`、`ArchiveFileStore.stage/promote/discard_tmp`、启动对账仅运行一次的约束。
- `resumes.db` 表结构：v2 不新增列、不新增表（归档只读；会话关联信息放在 drafts.db），因此**无需迁移正式库**。
- `DraftFileStore`（临时文件读写删、符号链接拒绝）、请求 ID 中间件、错误体结构 `{code, message, request_id, details}`。
- 模型与外发地址锁定（`config.py:10-20,48-55`）：对话沿用同一 `DeepSeekClient`，B-02 无需新增白名单。

---

## 四、架构约束命中

| 约束 | 命中点 | 处理建议 |
|---|---|---|
| B-01 密钥不入代码/日志 | 对话沿用 `DEEPSEEK_API_KEY`，无新增凭证；无密钥时首次调用返回不可用（`deepseek_client.py:173-176`） | chat 方法同样先检查密钥，缺失走不可用错误，不抛 500 |
| B-02 外发只经 clients、只发获批模型 | 新增 `chat` 必须放在 `clients/`，经 `DeepSeekClient` 的 `trust_env=False` 客户端；services 不得直接构造 HTTP | 把 chat 放在同一类内；`services/chat_service.py` 只依赖 `ResumeChatClient` 协议 |
| B-03 日志与错误不含用户内容 | 对话内容、回复、建议值、浏览器标识、文件名；新增错误码的 `message` 必须是固定文案 | 白名单只加 ID/数字（见 G）；`ErrorDetail` 沿用"字段路径 + 原因枚举" |
| B-04 确认后才入库；不猜测补全 | 对话修改写入的是**草稿**而非正式库；姓名/手机/邮箱建议值须出现在用户本条消息中；"确认提交"类自然语言不触发保存 | 保存仍只有 `POST /resumes`（显式 `confirmed: true`）一条入口；chat 响应解析**白名单化**，不接受任何保存/确认动作字段 |
| B-05 记录与原始文件一致 | 确认后会话保留不影响归档；下载只读；已保存会话删除不得触及 `file/` 与 resumes.db | `SessionService` 不注入 `ResumeRepository` 写接口/`ArchiveFileStore`；归档查询服务只注入读方法 |
| B-06 简历属敏感个人信息 | 草稿库长期保存对话与简历内容（ADR-008 已接受，依赖磁盘加密）；测试用合成数据 | 保持测试用合成数据；`data/` 已在 `.gitignore`（`AGENTS.md`） |
| 数据层：持久化实体带 `id/created_at/updated_at` | 新增 `chat_messages`/`chat_suggestions` | 建表时带三列 |
| 单进程单 worker（`--workers 1`） | 归属校验、应用建议的并发由 `BEGIN IMMEDIATE` 串行；去掉调度线程后运行形态更简单 | 不引入新的后台线程 |
| 请求体 ≤ 1 MB（业务约束，DL 2026-11-10） | 对话体仅含文本，一般远小于上限，但字段值和历史可累积 | 发送前沿用 `_body_size` 校验，超限则缩减历史条数，仍超限则回复失败，不外发 |
| 契约变更须经 cross-workbench-reviewer | 路由、cookie、DTO、错误码全部变化 | 本文只列影响，不改 openapi |

---

## 五、技术风险

| 风险 | 严重性 | 说明 |
|---|:-----:|------|
| 模型输出结构不稳定 / 范围外问题拒答不保证 | 中 | JSON 结构与拒答依赖提示词；结构异常按"回复失败"兜底，不写字段；"拒答"无确定性手段（HLD §8 假设 6，需真实凭证 spike 实测，本次分析未调用模型） |
| 提示词注入（简历文本、用户消息） | 中 | 靠分隔标记 + 消毒 + 输出白名单解析；即使被绕过，写入仍需用户"应用"，且三项必填须出现在用户消息中。B-04 由确定性规则守，不依赖模型 |
| 数据库升级 | 中 | `CREATE TABLE IF NOT EXISTS` 对已有 v1 `drafts` 表无效；`SCHEMA_VERSION` 两库共用。选错方案会出现"表未变但代码按新表查询"的启动后失败，需在设计阶段明确（见 3.2-A） |
| `_after_source_missing` 等隐含"草稿行会被删除"的假设 | 中 | v1 多处用"行是否存在"表示"已完成"（见 3.2-B）；改成会话保留后必须逐处改为读 `status`/`resume_id`，漏改会把并发保存误判为失败或把重复保存当成功 |
| 同浏览器多个"校对中"会话对应同一个人 | 中 | 身份键唯一（ADR-004）：第一份保存后，第二份保存会变成 `already_saved`，会话被关联到第一份记录，**本会话内的修改被丢弃**（见 Q-backend-04） |
| 对话调用持有线程 60 秒 | 低 | 路由为同步 `def`（线程池），约 5 人并发可接受；不要在 SQLite 事务内等待模型 |
| 草稿库长期积累敏感内容 | 低（已接受） | ADR-008 已接受；依赖受控主机磁盘加密（HLD §8 假设 3 未核实） |
| 归档列表全局可见 + 监听地址不由代码强制 | 低（已接受） | ADR-009 已接受；改为对外监听前必须补访问控制 |
| 旧的 v1 路由与 `draft_token` 并存导致歧义 | 低 | 建议直接替换，不留兼容路由（v1 未交付）；契约层确认（Q-backend-02） |

---

## 六、对 requirements 的建议补充

- 会话**活动时间**的定义：上传、分区编辑、发送消息、应用/取消建议、保存是否算"活动"；**仅查看**是否算（v1 的 `GET` 会刷新 `last_active_at`，`draft_repository.py:80-87`）。若查看也算，打开一个旧会话会让它跳到列表顶部。建议：查看不算（见 Q-backend-05）。
- 对话限额：单条消息最大长度、传给模型的历史条数、每会话保存的消息上限（需求未写，不定会导致请求体无上限增长）。
- 已保存会话再次对话/编辑/保存的行为：PRD 写"不能再修改或再次保存"，建议补充对应错误提示口径。
- 建议卡片的"应用"粒度：整条建议一起应用，还是逐项应用（PRD 写"同一条修改建议中逐项列出"，未写能否部分应用）。
- 范围外问题的判定无法 100% 确定，建议在 PRD 验收中注明"以提示词约束 + 抽样验证为准"。
- 删除"校对中"会话时，同时进行中的保存请求如何处理（建议以先到先得为准，另一方返回"会话不存在"）。

---

## 七、受影响的现有测试（仅列文件与原因，不写测试）

| 测试文件 | 原因 |
|---|---|
| `tests/core/test_config.py` | 默认值断言 `draft_ttl_days == 7`、`cleanup_interval_seconds == 3600`（`:24-25,47-48`）随配置删除 |
| `tests/core/test_db.py` | 表结构、`uq_drafts_token_hash` 唯一、`token_hash` 唯一约束测试（`:74-77,140-153`）随会话表变化 |
| `tests/core/test_lifecycle.py` | 启动顺序 `dirs→init→reconcile→cleanup→scheduler`、调度线程、清理失败不杀线程等（`:65-139,202-281,296`）随取消调度重写 |
| `tests/core/test_logging.py` | 若白名单新增 `session_id`/`message_id` |
| `tests/api/conftest.py`、`test_cookies_deps.py` | cookie 名、属性、`Max-Age`、`clear`、`get_draft_token` |
| `tests/api/test_resume_drafts_upload.py`、`_get.py`、`_patch.py` | 路由路径（`/current`）、旧令牌删除旧草稿、`expires_at`、cookie 续期 |
| `tests/api/test_resumes_confirm.py` | 保存后不再清 cookie；会话保留；已保存会话再次保存的行为 |
| `tests/api/test_error_handling.py` | 路径常量（`error_handlers.py:19-21`）与新增错误码 |
| `tests/services/conftest.py`、`test_draft_service_create/get/update.py` | `ttl_days` 参数、`old_token`、过期语义 |
| `tests/services/test_resume_service.py`、`test_resume_service_faults.py`、`fault_injection.py` | `_finish` 行为（保留会话）、`_after_source_missing` 判断、`ttl_days`、`FaultyDraftRepository` 继承的方法签名 |
| `tests/services/test_cleanup_service.py` | 过期删除步骤取消，仅保留孤儿清扫 |
| `tests/repositories/test_draft_repository.py` | 仓储方法与键的变化（`delete_by_token_hash`、`touch_and_get`、`delete_expired`） |
| `tests/schemas/test_dtos.py`、`tests/schemas/test_openapi_alignment.py`、`tests/contract/test_openapi_conformance.py` | `DraftResponse.expires_at`、错误码枚举与 OpenAPI 对齐；OpenAPI 将随契约更新 |
| `tests/e2e/test_end_to_end.py` | 端到端流程（上传→PATCH→确认）与 cookie 行为 |
| `tests/selftest/conftest.py`、`test_interfaces.py`、`test_startup_cleanup_llm.py` | 开发自测（接口、启动清理、LLM），含 cookie 与清理断言 |
| `tests/fakes.py` | 需要提供 chat 的 fake 客户端（现仅有 `FakeParserClient`） |
| `scripts/self_test_live.py` | 含对 `draft_token` Cookie 头、`Max-Age=604800`、`cleanup_done` 启动日志顺序的断言（`:158,206,319`） |
| 不受影响 | `tests/clients/*`（解析链路）、`tests/repositories/test_archive_file_store.py`/`test_draft_file_store.py`/`test_resume_repository.py`（仅新增，不破坏）、`test_identity_key.py`、`test_field_validation.py`、`test_upload_validation.py`、`test_parse_normalizer.py`、`test_reconcile_service.py` |

---

## 八、HLD §8 假设核对

| 假设（HLD §8） | 结论 | 依据 |
|---|---|---|
| `deepseek-flash` 支持 PDF/JPG/PNG | 与 HLD 表述不同但 v1 已裁决，不构成 v2 冲突 | `AGENTS.md`：模型 API 只接受图片，PDF 由 `pdf_renderer` 本地转换后提交；真实环境仍待凭证核实（`AGENTS.md` 待确认清单第 4 项） |
| 同步解析 ≤ 10 MB、约 5 人并发 | 未验证，沿用 | 路由为同步 `def`；对话沿用同一超时；需集成环境实测 |
| 受控主机磁盘加密 | 未验证，与 v1 相同 | 部署负责人核实；v2 草稿库长期保存对话，重要性上升 |
| 长期 HttpOnly 浏览器标识 Cookie 可在本机 HTTP 续期 | 与代码现状一致（属性 `HttpOnly; SameSite=Lax; Path=/` + `Max-Age`，`Secure` 默认关）；`Max-Age` 须 ≤ 400 天；浏览器行为需实测 | `cookies.py:10-14` |
| ~~7 天清理任务可按时执行~~（已作废）→ 手动删除与孤儿文件 | 见 3.2-B / 3.2-E：删除两种情形与孤儿处理已给出方向 | — |
| `deepseek-flash` 能按固定 JSON 返回并遵守问答范围；时延可接受 | **未验证**：本次未调用模型；spike 需真实凭证，输出不稳定时以"回复失败"兜底 | `scripts/spike_deepseek.py` 仅覆盖解析 |
| `draft_token` 与单草稿接口改为会话模型，旧草稿不迁移 | 与代码现状冲突的是**实现**而非假设：`drafts.token_hash` 唯一（`db.py:30`）、上传删旧草稿（`draft_service.py:162`）、保存后删草稿并清 cookie（`resume_service.py:198-208`、`resumes.py:32`）均与会话化矛盾，已在 3.2-A/B/C 列出改法 | — |
| ⚠ HLD 假设与代码现状冲突（需关注）| 1）ADR-009/HLD 以"服务只监听本机地址"为访问边界，但代码**不强制**（仅运行命令约定）；2）正式库**没有字段状态**，而 HLD §4 的"完整简历字段"若按带 `status` 的形态返回，已保存简历无从提供 | `AGENTS.md` 运行命令；`db.py:34-66`。已写入 Q-backend-03 与风险表 |

---

## 九、模块影响统计（按文件计，设计阶段可合并）

- **新增 11**：`services/chat_service.py`、`services/suggestion_validation.py`、`services/session_service.py`、`services/archive_query_service.py`、`repositories/chat_repository.py`、`clients/resume_chat_client.py`、`api/routes/chat.py`、`api/routes/archive.py`、`schemas/chat.py`、`schemas/session.py`、`schemas/archive.py`
- **修改 22**：`api/cookies.py`、`api/deps.py`、`api/error_handlers.py`、`api/routes/resume_drafts.py`、`api/routes/resumes.py`、`main.py`、`clients/deepseek_client.py`、`clients/prompts.py`、`core/config.py`、`core/db.py`、`core/errors.py`、`core/lifecycle.py`、`core/logging.py`、`repositories/archive_file_store.py`、`repositories/draft_repository.py`、`repositories/resume_repository.py`、`schemas/draft.py`、`schemas/limits.py`、`schemas/resume.py`、`services/cleanup_service.py`、`services/draft_service.py`、`services/resume_service.py`
- **不变 15**：`api/middleware.py`、`clients/image_prep.py`、`clients/pdf_renderer.py`、`clients/resume_parser_client.py`、`core/clock.py`、`core/ids.py`、`repositories/draft_file_store.py`、`schemas/errors.py`、`schemas/parse.py`、`schemas/resume_fields.py`、`services/field_validation.py`、`services/identity_key.py`、`services/parse_normalizer.py`、`services/reconcile_service.py`、`services/upload_validation.py`

---

## 十、待澄清问题（回流第二轮 Q&A）

| 编号 | 待澄清问题（指向具体代码/场景） | 建议回答人 | 不同答案的影响 |
|---|---|---|---|
| Q-backend-01 | ⚠ 修改建议是否允许覆盖**列表/块类字段**（`skills`、`languages`、`certificates_honors`、`strengths`、`work_experiences`、`project_experiences`、`educations`）？这些字段更新是整体替换（`draft_service._confirmed_node`），模型漏回即删条目，无法确定性校验 | DL | 只开放标量字段（含 `self_evaluation`）→ 实现最简、误改风险低，但"加一个技能"之类说法只能拒绝；全开放 → 需要对"整体替换"做额外保护（如要求建议展示完整新列表并逐项确认）或限定为"追加" |
| Q-backend-02 | ⚠ v1 的 `POST /resume-drafts`、`GET/PATCH /resume-drafts/current`、`POST /resumes` 与 `draft_token` Cookie 在 v2 是**直接替换为按会话 id 的路径**，还是保留兼容？同时 `DraftResponse.expires_at` 取消、新增错误码（对话失败、会话只读、建议已处理、归档不存在、文件不可用）如何落契约 | DL（跨 Workbench 契约审视） | 直接替换（建议，v1 未交付）→ 代码最简；保留兼容 → 需双份路由与测试，且 `token_hash` 唯一语义无法保留 |
| Q-backend-03 | ⚠ 已保存简历的详情与"已保存会话视图"返回什么形态？正式库不保存字段状态（`db.py:34-66`），不能返回带 `status` 的 `ResumeFields`；且归档页与会话页是否共用同一详情结构 | DL（跨 Workbench） | 共用"无状态的纯值结构" → 后端一套 DTO，前端一套组件；分开 → 会话页对已保存字段统一标 `confirmed`，需前后端约定 |
| Q-backend-04 | ⚠ 两个"校对中"会话属于同一人（姓名+手机+邮箱规范化后相同）时，先保存的一份入库，后保存的一份会得到 `already_saved=true` 并关联到前者记录，**后者会话内的修改被丢弃**（`resume_service.py:83-84,192-196`，ADR-004）。该行为是否可接受，前端是否需要明确提示 | BA / DL | 接受 → 仅需前端展示"已存在，未覆盖"；不接受 → 需要"覆盖更新"能力，但这与"正式记录创建后不修改"（`resume_repository.py:35`、PRD#7"不提供修改"）冲突，属新需求 |
| Q-backend-05 | ⚠ "最近活动时间"哪些操作会刷新：仅查看会话是否算？（v1 的 `GET` 会刷新，`draft_repository.py:80-87`） | BA | 查看不算（建议）→ 列表顺序稳定，GET 无写入；查看也算 → 打开旧会话会使其跳到顶部，GET 需写库 |
| Q-backend-06 | ⚠ 对话限额的具体数值：单条消息最大长度、传给模型的历史条数、每会话保存的消息上限 | DL | 不定则请求体与库体积无上限；数值只影响校验常量（`schemas/limits.py`）与提示词历史截取，不影响架构 |

**阻断性问题**：无。以上均不阻断下一步（requirements-analyst 第二轮 Q&A 之后继续）；Q-backend-02、03 需在跨 Workbench 契约审视（cross-workbench-reviewer）中一并裁决。
