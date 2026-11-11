# 接口消费设计 — 简历信息收集（Frontend）

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v0.1 | 2026-11-10 | 初始版本（architecture-advisor Step 2.2），基于 OpenAPI 0.1.0（已冻结） | Yin Yang（frontend） |
| v0.2 | 2026-11-10 | 契约版本 0.1.0 → 0.1.1：G-01 邮箱 `pattern` + `maxLength 254` 已落地，七、G-01 缺口关闭；G-02 手机号 pattern 作用于提交值（先去空格与连字符，原值 `maxLength 32`）；CR-01 / CR-01a 长度与条数上限见 design.md §6.1；十、Q-01..Q-06 已裁决（F-01..F-05、G-01、G-02） | OpenAPI 0.1.1 |
| v0.3 | 2026-11-11 | **HR_PR-1-CRv2 / CRv2.1：同步 OpenAPI 0.2.0（冻结）**。接口由 4 个（草稿单例）改为 13 个操作（会话、对话、归档）；删除 `/resume-drafts*`、`/current`、`draft_token`、`expires_at`、`draft_id`、`draft_not_found`；新增 `session_*`、对话、建议应用/取消、确认更新、归档列表/详情/文件；错误码 13 → 19；对话与上传超时 75 秒（X-01）；api 层新增 204 空正文与二进制下载处理；设计决策表补 DD-12..DD-22，DD-02/04/11 被替代。v0.2 全文见 git 历史 | OpenAPI 0.2.0 |

> **输入**：`backend-docs/HR_PR-1/03_api/openapi.yaml`（**唯一契约来源**，info.version **0.2.0**，DL 评审后冻结）、`api_design_resume.md`（§八 为 frontend 数据需求覆盖对照，字段级以 openapi.yaml 为准）、`01_requirements/requirements.md`（REQ-FE-01..09，v2.0.1）、`cross-workbench-review.md`（X-01..X-10、Y-01、Y-02、O2-01..05）、`00_impact_analysis.md`（v2、v2.1）、`rules/frontend/api.md`、`codes/hr-collection-agent-frontend/AGENTS.md`（仍是 v1 口径，Step 5 更新）。
> **引用不复制**：字段、类型、完整错误码清单不在此重抄，只写前端如何消费、状态如何映射、哪里需要前端自有决策。
> **状态**：⏸ 待评审（Schema + 接口设计合并门控）；契约版本 0.2.0。

## Step 2.1 适用性判定

**跳过。** frontend 无数据存储职责（`references/frontend.md` §0）：数据以 backend 为准，浏览器不持久化简历、校对或对话内容（F-02）。不产出 `02_schema/`。简历与对话在前端只存在于 `useState` / `useReducer` 运行时内存。

---

## 一、消费的接口清单（13 个操作）

路径均以 `/api/v1` 为前缀。`{sid}` = `session_id`，`{mid}` = `message_id`，`{rid}` = `resume_id`；拼入路径前一律 `encodeURIComponent`。

| # | 方法 + 路径（operationId） | 前端用途 | 关联 REQ-FE | 成功响应 | 幂等 / 重试 |
|---|---|---|---|---|---|
| 1 | `POST /sessions`（createSession） | 上传并同步解析，新建会话 | 01、02 | 201 `SessionDetail` | 非幂等；不自动重试；请求中禁止再次提交；失败不改变已有会话 |
| 2 | `GET /sessions`（listSessions） | 页面打开、各动作成功后读列表 | 05 | 200 `SessionListResponse`（无标识时为空列表） | 安全方法；失败可手动重试 |
| 3 | `GET /sessions/{sid}`（getSession） | 选择会话；失败/未知结果后核对 | 02、05、07、09 | 200 `SessionDetail` | 安全方法；仅读，不刷新最近活动 |
| 4 | `DELETE /sessions/{sid}`（deleteSession） | 删除会话 | 05 | **204 无正文** | 重复删除得 404，视为"已不存在"成功（X-03） |
| 5 | `PATCH /sessions/{sid}/fields`（updateSessionFields） | 提交分区校对 | 03 | 200 `SessionFieldsResponse` | 幂等；同一时刻一个在途请求（DD-07） |
| 6 | `POST /sessions/{sid}/messages`（sendMessage） | 发送对话消息 | 07 | 201 `SendMessageResponse` | 非幂等，无幂等键；失败/未知时**先重读会话再决定是否重发**（X-01） |
| 7 | `POST /sessions/{sid}/messages/{mid}/apply`（applySuggestions） | 应用一张卡片的全部建议 | 07 | 200 `SuggestionActionResponse` | 已处理再请求 → 409，不重复写入；失败可重试 |
| 8 | `POST /sessions/{sid}/messages/{mid}/cancel`（cancelSuggestions） | 取消一张卡片的全部建议 | 07 | 200 `SuggestionActionResponse` | 同上 |
| 9 | `POST /sessions/{sid}/resume`（createResume） | 最终确认并保存 | 04 | 201 新增 / 200 已保存过，均 `CreateResumeResponse` | **不再对已保存会话幂等**：再次请求得 409 `session_read_only`（见 3.7 与 Q-IF-02） |
| 10 | `PUT /sessions/{sid}/resume`（updateResume） | 已保存过后确认更新 | 09 | 200 `UpdateResumeResponse` | 幂等：`applied` 后再请求返回同一结果，可重试 |
| 11 | `GET /resumes`（listResumes） | 归档页列表 | 08 | 200 `ResumeListResponse` | 安全方法 |
| 12 | `GET /resumes/{rid}`（getResume） | 归档详情 | 08 | 200 `ArchivedResume` | 安全方法 |
| 13 | `GET /resumes/{rid}/file`（downloadResumeFile） | 打开/下载原始文件 | 08 | 200 二进制（pdf/jpeg/png） | 安全方法 |

OpenAPI 无其他接口。已确认**不存在**：丢弃草稿接口、保存状态查询接口、归档的修改与删除接口、更新意图识别接口（Y-01）；前端不得调用或假设它们。v1 的 `/resume-drafts*` 与 `POST /resumes` 已被替换，不保留兼容（TQ-v2-02）。

---

## 二、公共消费约定

### 2.1 请求封装（api 层唯一出口）

- 前缀 `/api/v1`；所有调用经 api 封装层（基于 fetch），页面、组件、hook 不直接 `fetch`（红线，ESLint 强制）。
- `credentials: 'same-origin'`（C-06）。浏览器标识 Cookie `browser_id`（`HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`，随成功响应续期）由浏览器自动携带；**前端不读取、不存储、不写入**（F-02）。
- JSON 请求体设 `Content-Type: application/json`；上传用 `FormData`，字段名 `file`，不手设 multipart 的 Content-Type。
- 响应字段 snake_case 原样保留，不转 camelCase。

### 2.2 响应处理方式（`request()` 的扩展，对应 v2 影响分析 2.4/2.5）

v1 的 `request()`（`ApiClient.ts`）方法仅 `GET|POST|PATCH`，且一律按 JSON 解析。v2 需要三处扩展：

| 需求 | 做法 |
|---|---|
| 方法 | 方法集合增加 `PUT`、`DELETE`（#4、#10） |
| **204 空正文**（#4） | 增加响应模式 `none`：期望状态 204 且无需解析正文，成功返回 `undefined`；错误响应（4xx/5xx）仍按 JSON 错误体解析。v1 把"2xx 但无法解析 JSON"一律判 `unknown_error`，该规则对 `json` 模式保持不变 |
| **二进制下载**（#13） | 增加响应模式 `blob`：2xx 返回 `Blob`；**非 2xx 仍按 JSON 错误体解析**（`file_not_available` / `resume_not_found` 是 JSON）；不做 JSON 形状校验，改为校验 `Content-Type` 属于 `application/pdf` / `image/jpeg` / `image/png` 之一，否则 `unknown_error` |
| 形状校验 | 每个 `json` 响应由调用方传入 `validate`（沿用 v1 机制）；校验失败 = `unknown_error`，**不得**走成功分支（F-03 的基础） |

Blob 的使用：页面内用 `URL.createObjectURL` 打开或触发下载，用后立即 `revokeObjectURL`；下载文件名用通用名（`原始简历.pdf` / `.jpg` / `.png`，按 `content_type` 取扩展名），**不使用 `Content-Disposition` 中的原文件名，也不把姓名写入文件名或页面标题**（REQ-FE-06.3，B-03）。blob 只在内存，不属于浏览器持久存储。

### 2.3 超时

| 请求 | 超时 | 依据 |
|---|---|---|
| #1 `POST /sessions`（上传解析） | **75 秒** | C-08；后端模型超时 60 秒，留 15 秒给上传与网络 |
| #6 `POST .../messages`（对话） | **75 秒** | X-01、REQ-FE-07.3；后端同样同步调用一次模型，读超时 60 秒 |
| 其余 11 个操作（含 #10 更新、#9 保存、#13 下载） | **30 秒** | 前端自有决策（OpenAPI 无给定数值），沿用 v1 DD-05；见 Q-IF-03 |

用 `AbortController` 实现。超时抛本地错误 `client_timeout`（不属于契约 `ErrorCode`）。Vite 开发代理超时不得短于 75 秒（沿用 v1 要求，AGENTS.md 已写）。

### 2.4 统一错误解析

与 v1 相同：所有失败转为同一个 `ApiError`，界面只面对它。

| 来源 | ApiError 内容 | 说明 |
|---|---|---|
| HTTP 非 2xx 且响应体是错误体 | `status`、`code`、`message`、`request_id`、可选 `details[{field, reason}]` | 按 OpenAPI `ErrorResponse` 解析 |
| 非 2xx 但响应体不是 JSON 或缺字段（代理 413/502/504 页面等） | `code = 'unknown_error'` | 不展示原始响应体 |
| 请求超时 | `code = 'client_timeout'` | 见 2.3 |
| 网络失败（fetch reject，非超时） | `code = 'network_error'` | |

规则：界面**只展示** backend 的 `message`；前端自有码（`client_timeout` / `network_error` / `unknown_error`）用前端固定文案；`details` 只取 `field` 与 `reason`，不回显值；日志只允许 `request_id`、`code`、HTTP 状态，**不记录对话文本、回复、建议值、简历内容**（B-03）。

`quietCodes`（不记错误日志的预期结果）：v1 的 `draft_not_found`（O-12）**删除**；v2 仅 `DELETE` 的 `session_not_found`（重复删除，X-03）列为 quiet。

### 2.5 Cookie 与 Vite dev proxy

- 浏览器标识由 backend 在上传（#1）时签发，之后随带有效标识的成功响应续期；**没有标识时 `GET /sessions` 返回 200 空列表且不签发**（首次访问正常）。前端对这些**无需任何代码**。
- 浏览器标识缺失或无效时，会话类接口返回的是 `session_not_found`（与"不存在 / 不属于本浏览器"不区分），界面按"会话已不存在"处理即可。
- Vite `server.proxy['/api']`：`target` 为 `http://127.0.0.1:8000`；保留 `Set-Cookie`，不配置 `cookieDomainRewrite` / `cookiePathRewrite`；代理超时不短于 75 秒；multipart 请求体与二进制响应原样透传。其余同 v1 2.4。

### 2.6 重试策略

- api 层**不做任何自动重试**（DD-06）。
- 对话（#6）：无幂等键，失败/超时后重试前先 `GET /sessions/{sid}` 核对（3.5）。
- 保存（#9）：见 3.7——已不能靠"直接重发"确认结果。
- 更新（#10）：幂等，可直接重试，也可先重读 `update_state` 核对。
- 上传（#1）：重试 = 用户重新选择文件。
- 同一会话的在途请求互斥：`Busy` 状态期间禁用其他会话操作（上传/分区编辑/发送/应用/取消/保存/更新/切换/删除），沿用 v1 约定。

---

## 三、各接口消费设计

### 3.1 `POST /sessions`（REQ-FE-01、02）

**请求**：`multipart/form-data`，字段 `file`。预校验同 v1（仅体验，backend 为准）：单文件；扩展名与 MIME 属 pdf/jpg/jpeg/png；≤ 10485760 字节；0 字节拦截。

**成功（201）**：响应是完整 `SessionDetail`（`status=reviewing`，`messages=[]`，`fields` 值+状态，`resume=null`）。前端把它设为"当前会话"（`activeSessionId`），然后刷新会话列表。不再弹"覆盖确认"——上传永远新建会话，不影响其他会话（REQ-FE-01.5）。

**失败**（**不创建会话，不改变已有会话与 Cookie**，O-02；前端不清空当前已展示内容）：

| code | HTTP | 界面处理 |
|---|---|---|
| `file_missing` `file_empty` `file_content_mismatch` `file_too_large` `unsupported_file_type` | 400/413/415 | 展示 `message`，保留上传态可重新选择 |
| `parse_failed` | 502 | 展示 `message`（更换文件重传） |
| `parse_unavailable` | 503 | 展示 `message`（阻断，稍后重试；不暗示可换方式解析，ADR-001） |
| `parse_timeout` | 504 | 展示 `message`，提示重新上传 |
| `client_timeout`（75s） | — | 提示重新上传（REQ-FE-01.4）；不假设会话是否已创建（可能在列表中出现，刷新列表可见） |
| `network_error` `unknown_error` `internal_error` | — / 500 | 通用错误文案，可重新上传 |

### 3.2 `GET /sessions`（REQ-FE-05）

- 页面打开调用一次，之后在上传/对话/应用/取消/保存/更新/删除成功后各重读一次（REQ-FE-05.6）。无请求体。
- **200**：渲染列表项（`name`、`status`、`last_active_at`）；顺序以 backend 为准，前端不重排；`items=[]` 为空列表态（含"首次访问无 Cookie"）。**不自动打开任何会话**（REQ-FE-05.1）。
- 失败（500、网络、超时、非 JSON）：列表区显示可重试的错误态；主区仍可新建对话。不当作"没有会话"。
- 仅读取，不刷新最近活动时间，所以前端轮询/重读不会改变排序。

### 3.3 `GET /sessions/{sid}`（REQ-FE-02、05、07、09）

读取会话，按 `status` 与 `update_state` 渲染：

| 情形 | 响应特征 | 界面 |
|---|---|---|
| `reviewing` | `fields` 值+状态，`resume=null`，`update_candidate=null` | 校对视图：分区卡片 + 对话流 + 输入区；建议卡片按 `Suggestion.status` 渲染 |
| `saved`，`update_state=none` | `fields=null`，`resume`（只含值，ArchivedResume） | 已保存只读视图：对话记录 + 简历内容（`ReadOnlySection` 不显示状态）；无输入区、无最终确认入口（REQ-FE-04.10） |
| `saved`，`update_state=pending` | `resume`=**已有记录**内容，`update_candidate`=冻结的本次内容 + 本次文件元数据 | 在"该简历已保存过"提示下展示已有记录内容；对话流中提供快捷回复"按本次内容更新"；**不开放自由文本输入**（Y-01、REQ-FE-09.1） |
| `saved`，`update_state=applied` | `resume`=更新后的记录，`update_candidate=null` | 已保存只读视图，附一行"已按本次内容更新"（由 `update_state` 推出，不依赖本次响应） |

形状校验要点（`validate`）：`session_id`、`name` 非空串；`status ∈ {reviewing, saved}`；`update_state ∈ {none, pending, applied}`；**互斥一致性**：`reviewing ⇒ fields≠null ∧ resume=null ∧ update_state=none`；`saved ⇒ fields=null ∧ resume≠null`；`pending ⇔ update_candidate≠null`；`messages` 为数组，每条含 `message_id`、`role ∈ {user, assistant}`、`content`、`suggestions` 数组、可解析的 `created_at`；`fields` 复用 v1 的 `ResumeFields` 校验，`resume.fields` / `update_candidate.fields` 用新的 `ResumeValues` 校验（22 个键齐全，无 `status`）。校验失败为 `unknown_error`。

**404 `session_not_found`**（不存在 / 不属于本浏览器 / 标识缺失 / 路径格式不合法，不区分）：提示"该会话已不存在"，回到空态并刷新列表（REQ-FE-04.7 口径，与 OpenAPI"读取 → 会话已不存在，回到列表"一致）。

### 3.4 `DELETE /sessions/{sid}`（REQ-FE-05.5）

- 用户在二次确认（文案按 `status` 区分，REQ-FE-05.5）后发送；`responseMode: 'none'`，期望 **204**。
- 成功 204，**或** 404 `session_not_found`（已被删除，X-03）：两者都视为"已删除"——从列表移除，若删除的是当前会话则回到空态；随后刷新列表。404 在 api 层属 `quietCodes`，不记日志。
- 其他失败：显示错误，会话保留，可重试。
- 删除 `saved` 会话只删对话；已归档简历与原始文件不受影响（界面文案已体现，不额外调用归档接口）。

### 3.5 `POST /sessions/{sid}/messages`（REQ-FE-07）

**请求体**：`{ content }`，1–2000 字符。前端发送前 trim 判断空；超过 2000 字符禁用发送并提示（后端为准）。文本只放内存；输入框 `autoComplete="off"`（F-02）。

**成功（201）**：响应含 `user_message` 与 `assistant_message`（均为 `ChatMessage`），追加到本地对话流；助手消息的 `suggestions` 非空时渲染为一张卡片（一条助手消息 = 一张卡片，O2-01）。刷新列表（最近活动已变）。

**发送中**：对话流末尾显示"思考中"，禁用上传、分区编辑、切换、再次发送（REQ-FE-07.2）。用户原文保存在 `pendingMessage`，不要求先落到对话流。

**失败与重试**（REQ-FE-07.3、X-01）：

| code | 界面 |
|---|---|
| `chat_failed`（502） | 展示 `message`；**backend 保证未写入任何消息、建议或字段**，可直接重发，原文保留在输入框/待发区 |
| `client_timeout`（75s）/ `network_error` / `unknown_error` | **结果未知**（后端可能已写入）：不显示用户消息已发送；保留原文并提示"无法确认是否已发送"；**重试前先 `GET /sessions/{sid}`**，若尾部已出现 `role=user` 且 `content` 等于待发原文、其后跟着一条助手消息，且它们的 `message_id` 都不在发送前已知集合中，则视为已成功，用重读结果替换本地对话；否则才重发。不设幂等键（契约无） |
| `validation_failed`（422，`details.field=content`） | `required` → "请输入内容"；`too_long` → "最多 2000 字"；不回显内容 |
| `session_read_only`（409） | 会话已保存（如在别处保存）：展示 `message`，重读会话并按 `saved` 渲染，禁用输入 |
| `session_not_found`（404） | 同 3.3 的 404 |
| `internal_error` | 通用文案，保留原文可重试 |

**范围提醒**：`messages` 接口**不提供**保存/确认/更新动作，也**不返回**"展示待保存信息"之类的信号（X-02）。用户在对话里说"确认提交"只会得到文本回复，前端不解析文本，不据此改变视图或触发任何动作；确认入口仍是现有 `FinalReviewCard` 的"确认提交"按钮（REQ-FE-04.9）。

### 3.6 `POST .../messages/{mid}/apply` 与 `.../cancel`（REQ-FE-07）

- **以卡片为单位**（O2-01）：应用/取消作用于该助手消息下全部 `applicable=true ∧ status=pending` 的建议；`applicable=false` 的建议不参与，保持 `pending`、展示 `reason`、没有"应用"。
- 按钮显示条件：会话 `reviewing` ∧ 卡片内存在 `applicable=true ∧ status=pending` 的建议。
- 请求无请求体。成功 200：响应 `SuggestionActionResponse`（`message_id`、该卡片全部建议最新状态、**完整 `ResumeFields`**、`updated_at`）。前端用 `fields` **整体替换**当前会话字段（分区卡片、摘要计数随之更新，O2-02），用 `suggestions` 替换该卡片状态，清除 `editBuffer` 中被应用字段对应的未提交编辑（REQ-FE-07.5）。取消成功时 `fields` 为当前值，同样整体替换。刷新列表。
- `old_value`：读取时取会话**当前**字段值，只在 `reviewing` 且 `pending` 时返回；已应用/已取消/已保存会话中为 `null`。因此前端**不存在"原值过期"问题，不需要自行比较**；`null` 在待处理卡片上表示"字段当前为空"，渲染为"（空）"。`new_value`：标量字符串/`null`，文本列表为字符串数组（展示完整新列表，应用即整体替换）。
- 建议字段名到中文标签：经 `SectionConfig`（19 个白名单字段，不含三类经历，TQ-v2-01）；遇到白名单外的 `field` 视为 `unknown_error`（形状校验）。

| code | 界面 |
|---|---|
| `suggestion_unavailable`（409） | 展示 `message`（已处理 / 已失效 / 再校验不通过——整卡不生效）；**重读会话**刷新卡片与字段 |
| `session_read_only`（409） | 展示 `message`，重读会话按 `saved` 渲染 |
| `session_not_found`（404） | 同 3.3 |
| `client_timeout` / `network_error` / `unknown_error` / `internal_error` | 卡片保持待处理并可重试；重试得到 409 `suggestion_unavailable` 时，说明已处理，重读会话即可 |

### 3.7 `PATCH /sessions/{sid}/fields`（REQ-FE-03）

语义与 v1 `PATCH /resume-drafts/current` 相同，仅定位方式由"当前草稿"改为路径中的 `sid`。请求体 `{ fields: ResumeFieldsUpdate }`，出现的字段一律置 `confirmed`；列表区块整体替换（O-11）；子项下标定位 `details[].field`（`work_experiences[0].start_date`）。

**即时校验**（不变）：`name`/`phone`/`email` 不可空（全空白视为空）；`phone` 先去空格与连字符再按 `ResumeFieldsUpdate.phone.pattern` `^(1\d{10}|\+\d{6,15})$`；`email` 按 `pattern` `^[^\s@]+@[^\s@]+\.[^\s@]+$` 与 `maxLength 254`；各字段长度/条数上限取自 `ResumeFieldsUpdate`（见 design.md §6.1 `FIELD_MAX_LENGTH`，Step 3 随 0.2.0 核对，规则未变）。

**成功（200）**：响应 `SessionFieldsResponse`（`session_id`、`fields`、`updated_at`）；用 `fields` 整体替换当前会话字段（值与状态以 backend 为准）。刷新列表。

| code | 界面处理 |
|---|---|
| `validation_failed`（422） | 按 `details[{field, reason}]` 在字段旁展示（`required` 必填 / `invalid_format` 格式不正确 / `invalid_type` 类型不符 / `too_long` 内容过长 / `unknown_field` 内部错误，按通用错误并报告 request_id）；不回显值 |
| `session_read_only`（409） | 展示 `message`，重读会话按 `saved` 渲染 |
| `session_not_found`（404） | 同 3.3（v1 的"草稿已失效 → 空态"被此替代） |
| 其他 | 通用错误文案，保留本地编辑内容并允许重试 |

### 3.8 `POST /sessions/{sid}/resume`（REQ-FE-04）

**请求体**：`{ confirmed: true }`，仅在用户点击独立的"确认提交"后发送（B-04、F-03）；对话文字不触发。前置（前端侧，不变）：姓名、手机号、邮箱齐全、合法并已确认；仍有未确认字段先提示（D-03）；进行中禁用按钮。

**响应处理**（只依赖 `already_saved`，不看 HTTP 201/200，O-08）：

| 结果 | 界面 |
|---|---|
| 201，`already_saved=false` | 显示"已保存"；会话转 `saved`；保存成功卡（姓名、原始文件名、保存时间）保留，提供"上传下一份"（新对话）；**重读会话**得到只读已保存视图；刷新列表（REQ-FE-04.4） |
| 200，`already_saved=true` | 显示"该简历已保存过"（不是"已保存"，也不是"已更新"）；**重读会话**：`resume` 为已有记录内容，`update_candidate` 为本次内容；在其下只读展示已有记录内容，不展示记录编号；对话流中提供快捷回复"按本次内容更新"（REQ-FE-04.5、09.1） |
| `validation_failed`（422，带 details） | 就地标出字段并回到校对 |
| `confirmation_required`（422） | 视为前端缺陷：通用文案 + request_id；不应出现 |
| `save_failed`（500） | 展示 `message`；**backend 已补偿，会话保持 `reviewing`**，可直接重试 |
| `session_read_only`（409） | 会话已是 `saved`。**这是 v2 的新情形**：v1 的确认是幂等的，重试会得到 200 `already_saved`；v0.2 起对已保存会话重复保存返回 409。展示 `message` 的同时**重读会话**并按其 `status` 渲染（见 Q-IF-02：REQ-FE-04.10 写"只展示 message"，而"超时后重试"的场景希望直接呈现结果） |
| `session_not_found`（404） | 同 3.3，提示该会话已不存在 |
| `client_timeout` / `network_error` / `internal_error` / `unknown_error` | **不提示成功**（F-03）；提示"无法确认是否已保存"；允许用户重试，也允许先重读会话核对 `status`（REQ-FE-04.6 的"不调用状态查询"在 v2 不再成立：会话读取是正常接口，不是专用状态查询；见 Q-IF-02） |

`resume_id`、`saved_at` 不是界面必需，不写入浏览器存储。

### 3.9 `PUT /sessions/{sid}/resume`（REQ-FE-09）

**触发**：只有差异卡片上的"确认更新"按钮（Y-01：入口是快捷回复，不经模型；对话文字不触发）。前端先 `GET /sessions/{sid}` 取得 `resume` 与 `update_candidate`，**逐字段比较**（Y-02）：

- 比较的是两份 `ResumeValues`（22 个字段）。标量以 `null` 与 `""` 视为同一"空"；列表字段逐项比较，经历类对象缺失键与 `null` 视为相同；字符串不做 trim 以外的归一。相同字段只统计数量；有差异的逐项列出原值/新值；**候选为空而已有值非空的字段（将被清空）必须列出**（REQ-FE-09.2）。同时展示原始文件的新旧名称（`resume.original_file.filename` 与 `update_candidate.original_file.filename`）。
- 全部相同时也提供"确认更新"（文件仍可能不同）；差异卡片明示"除文件外无字段差异"。

**请求体**：`{ confirm_update: true }`。请求中禁止重复点击（`Busy='update'`）。

**成功（200）**：响应 `UpdateResumeResponse`（`resume_id`、`updated_at`）。**仅当 2xx 且形状校验通过**（`resume_id` 非空串、`updated_at` 可解析）才视为成功，此时重读会话，显示"已更新"（F-03）；重读失败不影响"已更新"提示，但内容展示以重读成功为准。刷新列表。幂等：`applied` 后再次请求返回同一 `resume_id` 与 `updated_at`。

| code | 界面 |
|---|---|
| `save_failed`（500） | "更新未完成，已有简历未改变"；差异卡片保留，可重试（B-05：提交前失败已有记录与文件保持不变，会话仍 `pending`） |
| `update_not_available`（409） | 展示 `message`；重读会话（可能已被应用或候选已失效），按新状态渲染 |
| `confirmation_required`（422） | 前端缺陷，通用文案 + request_id |
| `validation_failed`（422，核心三项） | 通用文案（候选在保存时已校验，正常不会出现）；不回显值 |
| `session_not_found`（404） | 同 3.3 |
| `client_timeout` / `network_error` / `unknown_error` | **结果未知**：不说成功也不说失败，提示"无法确认是否已更新"；因更新幂等，可直接重试，或重读会话看 `update_state`（`applied` 即成功） |
| `internal_error` | 通用文案，已有简历展示不变 |

### 3.10 `GET /resumes` 与 `GET /resumes/{rid}`（REQ-FE-08）

- 无需浏览器标识（全局可见，ADR-009）；每次进入归档页重读列表（REQ-FE-08.2）。
- 列表 `ResumeSummary`：`name`、`phone`、`email`、`job_title`（可为 `null`，显示"未填写"）、`saved_at`（首次保存时间，倒序由 backend 保证）；`items=[]` 显示"暂无记录"；不搜索、不编辑、不删除。手机号、邮箱仅渲染，不进日志/标题/URL。
- 详情 `ArchivedResume`：`fields`（`ResumeValues`，无状态）按 `SectionConfig` 分类只读展示，未填写显示"未填写"；`original_file.filename`、`saved_at`、`updated_at`（从未更新过时等于 `saved_at`，此时不额外展示"最近更新"）；`file_available=false` 时"打开原始文件"置灰并提示"原始文件暂不可用"，简历信息照常展示。
- 失败：`resume_not_found`（404）→ "该简历不存在"，回到列表并重读；列表/详情其他失败 → 可重试错误态。

### 3.11 `GET /resumes/{rid}/file`（REQ-FE-08.4）

`responseMode: 'blob'`（见 2.2）。用户点击"打开原始文件"时请求；成功后在新标签或下载，blob URL 用后回收，通用文件名（见 2.2）。

| code | 界面 |
|---|---|
| `file_not_available`（404） | 页面内提示"原始文件暂不可用"，简历信息仍可查看（X-05）；与详情 `file_available=false` 一致 |
| `resume_not_found`（404） | "该简历不存在"，回列表重读 |
| `client_timeout` / `network_error` / `unknown_error` / `internal_error` | 通用错误，可重试 |

---

## 四、错误码到界面处理映射（OpenAPI 0.2.0 全部 19 个 + 3 个本地码）

> 界面文案一律用 backend `message`；"处理"列说明界面动作。`—` 表示该码不会由该接口返回。

| # | code | HTTP | 来源接口 | 处理 |
|---|---|---|---|---|
| 1 | `file_missing` | 400 | #1 | 3.1：展示 message，可重新选择 |
| 2 | `file_empty` | 400 | #1 | 同上 |
| 3 | `file_content_mismatch` | 400 | #1 | 同上 |
| 4 | `file_too_large` | 413 | #1 | 同上 |
| 5 | `unsupported_file_type` | 415 | #1 | 同上 |
| 6 | `parse_failed` | 502 | #1 | 展示 message，更换文件重传 |
| 7 | `parse_unavailable` | 503 | #1 | 展示 message，阻断，稍后重试 |
| 8 | `parse_timeout` | 504 | #1 | 展示 message，重新上传 |
| 9 | `session_not_found` | 404 | #3 #4 #5 #6 #7 #8 #9 #10 | #4 视为已删除；其余：提示"会话已不存在"→ 回空态 + 刷新列表（3.3） |
| 10 | `session_read_only` | 409 | #5 #6 #7 #8 #9 | 展示 message，重读会话按 `saved` 渲染（只读） |
| 11 | `validation_failed` | 422 | #5 #6 #9 #10 | #5/#9：按 `details` 就地展示；#6：`details.field=content`；#10：通用文案 |
| 12 | `confirmation_required` | 422 | #9 #10 | 前端缺陷：通用文案 + request_id（正常不应出现） |
| 13 | `chat_failed` | 502 | #6 | 展示 message，原文保留，可直接重发（未写入） |
| 14 | `suggestion_unavailable` | 409 | #7 #8 | 展示 message，重读会话刷新卡片 |
| 15 | `update_not_available` | 409 | #10 | 展示 message，重读会话 |
| 16 | `resume_not_found` | 404 | #12 #13 | "该简历不存在"，回列表重读 |
| 17 | `file_not_available` | 404 | #13 | 页面内提示"原始文件暂不可用" |
| 18 | `save_failed` | 500 | #9 #10 | #9：会话仍 `reviewing`，可重试；#10："已有简历未改变"，可重试 |
| 19 | `internal_error` | 500 | 全部 | 通用文案，可重试；展示内容不变 |
| 20 | `client_timeout`（本地） | — | 全部 | #1/#6 75s、其余 30s；按各接口"结果未知"规则处理 |
| 21 | `network_error`（本地） | — | 全部 | 同上 |
| 22 | `unknown_error`（本地） | — | 全部（含形状校验失败） | 通用文案；**不得**进入成功分支 |

v1 的 `draft_not_found` 已删除（由 `session_not_found` 取代，X-08）；v1 的"启动 GET 的 404 = 空态"特例不再存在。

---

## 五、类型对齐策略

沿用 v1 DD-01：**手写** `src/types/`，与 OpenAPI schema 同名，不引入类型生成依赖；文件头注明对应的 OpenAPI 版本（改为 0.2.0）。

| OpenAPI schema | TS 类型（同名） | 变更 |
|---|---|---|
| `FieldStatus` `StringField` `StringListField` 及三个经历列表字段、`ResumeFields`、`ResumeFieldsUpdate`、`WorkExperience` `ProjectExperience` `Education` | 同名 | 不变 |
| `OriginalFileInfo` | 同名 | 不变 |
| `DraftResponse` `DraftUpdateRequest`（含 `draft_id` `expires_at`） | — | **删除** |
| `ResumeValues`（22 字段，仅值） | 同名 | 新增 |
| `SessionStatus` `UpdateState` `SessionSummary` `SessionListResponse` `SessionDetail` | 同名 | 新增 |
| `ChatRole` `ChatMessage` `SendMessageRequest` `SendMessageResponse` | 同名 | 新增 |
| `SuggestionField` `SuggestionValue` `SuggestionReason` `SuggestionStatus` `Suggestion` `SuggestionActionResponse` | 同名 | 新增 |
| `SessionFieldsUpdateRequest` `SessionFieldsResponse` | 同名 | 新增 |
| `UpdateCandidate` `UpdateResumeRequest` `UpdateResumeResponse` | 同名 | 新增 |
| `ArchivedResume` `ResumeSummary` `ResumeListResponse` | 同名 | 新增 |
| `CreateResumeRequest` `CreateResumeResponse` | 同名 | 不变（路径改为按会话） |
| `ErrorCode`（13 → 19 值）`ErrorDetail` `ErrorResponse` | 同名；`ApiError` 为前端类，另含 3 个前端自有码 | `ErrorCode` 增删见上 |

对齐规则：22 个字段键、`FieldStatus` 四值、`ErrorCode` 十九值、`reason` 五值（`Suggestion.reason` 为其中四值）、`SuggestionField` 十九值、`UpdateState` 三值、`SessionStatus` 两值、10485760 上限，均与 OpenAPI 一致；`type: [string, 'null']` 体现为 `string | null`；`Suggestion.old_value`/`reason` 可为 `null`；契约变更（须经 cross-workbench-reviewer）时，先更新本节与 types，再改调用代码。`types/Contract.test.ts` / `ContractDrift.test.ts` 的版本断言由 0.1.1 升到 0.2.0 属 Step 3/开发任务。

---

## 六、信息需求覆盖情况（对照 `api_design_resume.md` §八）

| 编号 | 需求项 | 状态 | 位置 |
|---|---|---|---|
| A | 接口清单、方法、用途 | ✅ 13 个操作 | 一、三 |
| B | 请求/响应类型、字段状态、已保存内容仅值 | ✅ `ResumeFields` / `ResumeValues` 分离（X-07） | 三、五 |
| C | 业务码、错误体、`details` | ✅ 19 码、5 个 `reason`、字段路径格式 | 四 |
| D | 幂等与"已保存过" | ✅ `already_saved` + `update_state`；保存对已保存会话不再幂等（409） | 3.8、3.9 |
| E | Cookie 行为 | ✅ `browser_id` 属性与续期；无标识时列表为空 | 2.5 |
| F | 超时与限长 | ✅ 上传/对话 75s；消息 ≤ 2000；其余 30s（前端自有） | 2.3、3.5 |
| G | 差异展示数据 | ✅ `resume` + `update_candidate` 前端比较（Y-02） | 3.9 |
| H | 原始文件获取与缺失 | ✅ blob；`file_available`；`file_not_available` | 3.10、3.11 |

---

## 七、设计决策

| 编号 | 决策项 | 决策 | 理由 | ADR |
|---|---|---|---|---|
| DD-01 | 类型来源 | 手写 `src/types/`，同名对照 OpenAPI | 契约小，避免引入生成器依赖；同名对照 + 契约变更流程保证一致 | 无 |
| DD-02 | 404 处理 | ~~`GET .../current` 的 404 返回 `null`~~ **被替代**：无 `/current`；`session_not_found` / `resume_not_found` 一律抛 `ApiError`，由调用方按接口选处理（3.3、四）；仅 `DELETE` 的 `session_not_found` 视为成功 | X-03、X-08；O-12 已被 v2 取代 | 无 |
| DD-03 | 成功判定 | "已保存/已保存过"只依据 `already_saved`；"已更新"只依据更新请求 2xx + 形状校验 | O-08、F-03 | 无 |
| DD-04 | 启动失败 | ~~启动 GET 草稿的非 404 失败进入错误态~~ **被替代**：启动只读会话列表，失败在列表区显示可重试错误态，不阻塞新建对话；不自动打开会话 | REQ-FE-05.1 | 无 |
| DD-05 | 超时 | 上传、对话 75 秒；其余 30 秒；`AbortController`；本地码 `client_timeout` | C-08、X-01；其余为前端自有决策 | 无 |
| DD-06 | 重试 | api 层不自动重试，只做手动重试 | 上传、对话非幂等；保存/更新由用户触发更可控 | 无 |
| DD-07 | PATCH 并发 | 同一时刻只允许一个在途 PATCH，后续排队 | PATCH 响应整体替换本地字段，并发会让较早响应覆盖较新状态 | 无 |
| DD-08 | 手机号提交值 | 提交去除空格与连字符后的值 | pattern 作用于规范化后的值 | 无 |
| DD-09 | 错误文案 | 只展示 backend `message`；前端自有码用固定文案；`reason` 由前端映射 | B-03 | 无 |
| DD-10 | 非 JSON 错误 | 代理或网关返回的非 JSON 失败统一为 `unknown_error` | 同源经 proxy，413/502/504 可能不是应用错误体 | 无 |
| DD-11 | 草稿丢失文案 | ~~PATCH 的 `draft_not_found` 回空态；确认的 `draft_not_found` 提示核实~~ **被替代**：所有会话类接口的 `session_not_found` 统一提示"会话已不存在"，回空态并刷新列表 | REQ-FE-04.7；OpenAPI `SessionNotFound` 注释 | 无 |
| **DD-12** | api 层响应模式 | `request()` 增加 `PUT`/`DELETE` 方法与 `none`（204）、`blob` 两种响应模式；错误体在任何模式下都按 JSON 解析 | 删除返回 204、文件返回二进制，v1 的"一律按 JSON 解析"不适用 | 无 |
| **DD-13** | 对话重试 | 失败或结果未知后，重发前先 `GET` 会话核对尾部消息；不设客户端幂等键 | 契约无幂等键（X-01）；`chat_failed` 保证未写入，超时/断网才需要核对 | 无 |
| **DD-14** | 建议卡片粒度 | 卡片 = 一条助手消息；应用/取消整卡；`applicable=false` 项只展示原因 | O2-01、REQ-BE-07 AC7 | 无 |
| **DD-15** | 应用结果来源 | 用 apply/cancel 响应中的完整 `fields` 整体替换当前字段，不重读会话 | O2-02 | 无 |
| **DD-16** | 建议原值 | 展示 `old_value` 原样，不自行比较或判断过期 | 契约保证读取时取当前值（不存在过期原值） | 无 |
| **DD-17** | 已保存会话字段形态 | 已保存内容一律用 `ResumeValues`（无状态）；`ReadOnlySection` 增加"不显示状态"开关 | X-07 | 无 |
| **DD-18** | 更新差异 | 前端比较 `resume` 与 `update_candidate`；空值归一（`null`/`""`、缺失键/`null`）；"将被清空"必列；文件新旧名称并列 | Y-02 | 无 |
| **DD-19** | "已更新"判定 | 仅更新请求 2xx 且形状通过后显示；明确失败显示"已有简历未改变"；未知结果引导核对；重试安全（幂等） | F-03、B-05、REQ-FE-09.4 | 无 |
| **DD-20** | 文件下载 | 走 blob，页面内处理缺失；通用文件名；blob URL 用后回收 | O2-03、X-05、REQ-FE-06.3 | 无 |
| **DD-21** | 列表刷新 | 上传、对话、应用/取消、保存、更新、删除成功后重读 `GET /sessions`；读取类操作不触发重读 | REQ-FE-05.6；读取不刷新最近活动 | 无 |
| **DD-22** | 路径参数 | 拼接路径前对 `sid`/`mid`/`rid` 做 `encodeURIComponent` | 防止异常字符破坏路径；后端对非法格式按 404 处理 | 无 |

> 以上决策均不影响其他 Workbench、不引入新技术组件、不偏离约束，按「ADR 门槛」不起草 ADR；本步不起草 ADR，Step 3 统一再扫描一次。

---

## 八、契约缺口与与 0.2.0 的核对

| 编号 | 事项 | 影响 | 当前处理 |
|---|---|---|---|
| G-01 | ~~邮箱规则~~ | — | ✅ 已关闭（0.1.1） |
| G-02 | `openapi.yaml` `info.description` 首句仍写"0.2.0 草稿……待 cross-workbench-reviewer 审视后冻结" | 无功能影响；与已冻结状态不一致 | 已记录，建议 backend 在冻结提交里更正文字；前端不改 openapi |
| G-03 | `SessionDetail.original_file` 的含义：命中幂等键（`update_state=pending`）时是**本会话上传的文件**（与已有记录的 `resume.original_file` 不同） | 已保存过视图应以 `resume.original_file` 展示"已有记录的文件"；`update_candidate.original_file` 展示"本次文件" | 前端按此理解（3.3、3.9）；见 Q-IF-01 请 DL/backend 确认 |
| G-04 | `POST /sessions/{sid}/resume` 对已保存会话返回 409（非幂等） | 与 REQ-FE-04.6 "超时后直接重试确认"的 v1 假设不一致 | 见 Q-IF-02 |

除上表外，未发现 OpenAPI 0.2.0 无法满足的 REQ-FE-01..09 验收标准。

---

## 九、REQ-FE 追溯

| 需求 | 本文覆盖点 |
|---|---|
| REQ-FE-01（上传） | 3.1；2.3；四 #1–#8 |
| REQ-FE-02（展示结果） | 3.1 成功、3.3、五 |
| REQ-FE-03（逐项校对） | 3.7；五 |
| REQ-FE-04（确认保存） | 3.8；2.6；Q-IF-02 |
| REQ-FE-05（历史会话） | 3.2、3.3、3.4；DD-21 |
| REQ-FE-06（浏览器侧安全与接口规范） | 2.1、2.2（blob）、2.4、五；DD-01、DD-09、DD-20 |
| REQ-FE-07（对话修改与问答） | 3.5、3.6；DD-13..DD-16 |
| REQ-FE-08（已归档简历页） | 3.10、3.11；DD-17、DD-20 |
| REQ-FE-09（确认更新） | 3.3、3.9；DD-18、DD-19 |

---

## 十、与架构约束 / 红线核对

| 约束 | 结论 |
|---|---|
| F-01 只通过 backend、api 层唯一出口 | ✅ 2.1、2.2；文件下载也经 api 层 blob，不用 `<a href>` 直连 |
| F-02 不使用浏览器本地存储、不读 Cookie | ✅ 2.1、2.2（blob 用后回收）、3.5（`autoComplete="off"`）；对话/建议/会话列表仅内存 |
| F-03 成功前不提示已保存/已更新 | ✅ 3.8、3.9、DD-03、DD-19；超时/网络失败/形状不符不进成功分支；`already_saved` 不是"已保存"也不是"已更新" |
| B-03 日志不含简历/对话内容 | ✅ 2.4 |
| B-04（前端侧）模型建议不得绕过确认 | ✅ 3.5、3.6：建议只经"应用"；不解析文本 |
| HLD §5 前端约束 | ✅ 无冲突 |
| ADR-001..009 | ✅ 无冲突（503 不暗示其他解析方式；ADR-007 对话；ADR-008 浏览器标识；ADR-009 归档只读；ADR-004 v2.1 更新经显式确认） |

---

## 十一、需 DL 澄清的点

| 编号 | 问题 | 建议 | 影响 |
|---|---|---|---|
| Q-IF-01 | 命中幂等键后，`SessionDetail.original_file` 是"本会话上传的文件"（与已有记录 `resume.original_file` 不同）吗？已保存过视图的文件名展示以 `resume.original_file` 为准，对吗 | 按 G-03 理解执行；请 backend 在契约说明中点明 | 误解会导致已保存过视图展示错文件名 |
| Q-IF-02 | `POST /sessions/{sid}/resume` 对已保存会话返回 409 `session_read_only`，所以"保存请求超时/断网后用户重试"不再得到 200 `already_saved`。是否接受：收到 409 时**重读会话并按其状态渲染**（已保存则直接显示结果视图），而不是只展示 message？这同时修订 REQ-FE-04.6（"不调用任何状态查询"）与 04.10（"只展示错误 message"）的适用范围 | 接受：重读会话并渲染；REQ-FE-04.6 限定为"不调用专用状态查询接口"，04.10 限定为"非超时重试场景" | 否则超时重试后用户看到"该会话已保存，不能再修改"，却不知道结果是新保存还是已保存过 |
| Q-IF-03 | 非上传、非对话的 11 个操作统一 30 秒超时是否可接受（含 `PUT` 更新的文件替换与原始文件下载） | 采纳 30 秒（本地文件 ≤ 10 MB） | 过短会让更新/下载在慢盘上误报未知结果 |
