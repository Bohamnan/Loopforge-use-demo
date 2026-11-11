# 简历信息收集（Backend）— 详细设计文档

## 文档信息

| 项目 | 内容 |
|------|------|
| 所属服务 | hr-collection-agent（backend） |
| 需求文档 | `backend-docs/HR_PR-1/01_requirements/requirements.md`（REQ-BE-01 ~ REQ-BE-09，v2.0） |
| Schema 文档 | `backend-docs/HR_PR-1/02_schema/sql_ddl_resume.md`（v0.2.0，已冻结） |
| 接口/管道文档 | `backend-docs/HR_PR-1/03_api/api_design_resume.md`、`03_api/openapi.yaml`（**0.2.0，已冻结**） |
| 设计日期 | 2026-11-10；v2 增量 2026-11-11 |
| 版本 | v0.4（v2/v2.1 增量，待「技术设计确认」关卡） |
| 分级 | 整体 L2（本地 POC，`.kiro/decisions/design/2026-11-10-HR_PR-1降级L2防止过度.md`）；红线点（B-03、B-04、B-05）按 L3 深度设计与验证 |

### 变更履历

| 版本 | 日期 | 变更 | 驱动 |
|------|------|------|------|
| v0.2 | 2026-11-10 | 增量修订 clients：deepseek-flash 实测不接受 PDF（仅 webp/png/jpeg/gif 图片），PDF 改为 backend 本地转换后提交：新增 `clients/pdf_renderer.py` 与依赖 `pypdfium2`；文本层优先、渲染 PNG 兜底、最多 5 页；日志白名单增加 `prompt_tokens`/`completion_tokens`；失败映射补 402。变更位置：§1 依赖清单与模型调用接口、§3.4、§6（`DeepSeekClient`、`pdf_renderer`）、§7.2。不改 OpenAPI | DL 裁决（任务 1.8 spike），ADR-001 修订由主 agent 处理 |
| v0.3 | 2026-11-10 | 任务 1.8 审查修复：模型与外发地址锁定（`DEEPSEEK_MODEL` 只能为 `deepseek-flash`，`DEEPSEEK_BASE_URL` 只允许 `https://api.deepseek.com` 可带路径前缀，不满足则启动失败且不回显值；客户端构造时再校验一次）；PDF 处理总耗时上限 20 秒（超时按 `parse_failed`，不调用模型）；提示词用起止标记包裹文档内容并清除文档文本中的标记。变更位置：§6（`DeepSeekClient`、`pdf_renderer`、`prompts`）、§7.2 | 第二批审查 BLOCK-1、QUESTION-1、SUGGEST；DL 裁决 |
| v0.4 | 2026-11-11 | **v2/v2.1 增量**（v1 全文快照 `_history/design.v1.md`）：① 会话模型替代单草稿：会话服务、浏览器标识归属校验、手动删除（§1、§3、§5.1、§5.6、§6）；② 取消 TTL 清理与调度线程，启动顺序改为"建目录 → 初始化库（含 `drafts.db` 升级）→ 对账 → 孤儿清扫一次"（§1、§5.4、§5.5）；③ 新增对话编排：快照 → 释放连接 → 调模型 → 事务写回，提示词与分隔标记/消毒，输出解析，建议校验管线，应用/取消（§5.2a、§5.2b、§6）；④ 首次保存后会话保留、`_after_source_missing` 等改读会话状态，命中幂等键保留更新候选（§5.3）；⑤ 新增确认更新路径：唯一版本名 → 提升 → 事务覆盖 → 删旧文件，失败补偿与对账新规则（§5.3a、§5.4）；⑥ 归档只读查询与文件下载（§5.7）；⑦ 日志白名单、错误码 13 → 19、测试策略红线点（§1、§7、§9）；⑧ 附录 A/B/D 更新。不改冻结的 OpenAPI 0.2.0 与 Schema v0.2.0 | HR_PR-1-CRv2、CRv2.1；重跑清单 7a |

> 本文档**引用**Schema 与接口文档，不重复其中的 DDL、字段清单、接口参数/响应/错误码。
> 约束：HLD v2.1、ADR-001..009、裁决 C-01..C-15 / D-01..D-06 / O-01..O-13 / O2-01..05 / X-01..X-10a / Y-01、Y-02、`AGENTS.md`、架构约束 B-01..B-06。OpenAPI 0.2.0 与 Schema v0.2.0 已冻结，本设计不改契约；如发现必须改动，列为「契约变更申请」（见附录 B）。
> v1 中被 v2 替代的设计（单草稿、`draft_token`、7 天清理线程、确认后删草稿、旧草稿替换）在对应章节就地改写，并以 `<!-- 变更 v2 / v2.1 -->` 标注；未标注的章节与 v1 一致。

---

## §1 设计决策表

> 只记技术设计层面的决策。Schema 决策见 `sql_ddl_resume.md` §五，接口决策见 `api_design_resume.md` §六，此处不重复。

| 决策项 | 决策 | 理由 | ADR |
|--------|------|------|-----|
| 依赖注入与可测试性 | `services` 只依赖抽象（`ResumeParserClient`、`ResumeChatClient`、各 Repository、`Clock`、`IdGenerator`），由 FastAPI `Depends` 在 `api/deps.py` 装配 <!-- 变更 v2 --> | 模型调用、时间、随机数都是测试里必须可替换的点（B-06：测试内不得真实外发）；也满足"services 不直接依赖具体 SDK" | — |
| 同步端点 | 路由函数用 `def`（非 `async def`），由 FastAPI 放入线程池；`clients` 用同步 `httpx.Client` | ADR-002 已定同步解析；约 5 人并发；避免在事件循环里阻塞 60 秒（对话同样同步，不流式） | ADR-002 已覆盖 |
| 持久化访问 | 标准库 `sqlite3`，不引入 ORM；每次操作新开连接并 `PRAGMA foreign_keys=ON`、`busy_timeout=5000`；写事务用 `BEGIN IMMEDIATE` | 两个小库、十几条 SQL、参数绑定即可；少一层依赖；`BEGIN IMMEDIATE` 让并发写者排队，配合唯一约束得到确定的并发行为 | — |
| 事务边界归属 | 事务由 repository 提供"事务作用域"或原子方法（如 `create_resume_aggregate`），service 决定"何时做"，不接触 `sqlite3` | 分层红线：services 禁止拼存储语句；repositories 禁止业务判断 | — |
| 会话字段更新的并发 | 分区 `PATCH`、建议"应用"的"读取-合并-写回"都放在同一个 `BEGIN IMMEDIATE` 事务内，共用一个纯函数 `merge_update` <!-- 变更 v2 --> | 同一会话两个标签页或"分区编辑 + 应用建议"同时发生时避免丢失更新；两条写路径走同一段合并代码，保证"两种方式修改同一份简历信息"（PRD #3） | — |
| 会话归属校验的唯一入口 | repository 层所有按会话 id 的读写方法**签名里必须带 `browser_hash`**，SQL 条件为 `id = ? AND browser_hash = ?`；service 不提供"只按 id"取会话的方法；"不存在"与"不属于"在 repository 层就无法区分，统一返回 `None` → `SessionNotFoundError` <!-- 变更 v2 --> | ADR-008 跟进 4：靠类型/签名而非调用方自觉来防越权；不区分两种情形即无存在性探测 | ADR-008 已覆盖 |
| 浏览器标识的解析 | `api/deps.get_browser_id` 校验格式（`secrets.token_urlsafe(32)` 的 43 位 `[A-Za-z0-9_-]`），非法按"无标识"；哈希在 service 入口做一次（`hash_token`），下层只见哈希；Set-Cookie 只在 2xx 响应由路由调用 `cookies` 追加（上传无标识时签发新标识，其余续期） <!-- 变更 v2 --> | 避免客户端自选弱标识；哈希与明文不扩散到 repository 以外的日志；失败响应不改 Cookie（O-02） | ADR-008 已覆盖 |
| 对话编排：不在事务内等待模型 | `ChatService.send` 分四步：① 读会话快照（字段、最近 20 条）后**关闭连接** → ② 调模型（≤60 秒）→ ③ 解析与建议校验（纯内存）→ ④ 单个 `BEGIN IMMEDIATE` 事务内重新确认会话存在且仍 `reviewing`，写入用户消息、助手回复、建议、刷新活动时间 <!-- 变更 v2 --> | SQLite 单写者：若在模型等待期间持有写事务会阻塞全部写入 60 秒；快照在写回时可能已陈旧（用户同时在分区编辑），所以建议只存新值，原值读取时取当前值，应用时重新校验 | ADR-007 已覆盖 |
| 对话失败不落库 | 模型调用失败/超时/输出结构不合法 → 抛 `ChatFailedError`，**不写任何消息、建议或字段** <!-- 变更 v2 --> | X-01 / REQ-BE-07.2：前端超时重试不会产生重复消息；用户消息也不单独落库，避免孤立的用户消息 | ADR-007 已覆盖 |
| 对话客户端的形态 | 新增协议 `ResumeChatClient.chat(request) -> RawChatResult`，由 `DeepSeekClient` 同时实现；复用同一个 `httpx.Client`、超时、外发地址/模型锁定与 HTTP 状态映射；对话失败统一映射为 `ChatFailedError`（不区分超时/不可用，日志里用 `code`/`status_code` 区分） <!-- 变更 v2 --> | B-02：外发只经 `clients`；解析与对话共用一套锁定与映射，避免两处口径漂移；对话文案与解析文案不同（"重新上传"不适用），所以不复用 `Parse*Error` | ADR-007 已覆盖 |
| 对话请求体 | 仅含：系统提示 + 一条 user 消息（三个分隔段：简历字段 JSON、最近 N 条历史、本条消息）；字段 JSON 含值与状态，**不含原始文件、原文件名、浏览器标识**；总体积沿用 `image_prep.MAX_REQUEST_BYTES` 口径（995,904 字节），超出时从最旧一条起丢弃历史，仍超出则 `ChatFailedError`（不外发） <!-- 变更 v2 --> | B-02/B-06、"单次请求体 ≤ 1 MB"约束；历史窗口 20 条（TQ-v2-06）只是上限 | ADR-007 已覆盖 |
| 提示词分隔与消毒 | 为字段段、历史段、消息段各定义成对标记（`<<<RESUME_FIELDS_BEGIN/END>>>`、`<<<CHAT_HISTORY_BEGIN/END>>>`、`<<<USER_MESSAGE_BEGIN/END>>>`）；`neutralize_markers` 泛化为处理**全部**标记（含解析用的 `DOC_*`），对字段值、历史、本条消息统一消毒后再放入段内 <!-- 变更 v2 --> | ADR-007 跟进 3：简历文本与用户输入都是不可信数据，不得关闭数据段；输出白名单解析是第二道防线 | ADR-007 已覆盖 |
| 对话输出的信任边界 | 输出必须是 JSON 对象 `{"reply": string, "suggestions": [{"field": string, "value": ...}]}`；顶层结构不符、`reply` 缺失/非字符串/去空白后为空 → `ChatFailedError`；`reply` 超过 4000 字符截断；`suggestions` 缺失视为空，数组内**单项不合规直接丢弃**（不让整条失败）；同字段重复只保留第一项；**忽略一切其他键**（不存在任何"保存/确认/更新"动作字段）<!-- 变更 v2 --> | B-04/X-02/Y-01：模型输出只能产生文本和待应用建议，不能影响控制流；单项宽松、顶层严格，减少无谓的失败 | ADR-007 已覆盖 |
| 建议校验管线（确定性） | 对每个候选项依次：① `field` 在 19 个白名单内，否则丢弃（三类经历字段属此，TQ-v2-01）→ ② `value` 形态为 `str\|null`（标量）或 `list[str]`（文本列表），其他形态丢弃 → ③ 与会话当前值（去首尾空白后）相同则丢弃 → ④ 姓名/手机号/邮箱：新值规范化后不在**本条用户消息**规范化文本中则丢弃 → ⑤ 通过 `ResumeFieldsUpdate` 校验与 `validate_update`（含"形态与字段种类不符"）失败则保留并标 `applicable=false` + `reason`（只含枚举，不回显值）；通过则 `applicable=true` <!-- 变更 v2 --> | B-04 红线：③④ 是丢弃而非标记，保证模型"编造"的三项必填值永远到不了用户面前；⑤ 复用与分区编辑同一套校验（单点）；顺序保证"不在消息中的核心值"先被丢弃，不会因格式不合法而以 `applicable=false` 出现 | ADR-007 已覆盖 |
| "出现在用户消息中"的比对 | 复用 `identity_key` 的规范化：消息文本先做 `name_key` 式空白折叠；`name`：`name_key(value)` 是否为其子串；`phone`：消息去所有空格/连字符后，`phone_key(value)` 是否为其子串；`email`：两侧小写后子串。只比对本条消息，不比对历史与简历内容 <!-- 变更 v2 --> | 规范化口径与幂等键一致（单点实现，不再引入第三套）；子串判断足以挡住"凭空编造"，不追求语义匹配 | ADR-007 已覆盖 |
| 应用/取消复用分区更新路径 | `apply`：事务内读卡片下 `applicable=1 AND pending` 的建议 → 组装 `ResumeFieldsUpdate` → 重新 `validate_update` → `merge_update`（与 PATCH 同一函数，字段置 `confirmed`）→ 写会话 → 建议置 `applied`；任一步失败整体回滚并抛 `SuggestionUnavailableError`。`cancel` 只改建议状态 <!-- 变更 v2 --> | REQ-BE-07.7：全部成功或全部不生效；写入口唯一，B-04 不会因第二条路径而绕开 | ADR-007 已覆盖 |
| 会话相关服务的拆分 | `SessionService`（创建/列表/读取/删除/分区更新）、`ChatService`（对话、应用/取消）、`ResumeService`（首次保存、确认更新）、`ArchiveQueryService`（归档只读）；原 `DraftService` 并入 `SessionService`，`merge_update` 抽成无依赖的纯函数模块 `services/field_merge.py` <!-- 变更 v2 --> | 每个服务只依赖自己需要的仓储；`ChatService` 不依赖 `ResumeService`，从结构上保证对话链路不可能触发保存（B-04） | — |
| 已保存内容的读取依赖 | `SessionService`/`ArchiveQueryService` 依赖只读接口 `ResumeReader`（`find_by_identity_key`、`list_summaries`、`get_detail`、`get_names`），写方法（`create_aggregate`、`replace_aggregate`）只暴露给 `ResumeService` <!-- 变更 v2 --> | B-05：手动删除会话、列表读取在类型上就拿不到写接口，不可能误改正式库；测试以"注入的读接口无写方法"固定 | — |
| 模型调用接口 | `clients.ResumeParserClient.parse(content: bytes, content_type) -> RawParseResult`；PDF 的本地转换与图片的编码方式封装在 clients 内 | 任务 1.8 spike 实测：deepseek-flash 的 API 只接受 webp/png/jpeg/gif 图片，**不接受 PDF**；把转换关进 client，services 与测试都不依赖它 | ADR-001（修订中，由主 agent 处理） |
| 模型输出的信任边界（解析） | 模型输出一律当作**不可信数据**：先做 JSON 解析 → Pydantic 严格校验 → `ParseNormalizer` 归一；`confirmed` 不允许由模型产生，模型自报状态只接受 `recognized/uncertain/missing`，其余按 `uncertain` 处理；超长值截断并降为 `uncertain` | B-04（不得猜测补全）；简历内容本身可能含"提示注入"文本，模型输出不得影响控制流，只能作为字段值 | — |
| 解析结果降级规则 | 值为空 ⇒ `missing`；类型不符或结构非法 ⇒ 该字段 `uncertain`（保留可解析部分）或 `missing`（完全不可用）；整体无法解析为对象 ⇒ `parse_failed` | REQ-BE-02.3；局部坏字段不应让整次上传失败，用户本来就要逐项校对 | — |
| 模型超时的实现 | `httpx.Timeout(connect=5, write=30, read=60, pool=5)`，非流式；读超时 ≈ 等待模型的墙钟时间；不自动重试（解析与对话相同） | C-08：60 秒；非流式响应在模型完成前无字节返回，读超时即总等待上限；重试会超过前端 75 秒 | — |
| 上传校验顺序 | 缺文件 → 扩展名白名单 → 分块读取并累计大小（>10 MB 立即中止）→ 空文件 → 魔数判型并与扩展名一致性比对 | 先做廉价检查；分块读取避免超大请求占满内存；**不信任客户端 `Content-Type`** | — |
| 类型判定不引入图像库 | 用魔数前缀判型（PDF `%PDF-`、JPEG `FF D8 FF`、PNG 8 字节签名） | 只需"判型"，不需解码；少一个重依赖与解码攻击面。损坏/加密文件交给模型，失败映射为 `parse_failed` | — |
| 业务校验单点 | 手机号/邮箱/字段长度校验与幂等键规范化各只在 `services` 一处实现（`field_validation`、`identity_key`），**分区更新、建议校验、确认保存、确认更新共用** <!-- 变更 v2 --> | 影响分析"共享逻辑完整性"：多处口径漂移会让"能更新、不能确认" | — |
| 字段长度上限 | 标量 ≤ 500 字符（`name` ≤ 100、`phone` ≤ 32、`email` ≤ 254、`self_evaluation` ≤ 5000）；文本列表 ≤ 50 项、每项 ≤ 1000；经历区块 ≤ 20 条、条内字符串 ≤ 2000、条内列表 ≤ 30 项；对话消息 ≤ 2000 字符（`schemas/limits.py` 单一来源）<!-- 变更 v2 --> | `too_long` 已在冻结契约的 reason 枚举中；上限写入 OpenAPI（0.1.1 CR-01，0.2.0 `SendMessageRequest`） | — |
| 无定时清理 | **取消**清理调度线程与 `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS`；会话只手动删除；启动时**只运行一次**孤儿文件清扫（`OrphanSweepService`，保留 1 天宽限），不再有过期草稿删除 <!-- 变更 v2 --> | ADR-008、DL 2026-11-11；孤儿只来自崩溃遗留（上传/保存/删除中途）和 v1 旧草稿文件，量极小，启动时单进程无在途上传，无需定时线程 | ADR-008 已覆盖 |
| 启动顺序 | `lifespan`：创建目录 → 初始化两个库（`drafts.db` 升级到 `user_version=2`，`resumes.db` 保持 1）→ **对账** → **孤儿清扫一次** → 开始接收请求 <!-- 变更 v2 --> | 对账与清扫必须在对外服务前完成，避免与新请求竞争文件；对账约束不变：仅此处同步运行一次、仅 `lifecycle` 引用 | ADR-005 |
| `drafts.db` 升级 | 按库分别维护 schema 版本；`user_version < 2` 时在**同一事务内** `DROP TABLE IF EXISTS drafts`（v1，不迁移）并创建新表；`> 2` 拒绝启动 <!-- 变更 v2 --> | Schema §4.6；v1 共用一个版本常量会连带升级 `resumes.db`；`CREATE IF NOT EXISTS` 无法就地改旧表 | — |
| 运行形态约束 | 只支持**单进程单 worker**（uvicorn `--workers 1`）；v2 不再有后台线程 <!-- 变更 v2 --> | SQLite 单写者、启动对账都按单进程设计；多 worker 会重复对账（本身幂等但无意义） | — |
| 错误模型 | 业务异常继承 `AppError(code, http_status)`；每个业务码的用户文案在 `core/errors.py` 集中定义；异常文案**永不**拼接用户数据；19 个业务码（v1 13 个：−`draft_not_found` +7）<!-- 变更 v2 --> | B-03；错误体与日志都不含用户内容 | — |
| 日志策略 | 结构化 JSON 日志；日志接口只接收**白名单字段**：`request_id`、`session_id`、`message_id`、`resume_id`、状态码、耗时、业务码、异常类名、`count`、`prompt_tokens`、`completion_tokens`（`draft_id` 改名为 `session_id`，新增 `message_id`，均为服务端生成的 UUID）；校验异常只记 `loc`/`type`，不记 `input` <!-- 变更 v2 --> | B-03；以下**永不记录**：用户消息、模型回复、建议字段名对应的值、简历字段、浏览器标识（明文与哈希）、文件名、模型原始响应；`log_event` 对非白名单字段直接抛错 | — |
| Cookie 构造 | 统一由 `api/cookies.py` 签发/续期，Cookie 名 `browser_id`，属性固定 `HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`，`Secure` 由配置开关（默认关，C-06）；不再提供"清除" <!-- 变更 v2 --> | 属性只在一处定义，避免续期时属性不一致导致浏览器不覆盖旧 Cookie；保存后不能清除（其余会话要继续可见）；Max-Age 为 400 天常量，不入配置 | ADR-008 已覆盖 |
| 幂等键与 `already_saved` | 见 ADR-004：规范化 (姓名, 手机号, 邮箱) 唯一约束 + 先查后写 + 冲突回查；v2.1：命中后会话保留更新候选 | 难回退的数据约束，并形成对 frontend 的契约 | ADR-004 |
| 保存顺序与启动对账 | 见 ADR-005：首次保存 复制到 tmp → 单事务写库 → 原子重命名；v2.1 更新 唯一版本名 → 提升 → 事务覆盖 → 删旧文件；启动时按规则对账 | 难回退的磁盘布局与一致性协议（B-05） | ADR-005（v2.1 修订） |
| 配置来源 | `pydantic-settings` 读取环境变量（模型凭证、目录、超时、`COOKIE_SECURE`）；**移除** `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS`（`extra="ignore"` 使遗留变量无副作用）；仓库只提供只含占位符的 `.env.example` <!-- 变更 v2 --> | B-01；`pydantic-settings` 与 Pydantic v2 同生态 | — |
| 依赖清单 | 运行：`fastapi`、`uvicorn`、`pydantic`、`pydantic-settings`、`httpx`、`python-multipart`、`pypdfium2`、`pillow`；开发：`pytest`、`pytest-cov`、`ruff`、`jsonschema`、`pyyaml`；版本由 `uv.lock` 固定；**v2 不新增依赖** <!-- 变更 v2 --> | C-15；不引入 ORM/调度库 | — |

---

## §2 系统架构图 <!-- 变更 v2 -->

```mermaid
graph TD
    FE["frontend (React) 同源 /api 代理"]
    subgraph backend["hr-collection-agent（单进程，无后台线程）"]
        subgraph api["api"]
            R1["routes/sessions（会话、分区更新）"]
            R2["routes/chat（消息、应用/取消）"]
            R3["routes/session_resume（保存、确认更新）"]
            R4["routes/archive（归档只读、文件下载）"]
            EH["error_handlers + RequestIdMiddleware"]
            CK["cookies / deps（browser_id）"]
        end
        subgraph services["services"]
            SS["SessionService"]
            CHS["ChatService"]
            SV["suggestion_validation"]
            FM["field_merge（纯函数）"]
            RS["ResumeService（首次保存 / 确认更新）"]
            AQ["ArchiveQueryService"]
            UV["upload_validation"]
            FV["field_validation / identity_key"]
            PN["ParseNormalizer"]
            OS["OrphanSweepService（仅启动一次）/ ReconcileService"]
        end
        subgraph repos["repositories"]
            SR["SessionRepository (drafts.db: sessions)"]
            CR["ChatRepository (drafts.db: messages, suggestions)"]
            RR["ResumeReader / ResumeWriter (resumes.db)"]
            DF["DraftFileStore (data/drafts/)"]
            AF["ArchiveFileStore (file/)"]
        end
        subgraph clients["clients（唯一外部出口）"]
            PC["ResumeParserClient / ResumeChatClient ← DeepSeekClient"]
        end
        subgraph core["core"]
            CFG["config / errors / logging / clock / ids"]
            LC["lifecycle：建目录 → 初始化库 → 对账 → 孤儿清扫"]
        end
        SCH["schemas（贯穿各层）"]
    end
    DEEP["deepseek-flash（获批外部服务）"]
    FE --> R1 & R2 & R3 & R4
    R1 --> SS
    R2 --> CHS
    R3 --> RS
    R4 --> AQ
    SS --> UV & PN & FV & FM
    SS --> SR & CR & DF & PC
    SS -. 只读 .-> RR
    CHS --> SV & FM & SR & CR & PC
    SV --> FV
    RS --> FV
    RS --> SR & RR & DF & AF
    AQ -. 只读 .-> RR
    AQ --> AF
    OS --> SR & DF & RR & AF
    LC --> OS
    PC --> DEEP
```

依赖方向：`api → services → repositories / clients`；`schemas`、`core` 被各层使用，不反向依赖。外发数据的唯一出口是 `clients`（B-02）。**`ChatService` 不依赖 `ResumeService`/`ResumeWriter`/`ArchiveFileStore`**：对话链路在依赖图上就无法触发保存或更新（B-04、X-02、Y-01）。虚线表示只读依赖。

---

## §3 代码结构变更

> 根目录：`codes/hr-collection-agent-backend/`。命名遵循 PEP 8；Pydantic 模型以 `Request`/`Response`/`Dto` 结尾（与 OpenAPI 同名的模型除外）；注释与 docstring 用英文。**本节"操作"列：v1 已存在的单元标注"修改"，v2 新增标注"新增"，v2 删除标注"删除"**。<!-- 变更 v2 -->

### 3.1 工程与配置

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| 环境变量样例 | `.env.example` | 修改 | 仅占位符：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL=deepseek-flash`、`DATA_DIR`、`FILE_DIR`、`MODEL_TIMEOUT_SECONDS=60`、`COOKIE_SECURE=false`；**删除** `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS` | REQ-BE-06.1、05.5 |
| 其余（`pyproject.toml`、`.gitignore`） | — | 不变 | 无新增依赖 | — |

### 3.2 `src/app/core/`

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| `Settings` | `core/config.py` | 修改 | 删除 `draft_ttl_days`、`cleanup_interval_seconds` | REQ-BE-05.5 |
| `ErrorCode`、`AppError` 及子类 | `core/errors.py` | 修改 | 13 → 19 个业务码：`DraftNotFoundError` 改为 `SessionNotFoundError`，新增 `SessionReadOnlyError`、`ChatFailedError`、`SuggestionUnavailableError`、`UpdateNotAvailableError`、`ResumeNotFoundError`、`FileNotAvailableError`；文案固定 | REQ-BE-04.8、05.7、07、08、09 |
| 安全日志 | `core/logging.py` | 修改 | 白名单：`draft_id` → `session_id`，新增 `message_id` | REQ-BE-06.3 |
| 令牌工具 | `core/ids.py` | 不变 | `generate_token`/`hash_token` 沿用，语义为浏览器标识 | REQ-BE-05.2 |
| SQLite 辅助 | `core/db.py` | 修改 | 版本按库维护（`DRAFTS_SCHEMA_VERSION=2`、`RESUMES_SCHEMA_VERSION=1`）；`init_drafts_db` 含 v1 表丢弃与新表建立（Schema §4.6）；其余不变 | REQ-BE-05.1 |
| 生命周期 | `core/lifecycle.py` | 修改 | 去掉 `cleanup()`/`start_scheduler()`/调度线程与 `interval_seconds`；新增 `sweep_orphans()`；`stop()` 无线程可停 | REQ-BE-04.4、05.5 |

### 3.3 `src/app/schemas/`

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| 字段与状态模型 | `schemas/resume_fields.py` | 不变 | `ResumeFields`、`ResumeFieldsUpdate` 等；建议校验直接复用 | — |
| 会话 DTO | `schemas/session.py`（原 `draft.py`） | 修改 | `SessionDetail`、`SessionSummary`、`SessionListResponse`、`SessionFieldsUpdateRequest`、`SessionFieldsResponse`、`UpdateCandidate`；去掉 `expires_at` | REQ-BE-01、03、05 |
| 对话 DTO | `schemas/chat.py` | 新增 | `SendMessageRequest/Response`、`ChatMessage`、`Suggestion`、`SuggestionActionResponse`；内部 `RawChatResult`、`ChatModelOutput` | REQ-BE-07 |
| 简历 DTO | `schemas/resume.py` | 修改 | `CreateResumeRequest/Response` 不变，新增 `UpdateResumeRequest/Response` | REQ-BE-04、09 |
| 归档 DTO | `schemas/archive.py` | 新增 | `ResumeValues`、`ArchivedResume`、`ResumeSummary`、`ResumeListResponse` | REQ-BE-08 |
| 限额常量 | `schemas/limits.py` | 修改 | 新增 `MESSAGE_MAX=2000`、`HISTORY_WINDOW=20`、`REPLY_MAX=4000`、建议字段白名单常量 | REQ-BE-07 |
| 错误 DTO、解析中间结果 | `schemas/errors.py`、`schemas/parse.py` | 不变 | — | — |

### 3.4 `src/app/clients/`

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| `ResumeParserClient` | `clients/resume_parser_client.py` | 不变 | `parse()` 接口 | REQ-BE-02.1 |
| `ResumeChatClient`（抽象） | `clients/resume_chat_client.py` | 新增 | `chat(request: ChatRequest) -> RawChatResult`；`ChatRequest` 只含字段 JSON、历史、本条消息（结构化文本，无文件） | REQ-BE-07.1 |
| `DeepSeekClient` | `clients/deepseek_client.py` | 修改 | 新增 `chat()`；与 `parse()` 共用 `httpx.Client`、锁定校验、状态映射；对话失败映射 `ChatFailedError`；日志只记状态码、耗时、token 数、业务码 | REQ-BE-07.1/07.2、06.2/06.3 |
| 提示词 | `clients/prompts.py` | 修改 | 新增对话系统提示与三组分隔标记；`neutralize_markers` 处理全部标记 | REQ-BE-07.10 |
| `pdf_renderer`、`image_prep` | `clients/` | 不变 | — | — |

### 3.5 `src/app/repositories/`

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| `SessionRepository`（原 `DraftRepository`） | `repositories/session_repository.py` | 修改 | `sessions` 表读写；所有按 id 的方法带 `browser_hash`；`list_by_browser`；`mark_saved`、`mark_candidate_pending`、`mark_update_applied` 三个**条件更新**；`delete`；`list_file_paths`（孤儿清扫用）；去掉 `delete_expired`/`touch_and_get`/`delete_by_token_hash` | REQ-BE-01.5、03、05 |
| `ChatRepository` | `repositories/chat_repository.py` | 新增 | 消息与建议读写（同事务内取 `max(seq)+1`）；`recent_messages(session_id, n)`；`suggestions_of_message`；`mark_suggestions(message_id, status)`（条件 `pending AND applicable=1`） | REQ-BE-07 |
| `ResumeReader`（协议）/ `ResumeRepository` | `repositories/resume_repository.py` | 修改 | 新增只读方法 `list_summaries`、`get_detail`、`get_names`；新增写方法 `replace_aggregate`（键守卫 UPDATE + 子表先删后建，返回旧 `file_path`）；`_insert_sub_rows` 区分 `created_at/updated_at` | REQ-BE-08、09 |
| `DraftFileStore` | `repositories/draft_file_store.py` | 不变 | 会话临时文件读写删、孤儿扫描 | REQ-BE-01.1 |
| `ArchiveFileStore` | `repositories/archive_file_store.py` | 修改 | 新增只读 `open_final(file_path)`（仅匹配终态名、拒绝符号链接、`O_NOFOLLOW`）与 `is_available(file_path)`；`stage/promote/discard_tmp/remove/scan` 不变（更新用唯一版本名作为 `resume_id` 参数） | REQ-BE-08.3、09.4 |

### 3.6 `src/app/services/`

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| `upload_validation`、`field_validation`、`identity_key`、`ParseNormalizer` | `services/` | 不变 | — | — |
| `field_merge` | `services/field_merge.py` | 新增 | 纯函数 `merge_update`（自 `draft_service` 抽出，PATCH 与应用建议共用） | REQ-BE-03.2、07.7 |
| `SessionService`（原 `DraftService`） | `services/session_service.py` | 修改 | 创建（上传解析，不删其他会话）、列表、读取（`reviewing`/`saved`/候选三种形态）、删除（两种情形）、分区更新；会话名称读取时计算 | REQ-BE-01、02、03、05 |
| `ChatService` | `services/chat_service.py` | 新增 | `send()`、`apply()`、`cancel()`；§5.2a/§5.2b | REQ-BE-07 |
| `suggestion_validation` | `services/suggestion_validation.py` | 新增 | 建议校验管线（§1），纯函数，输入为候选项、当前字段、用户消息，输出 `Suggestion` 草案列表 | REQ-BE-07.3/07.4/07.5 |
| `ResumeService` | `services/resume_service.py` | 修改 | `confirm()` 改按会话；`_finish`→`mark_saved`/`mark_candidate_pending`；`_after_source_missing`、`_load_draft` 改读会话状态；新增 `update_existing()` | REQ-BE-04、09 |
| `ArchiveQueryService` | `services/archive_query_service.py` | 新增 | 归档列表、详情（含 `file_available`）、文件定位 | REQ-BE-08 |
| `OrphanSweepService`（原 `CleanupService`） | `services/orphan_sweep_service.py` | 修改 | 只保留孤儿清扫；引用集合来自 `sessions.file_path`；**永不访问 `file/`** | REQ-BE-05.5 |
| `ReconcileService` | `services/reconcile_service.py` | 修改 | `_remove_orphans` 增加"陈旧旧版文件"规则；其余不变 | REQ-BE-04.4、09.4 |

### 3.7 `src/app/api/` 与入口

| 代码单元 | 路径 | 操作 | 职责 | 关联需求 |
|---|---|---|---|---|
| 应用工厂 | `app/main.py` | 修改 | 注册 4 个路由模块；`version` 0.2.0；`app.state` 增加对话客户端（默认与解析客户端同一实例） | REQ-BE-06 |
| 依赖装配 | `api/deps.py` | 修改 | `get_browser_id`（格式校验）；装配各服务；去掉 `ttl_days` | REQ-BE-05.2 |
| Cookie 工具 | `api/cookies.py` | 修改 | `issue`/`renew`（同一函数，属性一致）；删除 `clear` | REQ-BE-05.2 |
| 会话路由 | `api/routes/sessions.py`（原 `resume_drafts.py`） | 修改 | `POST/GET /sessions`、`GET/DELETE /sessions/{id}`、`PATCH /sessions/{id}/fields` | REQ-BE-01、03、05 |
| 对话路由 | `api/routes/chat.py` | 新增 | `POST .../messages`、`POST .../messages/{mid}/apply|cancel` | REQ-BE-07 |
| 保存/更新路由 | `api/routes/session_resume.py`（原 `resumes.py`） | 修改 | `POST/PUT /sessions/{id}/resume`；成功**不清除** Cookie | REQ-BE-04、09 |
| 归档路由 | `api/routes/archive.py` | 新增 | `GET /resumes`、`/resumes/{id}`、`/resumes/{id}/file`（流式、响应头构造） | REQ-BE-08 |
| 异常处理与中间件 | `api/error_handlers.py` | 修改 | 路径常量改为"路由模板 + 方法"判定；新增 `content` 校验映射 | REQ-BE-06.3/06.4 |

### 3.8 `tests/`（与 src 同构）

| 代码单元 | 路径 | 操作 | 职责 |
|---|---|---|---|
| 公共夹具 | `tests/conftest.py`、`tests/fakes.py` | 修改 | 新增 `FakeChatClient`；会话/浏览器标识夹具 |
| 受影响的 v1 用例 | 见 `00_impact_analysis.md` §七、§11.5 | 修改 | 随契约（O2-05）整体重写，具体清单与预算在 Step 4 |
| 契约测试 | `tests/contract/test_openapi_conformance.py` | 修改 | 对照冻结的 0.2.0 |

---

## §4 数据模型分析 <!-- 变更 v2 -->

> 表结构、字段、索引、DDL 见 `02_schema/sql_ddl_resume.md`（v0.2.0），此处不重复；只补充关系、数据流向与查询模式。

- **实体关系**：草稿库 `sessions` + `chat_messages` + `chat_suggestions`（同库，FK 级联）；正式库 `resumes` + 三张子表；两库无外键，**唯一的跨库引用是 `sessions.resume_id`**（逻辑引用）。幂等判定仍完全依赖 (姓名, 手机号, 邮箱) 的规范化键。`resumes` 与原始文件一对一（`file_path` 唯一）；一条 `resumes` 可被多个 `saved` 会话引用。
- **内存模型与存储映射**：
  - `reviewing` 会话：`ResumeFields`（22 个 `{value, status}` 节点）⇄ `sessions.fields_json`。
  - `saved` 会话：不留副本（`fields_json='{}'`），内容读 `resumes`（只含值，`ResumeValues`）；`pending` 候选：`fields_json` 冻结保留。
  - 正式记录：确认时 `ResumeFields` 的 **value** 展开为 `resumes` 标量列、四个 `*_json` 列和三张子表行；**status 不入正式库**。
  - 建议：只存新值；原值读取时取会话当前字段值。
- **数据流向**：

```mermaid
flowchart LR
    U["上传文件 bytes"] --> V["upload_validation"]
    V --> T["data/drafts/{session_id}{ext}"]
    V --> M["DeepSeekClient.parse（外发）"]
    M --> N["ParseNormalizer"]
    N --> S[("drafts.db: sessions.fields_json")]
    S -->|"PATCH / 应用建议（同一 merge_update）"| S
    S -->|"字段值 + 历史（无文件）"| C["DeepSeekClient.chat（外发）"]
    C --> SV["suggestion_validation"]
    SV --> CM[("chat_messages / chat_suggestions")]
    S -->|"确认"| X["field_validation + identity_key"]
    T -->|"复制 + fsync"| TMP["file/.{id}{ext}.tmp"]
    X --> R[("resumes.db")]
    TMP -->|"提交后 os.replace"| F["file/{id}{ext}"]
    S -.->|"更新候选: 唯一版本名 file/{id}-{x}{ext}"| F
    R -.->|"一对一 file_path"| F
```

- **查询模式**（全部走索引，参数绑定）：

| 查询 | 使用者 | 索引 |
|---|---|---|
| `sessions WHERE id=? AND browser_hash=?` | 所有按会话访问 | 主键 + 条件 |
| `sessions WHERE browser_hash=? ORDER BY last_active_at DESC` | 会话列表 | `idx_sessions_browser_active` |
| `chat_messages WHERE session_id=? ORDER BY seq DESC LIMIT 20` | 发给模型的历史 | `uq_chat_messages_session_seq` |
| `chat_suggestions WHERE message_id=?` | 读取会话/应用/取消 | `uq_chat_suggestions_msg_seq` |
| `resumes WHERE name_key=? AND phone_key=? AND email_key=?` | 确认的先查重与冲突回查、更新前一致性校验 | `uq_resumes_identity` |
| `resumes ORDER BY created_at DESC`、`resumes WHERE id=?`、`resumes WHERE id IN (…)` | 归档列表/详情、会话名称 | 主键；列表 POC 全表排序（不新增索引） |
| `sessions.file_path IS NOT NULL` 全量 | 启动孤儿清扫 | 全表（启动一次） |
| `resumes.file_path` 全量 | 启动对账 | `uq_resumes_file_path` |

- **数据量与容量**：会话持续增长（不自动清理，ADR-008 已接受）；正式库百至千级；单文件 ≤ 10 MB，无需分页与分区。
- **留存**：见 Schema §4.4。会话侧清理只作用于草稿库与草稿目录，**不触碰 `resumes.db` 与 `file/`**。

---

## §5 核心业务流程

### 5.1 上传解析（接口 1；REQ-BE-01、02、05.2）<!-- 变更 v2 -->

```mermaid
flowchart TD
    A["POST /sessions"] --> B{"upload_validation<br/>缺文件/扩展名/大小/空/魔数"}
    B -- 失败 --> E1["400/413/415：不调用模型，不创建会话，不动 Cookie"]
    B -- 通过 --> C["生成 session_id；写 data/drafts/{id}{ext}"]
    C --> D["DeepSeekClient.parse（≤60s，同步）"]
    D -- 超时/不可用/失败 --> E2["删除临时文件；504/503/502；不创建会话，不动 Cookie"]
    D -- 成功 --> F["ParseNormalizer：降级/截断/状态归一"]
    F --> G["INSERT sessions（browser_hash，status=reviewing）"]
    G -- 插入失败 --> E3["删除临时文件；500"]
    G -- 成功 --> K["Set-Cookie browser_id（无有效标识则新签发，否则续期）；201 SessionDetail"]
```

要点：
- 文件 bytes 读入内存一次（≤10 MB），同时用于落盘与调用模型；模型调用发生在会话行插入**之前**，所以失败不会产生会话行（O-02）。
- **不再删除任何旧会话**（v1 的 `_delete_previous`/O-03 作废）；上传只新增。
- 浏览器标识：请求带有效标识则复用；否则 `generate_token()` 生成新标识，**只有整个请求成功后**才由路由写入 Set-Cookie；库内只存哈希。
- 失败路径在返回前删除已写入的临时文件；崩溃遗留的临时文件由启动孤儿清扫兜底（§5.5）。

### 5.2 分区校对更新（接口 5；REQ-BE-03）<!-- 变更 v2 -->

```mermaid
sequenceDiagram
    participant FE as frontend
    participant API as api
    participant SS as SessionService
    participant SR as SessionRepository
    FE->>API: PATCH /sessions/{id}/fields {fields}
    API->>SS: update_fields(session_id, browser_id, update)
    SS->>SS: field_validation（全部校验，失败则不写入）
    SS->>SR: transaction（BEGIN IMMEDIATE）get(id, browser_hash)
    SR-->>SS: 会话（不存在/不属于 → None → 404）
    SS->>SS: saved → session_read_only；否则 merge_update（出现的字段置 confirmed）
    SS->>SR: 写回 fields_json，刷新 updated_at / last_active_at
    SR-->>SS: commit
    SS-->>API: {session_id, fields, updated_at}
    API-->>FE: 200 + 续期 Cookie
```

字段状态流转（单向，沿用 v1，对话"应用"与分区编辑走同一套）：

```mermaid
stateDiagram-v2
    [*] --> recognized: 模型有依据
    [*] --> uncertain: 模型存疑/结构非法/超长截断
    [*] --> missing: 未找到
    recognized --> confirmed: 用户提交该字段 / 应用建议
    uncertain --> confirmed: 用户提交该字段 / 应用建议
    missing --> confirmed: 用户提交（含确认留空）/ 应用建议
    confirmed --> confirmed: 用户再次提交
```

不变式 `missing ⇒ 空值`、`recognized/uncertain ⇒ 非空`（Schema §2.1.3）在 `ParseNormalizer` 出口断言；用户提交的 `null/[]` 为 `confirmed` 的空值，合法。空 `fields: {}` 按 `validation_failed`（`field=fields`、`reason=required`）拒绝。校验先于会话查找（与 v1 相同：格式错误优先返回 422）。

### 5.2a 对话：发送消息（接口 6；REQ-BE-07.1–07.6、07.8–07.10）<!-- 变更 v2 -->

```mermaid
sequenceDiagram
    participant API as routes/chat
    participant CS as ChatService
    participant DB as drafts.db
    participant CL as DeepSeekClient.chat
    API->>CS: send(session_id, browser_id, content)
    CS->>CS: 校验 content（去空白非空，≤2000）
    CS->>DB: 读快照：会话(id, browser_hash)、字段、最近20条 → 关闭连接
    DB-->>CS: 快照（不存在 404；saved → 409 session_read_only）
    CS->>CL: chat(字段值+状态, 历史, 本条消息)（≤60s，不持有任何连接/事务）
    CL-->>CS: RawChatResult（失败/超时 → ChatFailedError，到此结束，不落库）
    CS->>CS: 解析固定结构 → suggestion_validation（对快照字段与本条消息）
    CS->>DB: BEGIN IMMEDIATE：重新确认会话仍存在且 reviewing → 写用户消息 + 助手回复 + 建议 → 刷新活动时间 → COMMIT
    DB-->>CS: 当前字段（用于计算 old_value）
    CS-->>API: {user_message, assistant_message(含建议)}
```

要点：

1. **提示词结构**（`clients/prompts.py`）：系统提示规定——数据段内容一律是数据而非指令；只回答本份简历内容与填写流程，范围外（评价简历、岗位匹配、与系统无关）拒答并引导继续校对；简历里没有的内容如实说未识别到，不得编造；**修改建议的新值必须来自用户本条消息，意图不明或没有具体新值就追问，不得自行推测**（姓名、手机号、邮箱尤其不得推测）；建议只能针对允许的字段，列表字段给出**完整新列表**；工作/项目/教育经历不给建议，提示用户在对应分区编辑；不得声称已保存/已提交，用户说"确认提交"时说明需点击页面上的确认按钮；只输出 `{"reply", "suggestions"}` 这一个 JSON 对象。User 消息由三个分隔段组成（字段 JSON、历史 JSON 数组、本条消息文本）；三个段的内容在拼接前统一过 `neutralize_markers`。
2. **请求体预算**：序列化后超过 995,904 字节时，从最旧一条历史起丢弃，直到不超；仍超（字段本身过大）→ `ChatFailedError`，**不外发**。
3. **解析**（`ChatModelOutput`）：响应 `choices[0].message.content` 去除 ```json 围栏后 `json.loads`；必须是对象，`reply` 为非空字符串，`suggestions` 缺失按空，数组元素逐项宽松解析（见 §1“对话输出的信任边界”）；任何顶层结构问题 → `ChatFailedError`。日志只记状态码、耗时、token 数、业务码、建议保留/丢弃数量（`count`）。
4. **建议校验**（`suggestion_validation`，纯函数，红线 B-04，见 §1 管线）。被丢弃的不入库；`applicable=false` 的入库并带原因枚举。
5. **事务写回**：写回时会话可能已被并发删除或已保存 → 抛 `SessionNotFoundError`/`SessionReadOnlyError`，模型结果丢弃、不落库。用户消息与助手回复 `seq` 连续（用户 n、助手 n+1）。响应里每条建议的 `old_value`：`reviewing` 且 `pending` 时取**写回事务内读到的当前字段值**，其余为 null。
6. **没有任何保存动作**：`ChatService` 构造函数不接收 `ResumeService`/`ResumeWriter`/`ArchiveFileStore`；解析只读取 `reply` 与 `suggestions` 两个键；用户说"确认提交"只会得到文本回复（X-02）。
7. 同一会话两个对话请求并发：各自快照、各自调用模型，写回在 `BEGIN IMMEDIATE` 内串行，`seq` 由事务内 `max+1` 分配，顺序以提交先后为准；建议可能基于略有差异的快照，应用时统一重新校验。

### 5.2b 对话：应用 / 取消建议卡片（接口 7、8；REQ-BE-07.7）<!-- 变更 v2 -->

`apply(session_id, message_id, browser_id)`，单个 `BEGIN IMMEDIATE` 事务：

1. 取会话（归属）；不存在 → 404；`saved` → `session_read_only`。
2. 取 `message_id` 所属该会话的助手消息；不属于 → 404 `session_not_found`。
3. 取该卡片下 `applicable=1 AND status='pending'` 的建议；为空 → `suggestion_unavailable`。
4. 用这些建议的 `field`/`new_value` 组装 `ResumeFieldsUpdate`，**重新**做 `validate_update`（建议保存后字段可能已被分区编辑改动；也防止库内数据被篡改）；不通过 → `suggestion_unavailable`（整体回滚，卡片保持 `pending`）。
5. `merge_update(fields, update)`（与 PATCH 同一纯函数，字段置 `confirmed`）→ 写回 `fields_json` → 建议置 `applied` → 刷新活动时间 → COMMIT。
6. 返回该卡片全部建议的最新状态（`old_value` 为 null）与更新后的完整字段。

`cancel`：同 1–3，把卡片下 `applicable=1 AND pending` 的建议置 `cancelled`，字段不变；返回同一结构。`applicable=0` 的建议在两个动作中都不参与、状态保持 `pending`。重复应用/取消得到 `suggestion_unavailable`（第 3 步为空）。

### 5.3 确认保存（接口 9；REQ-BE-04）<!-- 变更 v2 / v2.1 -->

```mermaid
flowchart TD
    A["POST /sessions/{id}/resume {confirmed}"] --> B{"confirmed === true？"}
    B -- 否 --> X1["422 confirmation_required"]
    B -- 是 --> C["sessions.get(id, browser_hash)"]
    C -- 无 --> X2["404 session_not_found"]
    C -- 已 saved --> X5["409 session_read_only"]
    C -- reviewing --> D{"核心三项齐全且合法？"}
    D -- 否 --> X3["422 validation_failed + details"]
    D -- 是 --> E["identity_key 规范化"]
    E --> F{"find_by_identity_key 命中？"}
    F -- 是 --> DUP["重复分支"]
    F -- 否 --> G["ArchiveFileStore.stage：复制会话临时文件到 file/.{id}{ext}.tmp 并 fsync"]
    G -- 源文件缺失 --> G2["_after_source_missing（改读会话状态）"]
    G -- 其他失败 --> X4["500 save_failed（已清理 tmp，会话保持 reviewing）"]
    G -- 成功 --> H["ResumeWriter.create_aggregate：BEGIN IMMEDIATE，主表+子表，COMMIT"]
    H -- 唯一约束冲突 --> H2["discard_tmp；回查已有记录"] --> DUP
    H -- 其他失败 --> H3["ROLLBACK；discard_tmp"] --> X4
    H -- 成功 --> I["ArchiveFileStore.promote：os.replace(tmp → file/{id}{ext})"]
    I -- 失败 --> I2["重试一次；仍失败：保留 tmp，记告警，500 save_failed（记录已提交，下次启动 roll-forward）"]
    I -- 成功 --> J["sessions.mark_saved（条件更新）→ 删除会话临时文件（失败仅记日志）"]
    J --> OK["201 already_saved=false"]
    DUP --> D2["discard_tmp（如有）；sessions.mark_candidate_pending(resume_id=已有记录, 保留 fields_json 与临时文件)"] --> OK2["200 already_saved=true，返回已有 resume_id 与 saved_at"]
```

要点：
- **幂等**：先查重只为避免无谓文件复制；真正兜底是 `uq_resumes_identity`。并发的两个确认：先到者写入，后到者在 `BEGIN IMMEDIATE` 排队后收到唯一冲突 → 回查 → 走重复分支。
- **会话状态的改读**（v1 靠"草稿行是否已被删"表示完成，v2 行不再删，所有这类判断改读会话状态）：
  - `confirm` 入口：`saved` 一律拒绝（`session_read_only`），**不能走幂等分支**（更新只经 `PUT`）。
  - `mark_saved` / `mark_candidate_pending` 都是**条件更新**（`WHERE id=? AND browser_hash=? AND status='reviewing'`）。`rowcount=0` 时重读会话：已不存在 → `session_not_found`；已 `saved` 且 `resume_id` 等于本次结果记录 → 视为同一会话的并发重复提交，返回已有记录（`already_saved=true`，不创建候选）；已 `saved` 且 `resume_id` 不同 → `session_read_only`。
  - `_after_source_missing`（会话临时文件不存在）：重读会话——`saved` 且有 `resume_id` → 同上返回已有记录；会话不存在 → `session_not_found`；仍 `reviewing` → `save_failed`（文件丢失，记 `draft_file_missing`）。取代 v1 的"草稿行已不存在"判断（`resume_service.py` `_after_source_missing`/`_load_draft` 的过期判断一并删除）。
- **B-05 补偿**（首次保存，不变）：任何一步失败都不会留下"有记录无文件"或"有文件无记录"：提交前失败只需清 tmp；提交后重命名失败，记录与 tmp 同时存在，由启动对账补完（ADR-005）。
- **B-04**：仅在 `confirmed === true` 且核心三项齐全合法后才触达 `resumes.db`；会话阶段不写正式库；对话链路无写入口。
- **D-03**：未被逐项确认的字段按会话当前值保存。
- **收尾失败不影响结果**：`mark_saved` 失败（非并发原因）或删文件失败仅记日志——会话仍 `reviewing` 时用户再次确认会命中幂等键，走重复分支（得到"已保存过"）；残留临时文件由启动清扫兜底。**不清除 Cookie**。
- **命中幂等键时保留更新候选**（v2.1）：会话 `status=saved, update_state=pending, resume_id=已有记录`，`fields_json` 与临时文件**冻结**；不创建 tmp 以外的任何文件。

### 5.3a 确认更新（接口 10；REQ-BE-09，ADR-004/005 v2.1 修订）<!-- 变更 v2.1 -->

`ResumeService.update_existing(session_id, browser_id, confirm_update)`：

```mermaid
flowchart TD
    A["PUT /sessions/{id}/resume {confirm_update}"] --> B{"confirm_update === true？"}
    B -- 否 --> X1["422 confirmation_required"]
    B -- 是 --> C["sessions.get(id, browser_hash)"]
    C -- 无 --> X2["404 session_not_found"]
    C -- "update_state=applied" --> IDEM["幂等：读记录，200 {resume_id, updated_at}"]
    C -- "非 saved+pending" --> X3["409 update_not_available"]
    C -- "saved+pending" --> D["校验核心三项；重算键；find_by_identity_key == sessions.resume_id？"]
    D -- 否 --> X3
    D -- 是 --> E["file_id = {resume_id}-{suffix8}；stage 到 .{file_id}{ext}.tmp"]
    E -- 失败 --> X4["500 save_failed（记录/会话不变）"]
    E -- 成功 --> F["promote → file/{file_id}{ext}（唯一新名）"]
    F -- 失败 --> F2["discard_tmp"] --> X4
    F -- 成功 --> G["ResumeWriter.replace_aggregate（BEGIN IMMEDIATE，键守卫 UPDATE + 子表删建）"]
    G -- "失败/回滚" --> G2{"记录 file_path 已是新名？"}
    G2 -- 否 --> G3["删除新终态文件（补偿）"] --> X4
    G2 -- 是 --> H
    G -- 成功 --> H["best-effort 删除旧终态文件（replace_aggregate 返回的旧 file_path）"]
    H --> I["sessions.mark_update_applied（条件 pending）→ 删除会话临时文件（失败仅记日志）"]
    I --> OK["200 {resume_id, updated_at}"]
```

要点：
- **为什么先提升后提交**：见 Schema §4.1a。新旧文件永不同名，`promote` 仍"拒绝覆盖"；提交前任何失败只需删除新文件，已有记录与旧文件原样保留；提交后记录必然指向一个存在的文件，**不存在"记录先于文件"的窗口**，因此也没有提交后重命名失败的 roll-forward 场景。
- **失败补偿矩阵**（每格同时断言库与文件系统，§9.3）：

| 失败点 | 已有记录 | 文件系统 | 处理 |
|---|---|---|---|
| 校验、stage | 不变 | 无新文件 | 返回错误，会话仍 `pending` |
| promote | 不变 | 无新文件（tmp 已删） | 同上 |
| 事务（回滚） | 不变 | 新终态文件残留 | 立即删除；结果不明时先查 `file_path` 再决定删/留 |
| 进程在 promote 与事务之间崩溃 | 不变 | 新终态文件无记录 | 启动对账情形 3 删除 |
| 事务提交后、删旧文件前失败/崩溃 | 已更新（指向新文件，存在） | 旧终态文件残留 | 启动对账**陈旧旧版文件规则**删除 |
| `mark_update_applied`/删临时文件失败 | 已更新 | 会话仍 `pending`，临时文件残留 | 再次点击为幂等覆盖（内容相同）；临时文件由清扫兜底 |

- **并发**：两个会话更新同一记录由 `BEGIN IMMEDIATE` 串行，后到者读到的"旧 file_path"就是先到者的新文件，由后到者删除，不遗留。同一会话重复请求：第 1 步之后 `applied` 直接幂等返回。
- **B-04**：必须 `confirm_update === true`；对话路径无依赖；更新使用的是**会话冻结的候选**，不读取任何新的用户输入。
- 覆盖语义：候选为空的字段清空已有值；`created_at` 不变，`updated_at` 刷新；子表行重新生成。

### 5.4 启动：初始化与对账（REQ-BE-04.4；ADR-005）<!-- 变更 v2 -->

```mermaid
flowchart TD
    S["lifespan 启动"] --> A["创建 DATA_DIR / FILE_DIR / drafts 目录"]
    A --> B["init_drafts_db（user_version<2 → 事务内丢弃 v1 drafts 表并建新表，=2）；init_resumes_db（=1）"]
    B --> C["ReconcileService.run()"]
    C --> D["OrphanSweepService.run_once()（只此一次）"]
    D --> F["开始接收请求"]
```

`ReconcileService.run()` 按 Schema §4.2 处理：roll-forward tmp、删无记录 tmp、删无记录终态文件、记录缺文件仅告警；**v2.1 新增**：对"id 部分等于某记录 id、名称不等于其 `file_path`"的终态文件，当**该记录自己的终态文件存在**时判定为陈旧旧版并删除，否则保持"冲突，不猜"。实现上 `_remove_orphans` 需要 `scan.final` 的名称集合以判断"记录自己的文件存在"。零记录时终态文件保留并告警（保险丝）、先 `scan()` 再 `list_refs()`、任一读取失败整体放弃——均不变。对账仍**只在此处同步运行一次**，仅 `lifecycle.py` 引用。对账或清扫失败不阻止启动，但必须记录告警（含数量，不含内容）；建目录或初始化库失败则启动失败。

### 5.5 孤儿文件清扫（REQ-BE-05.5；ADR-008）<!-- 变更 v2：取代 v1 的"草稿清理（TTL）" -->

1. **取消**过期草稿删除与调度线程。会话不自动清理。
2. 启动时一次：`data/drafts/` 中**不被任何 `sessions.file_path` 引用**且修改时间超过 1 天的文件才删除（1 天宽限保留；引用集合 = `file_path IS NOT NULL` 的行）。v1 旧草稿文件、上传/保存/删除中途崩溃的遗留都在此处理。
3. 读取引用集合或目录失败 → 整体放弃、不删任何文件（沿用 v1）。
4. 只依赖 `SessionRepository` 与 `DraftFileStore`，**永不访问 `file/`**。

### 5.6 手动删除会话（接口 4；REQ-BE-05.6）<!-- 变更 v2 -->

1. 单个 `BEGIN IMMEDIATE` 事务：`SELECT file_path FROM sessions WHERE id=? AND browser_hash=?`（无 → 404）→ `DELETE`（`chat_messages`、`chat_suggestions` 经 FK 级联）→ COMMIT。
2. 事务后若 `file_path` 非空，删除临时文件（先库后文件；失败仅记日志，留作孤儿）。`reviewing` 会话必有文件；`saved` 会话只有 `update_state='pending'` 时才有。
3. `SessionService` 只持有 `ResumeReader`、不持有 `ArchiveFileStore`：**不访问 `resumes.db` 写接口与 `file/`**，已保存的简历记录与原始文件不受影响（测试固定：注入的读接口无写方法，`FileStore` 无归档目录）。
4. 与进行中的请求并发：对话写回/保存/更新都用条件语句，会话已删则得到 `session_not_found`，不会静默成功；保存已提交的结果不受会话删除影响。

### 5.7 归档只读查询与文件下载（接口 11–13；REQ-BE-08）<!-- 变更 v2 -->

- **列表**：`ResumeReader.list_summaries()`（`ORDER BY created_at DESC`，字段 `id, name, phone, email, job_title, created_at`），不分页。
- **详情**：`get_detail(resume_id)` 读主表、三个子表（按 `seq`）与四个 JSON 列，组装 `ResumeValues`；`file_available = ArchiveFileStore.is_available(file_path)`（终态名、普通文件、非符号链接）。无记录 → `ResumeNotFoundError`。会话详情中 `saved` 会话的 `resume` 使用同一组装函数。
- **下载**：`ArchiveQueryService.open_file(resume_id)` → 取 `file_path`（**只来自库**，URL 只带 `resume_id`）→ `ArchiveFileStore.open_final(file_path)`：名称必须匹配终态正则、`lstat` 拒绝符号链接、`O_NOFOLLOW` 打开、确认解析后的父目录等于 `file/`；`FileNotFoundError`/`ValueError` → `FileNotAvailableError`（记录存在但文件不可用；只有 tmp 时同样视为不可用，**不读 tmp**）。路由以 `StreamingResponse` 分块读取（64 KB），生成器结束时关闭文件。
- **响应头**：`Content-Type` = 库内 `content_type`（仅 pdf/jpeg/png）；`Content-Disposition: attachment; filename*=UTF-8''<percent-encoded 原文件名>`（先去除控制字符、截断 255 字符；不输出内部路径，不使用 `filename=`）；`X-Content-Type-Options: nosniff`。
- 日志：访问日志只记 `resume_id`、状态码、耗时，不记姓名/手机/邮箱/文件名（B-03）。
- 服务只监听本机（`AGENTS.md` 红线，X-09：代码层不强制，POC 接受）。

---

## §6 组件与实现设计 <!-- 变更 v2 -->

> 对外接口参数/响应/错误码见 `03_api/api_design_resume.md` 与 `openapi.yaml`，此处只引用接口编号（1 上传 2 列表 3 读取 4 删除 5 分区更新 6 消息 7 应用 8 取消 9 保存 10 确认更新 11 归档列表 12 详情 13 文件）。

| 代码单元 | 实现要点（职责边界 / 关键逻辑 / 事务 / 幂等 / 并发） | 关联接口 / 需求 |
|---------|--------------------------------------------------|---------------|
| `routes/sessions` | 1：接收 `UploadFile`，**分块**交给 `upload_validation`；multipart 解析失败或缺 `file` 一律 `file_missing`；成功后 `cookies.issue/renew`。2：无有效标识时直接返回空列表、**不签发 Cookie**。3/4/5：路径参数 `session_id` 声明为普通字符串（不做 UUID 格式校验，格式不对由 service 查不到 → 404）；4 成功返回 204 无正文。路由内无业务判断 | 1–5 / REQ-BE-01、03、05 |
| `routes/chat` | 6：请求体 `content` 由 Pydantic 校验长度，空白判断在 service；调用 `ChatService.send`，返回 201。7/8：调用 `apply/cancel`。成功追加续期 Cookie | 6–8 / REQ-BE-07 |
| `routes/session_resume` | 9：`confirmed` 缺失或为 `false` → `confirmation_required`；调用 `ResumeService.confirm()`，按结果 201/200；**不清除 Cookie**。10：`confirm_update` 同理，调用 `update_existing()`，200 | 9、10 / REQ-BE-04、09 |
| `routes/archive` | 11/12/13：无需浏览器标识；13 按 §5.7 流式返回并构造响应头（文件名编码、`nosniff`） | 11–13 / REQ-BE-08 |
| `api/deps.py` | `get_browser_id`：读 Cookie `browser_id`，格式不符/缺失 → `None`；装配对象每请求创建，无全局可变状态；`get_parser`/`get_chat_client` 懒创建同一个 `DeepSeekClient`（启动无密钥不失败） | 1–10 |
| `api/cookies.py` | 唯一构造点：`browser_id=<值>; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000[; Secure]`；签发与续期同一函数（属性一致浏览器才覆盖） | REQ-BE-05.2 |
| `api/error_handlers.py` | 校验异常映射改为按"路由模板 + 方法"判定：`POST /sessions` → `file_missing`；`POST|PUT /sessions/{id}/resume` 且缺 `confirmed`/`confirm_update` → `confirmation_required`；`PATCH .../fields` 同时报告原始 body 中的核心字段问题；`POST .../messages` 的 `content` 问题 → `validation_failed`、`details.field=content`；其余 `issues_from_pydantic`。**永远丢弃 `input`** | REQ-BE-06.3/06.4 |
| `upload_validation` | 顺序见 §1；大小超限立即中止读取；扩展名与魔数判型不一致 → `file_content_mismatch`；扩展名不在白名单 → `unsupported_file_type`；输出的 `content_type` 仅取自魔数；原文件名截断到 255 字符且仅用于展示 | ① / REQ-BE-01.1–01.4 |
| `DeepSeekClient`（解析） | 构造请求（**模型名锁定**：`Settings.deepseek_model` 类型为 `Literal["deepseek-flash"]`，请求体 `model` 固定取常量；**外发地址锁定**：`DEEPSEEK_BASE_URL` 只允许 `https://api.deepseek.com`（可带简单路径前缀），构造时再校验一次；`POST {base}/chat/completions`，`response_format=json_object`、`max_tokens=8192`、非流式；照片以 `image_url` + base64 data URI 内联，PDF 先经 `render_pdf` 转换）；记录 `usage` token 数；`httpx` 异常与状态映射见 §7；**不重试**；响应体不进日志；返回 `RawParseResult` | 1 / REQ-BE-02.1/02.4/02.5、06.2 |
| `DeepSeekClient.chat` <!-- 变更 v2 --> | 同一 `httpx.Client` 与锁定校验；先检查密钥（缺失 → `ChatFailedError`，不抛 500）；请求体 = 对话系统提示 + 单条 user 消息（三个分隔段）；`response_format=json_object`、`max_tokens=4096`、非流式；体积预算见 §5.2a；响应经 `_parse_content` 取 JSON 对象后交给 `ChatService` 做结构校验；**任何**失败（超时、传输错误、4xx/5xx、非 JSON）统一抛 `ChatFailedError` 并记录 `status_code`/`code`/耗时/token 数；请求体、响应体、对话内容不进日志；不重试 | 6 / REQ-BE-07.1/07.2 |
| `pdf_renderer` | 用 `pypdfium2` 处理 PDF，**最多前 5 页**，超出部分忽略（对应字段照常标 `missing`/`uncertain`，不新增错误码、不改 OpenAPI）。逐页取文本层：**非空白字符 ≥ 50** 的页面作为 `text` 块发送（电子版 PDF 字符准确、token 低，单页文本上限 6000 字符）；否则渲染为 PNG（长边 1600px，约 140 DPI）作为 `image_url` data URI 发送，与照片同一路径。无法打开/加密/无页的 PDF → `parse_failed`（不调用模型）。**总耗时上限 20 秒**（含等待 PDFium 锁、文本提取与渲染），在页与页之间检查，超时按 `parse_failed` 处理、不调用模型；该上限为协作式，已在执行的单页操作无法中断。文档文本中的提示词起止标记会被清除。PDFium 非线程安全，模块级锁串行化。spike 精度与 token 数据见 `05_task/changelog.md` 任务 1.8 | ① / REQ-BE-02.1 |
| `prompts` <!-- 变更 v2 --> | 解析提示词不变（文档由 `<<<RESUME_DOCUMENT_BEGIN/END>>>` 包裹）。新增对话提示词与三组标记：`RESUME_FIELDS`、`CHAT_HISTORY`、`USER_MESSAGE`；`neutralize_markers` 对全部六个标记做替换；对话系统提示的内容要求见 §5.2a-1；提示词与标记集中在此文件，修改需同步 `suggestion_validation` 的字段白名单（模块加载时断言白名单 ⊆ `ResumeFields.model_fields`） | 1、6 / REQ-BE-02.2/02.3、07.10 |
| `ParseNormalizer` | ① JSON 对象校验 → ② 逐键用 Pydantic 校验 → ③ 状态归一（模型的 `confirmed` 或未知状态 → `uncertain`；空值 → `missing`）→ ④ 长度/条数截断并降为 `uncertain` → ⑤ 补齐缺失键为 `missing`；输出恒为完整 22 键；整体不是对象或全部字段不可用 → `ParseFailedError` | ① / REQ-BE-02.2/02.3 |
| `field_validation` | 输入：字段更新或会话当前值。规则：手机号去空格/连字符后匹配 `^1\d{10}$` 或 `^\+\d{6,15}$`；邮箱 `^[^@\s]+@[^@\s]+\.[^@\s]+$`；核心三项去首尾空白后非空；长度上限（§1）；未知字段 `unknown_field`。**收集全部问题**一次性返回，只含字段路径与 reason，不含值。分区更新、建议校验、保存、确认更新**共用** | 5、6、9、10 / REQ-BE-03.4、04.2 |
| `identity_key` | `name_key`/`phone_key`/`email_key` 规范化（同 v1）；**唯一实现点**，确认保存、确认更新、对账、"出现在用户消息中"的比对都复用 | 9、10、6 / REQ-BE-04.5、07.5 |
| `suggestion_validation` <!-- 变更 v2 --> | 纯函数 `validate_suggestions(candidates, current_fields, user_message) -> list[SuggestionDraft]`：按 §1 管线五步；不访问存储、不记日志；`SuggestionDraft` = (field, new_value, applicable, reason)；候选来源是 `ChatModelOutput` 已宽松解析后的项 | 6 / REQ-BE-07.3/07.4/07.5 |
| `field_merge` <!-- 变更 v2 --> | `merge_update(fields, update)`：出现的键 → 值替换并置 `confirmed`（空白列表项/空条目清理、标量空串视为确认留空，同 v1）；PATCH 与"应用建议"唯一的字段写入逻辑 | 5、7 / REQ-BE-03.2、07.7 |
| `SessionService` <!-- 变更 v2 --> | `create()`：§5.1。`list()`：按 `browser_hash` 取全部会话，名称读取时计算（`reviewing` 取 `fields_json` 中姓名；`saved` 用 `ResumeReader.get_names` 批量取；缺失记录按"未命名简历"并记告警）。`get()`：`reviewing` 返回字段（值+状态）；`saved` 返回 `resume`（`get_detail`，与归档同一组装）；`pending` 另返回候选；附全部消息与建议；**不刷新活动时间**。`update_fields()`：§5.2。`delete()`：§5.6。任何"找不到/不属于"统一抛 `SessionNotFoundError` | 1–5 / REQ-BE-01、02、03、05 |
| `ChatService` <!-- 变更 v2 --> | `send()`：§5.2a；`apply()/cancel()`：§5.2b。依赖：`SessionRepository`、`ChatRepository`、`ResumeChatClient`、`Clock`、`IdGenerator`；**不依赖任何保存/归档组件**。限额常量取自 `schemas/limits.py` | 6–8 / REQ-BE-07 |
| `ResumeService` <!-- 变更 v2 / v2.1 --> | `confirm()`：§5.3（顺序 查重 → stage → create_aggregate → promote → `mark_saved`；重复分支 `mark_candidate_pending`）；`update_existing()`：§5.3a。持有全部补偿逻辑；`ResumeWriter` 与 `ArchiveFileStore` 只在这里被调用 | 9、10 / REQ-BE-04、09 |
| `ArchiveQueryService` <!-- 变更 v2 --> | 列表/详情/`open_file`，见 §5.7；只依赖 `ResumeReader` 与 `ArchiveFileStore` 的只读方法 | 11–13 / REQ-BE-08 |
| `SessionRepository` <!-- 变更 v2 --> | 仅 SQL；**所有按 id 的方法都带 `browser_hash`**；`transaction()` 返回事务内读写句柄；条件更新方法（`mark_saved`、`mark_candidate_pending`、`mark_update_applied`）返回 `rowcount==1` 布尔值，由 service 决定后续；**不做**业务判断 | 1–10 / REQ-BE-05 |
| `ChatRepository` <!-- 变更 v2 --> | 同事务内 `seq=max+1` 插入消息；建议批量插入；`mark_suggestions` 条件 `pending AND applicable=1`；`recent_messages` 按 `seq` 倒序限 N | 6–8 / REQ-BE-07 |
| `ResumeRepository` <!-- 变更 v2.1 --> | `create_aggregate()` 不变；新增 `replace_aggregate()`：单个 `BEGIN IMMEDIATE`，先读旧 `file_path`，`UPDATE resumes … WHERE id=? AND name_key=? AND phone_key=? AND email_key=?`（`rowcount!=1` → 回滚并抛冲突），删三张子表行并重新插入（子行时间取本次更新时间），返回旧 `file_path`；`IntegrityError` 仍只在涉及 `uq_resumes_identity` 时转 `DuplicateIdentityError`；读方法 `list_summaries/get_detail/get_names` 全部参数绑定 | 9–12 / REQ-BE-04、08、09 |
| `DraftFileStore` | 路径 = `DATA_DIR/drafts/{session_id}{ext}`；`ext` 只来自魔数判型结果；读取路径时校验解析后仍在 `drafts` 目录内并拒绝符号链接 | 1、9、10 / REQ-BE-01.3 |
| `ArchiveFileStore` <!-- 变更 v2 --> | `stage()` / `promote()` / `discard_tmp()` / `remove()` / `scan()` 不变；更新用 `{resume_id}-{suffix8}` 作 `resume_id` 参数（满足 `_ID_RE`）；新增只读 `open_final(file_path)`、`is_available(file_path)`；tmp 与终态文件**同目录同卷**以保证 `os.replace` 原子 | 9、10、13 / REQ-BE-04.3/04.4、08.3、09.4 |
| `OrphanSweepService` / `ReconcileService` <!-- 变更 v2 --> | 见 §5.4/§5.5；只依赖 Repository 与 FileStore；可注入 `Clock` | REQ-BE-04.4、05.5 |
| `core/errors.py` | `AppError` 子类与 §7 一一对应；文案集中、固定；`details` 仅 `ValidationFailedError` 可带 | 全部 / REQ-BE-06.3/06.4 |
| `core/logging.py` | `log_event(event, **safe)`：参数名在白名单内才记录，否则抛错（测试期暴露误用）；异常只记类名与栈帧（不记消息，见 §7） | REQ-BE-06.3 |
| `core/lifecycle.py` <!-- 变更 v2 --> | §5.4；无线程；`start()` 依次 `prepare_directories → init_databases → reconcile → sweep_orphans`，每步可被测试替换 | REQ-BE-04.4、05.5 |

**并发与资源**：约 5 并发请求 × 10 MB 文件在内存中最多约 50 MB；对话请求占用一个工作线程至多 60 秒（线程池默认容量足够 5 人并发）；SQLite 写者串行（`BEGIN IMMEDIATE` + `busy_timeout`），读者不阻塞；**模型等待期间不持有任何连接**（§1）。

**安全实现要点**：
- 浏览器标识 `secrets.token_urlsafe(32)`，库内只存 SHA-256；日志不记录标识与哈希。
- 所有 SQL 参数绑定（含 `IN (?, ?, …)` 用占位符生成）；文件名一律服务端生成；`original_filename` 仅作展示字段。
- 简历内容只通过 `DeepSeekClient` 外发（B-02）；对话只发结构化字段，不发原文件与文件名；密钥来自环境变量（B-01）；`.env`、`data/`、`file/` 在 `.gitignore`。

---

## §7 错误处理设计 <!-- 变更 v2 -->

> 业务码清单与 HTTP 状态见 `03_api/api_design_resume.md` §五，此处只写异常分类与处理策略。

### 7.1 异常分类与映射

| 异常（`core/errors.py`） | 业务码 | HTTP | 产生位置 |
|---|---|---|---|
| `FileMissingError` | `file_missing` | 400 | 路由/`upload_validation` |
| `FileEmptyError` | `file_empty` | 400 | `upload_validation` |
| `FileContentMismatchError` | `file_content_mismatch` | 400 | `upload_validation` |
| `FileTooLargeError` | `file_too_large` | 413 | `upload_validation` |
| `UnsupportedFileTypeError` | `unsupported_file_type` | 415 | `upload_validation` |
| `ParseFailedError` | `parse_failed` | 502 | `DeepSeekClient.parse`、`ParseNormalizer` |
| `ParseUnavailableError` | `parse_unavailable` | 503 | `DeepSeekClient.parse` |
| `ParseTimeoutError` | `parse_timeout` | 504 | `DeepSeekClient.parse` |
| `SessionNotFoundError`（取代 `DraftNotFoundError`） | `session_not_found` | 404 | `SessionService`、`ChatService`、`ResumeService`（不存在与不属于不区分） |
| `SessionReadOnlyError` | `session_read_only` | 409 | `SessionService.update_fields`、`ChatService`、`ResumeService.confirm` |
| `ValidationFailedError` | `validation_failed` | 422 | `field_validation` / 请求体校验 |
| `ConfirmationRequiredError` | `confirmation_required` | 422 | 路由（`confirmed`/`confirm_update`） |
| `ChatFailedError` | `chat_failed` | 502 | `DeepSeekClient.chat`、`ChatService`（结构不合法） |
| `SuggestionUnavailableError` | `suggestion_unavailable` | 409 | `ChatService.apply/cancel` |
| `UpdateNotAvailableError` | `update_not_available` | 409 | `ResumeService.update_existing` |
| `ResumeNotFoundError` | `resume_not_found` | 404 | `ArchiveQueryService` |
| `FileNotAvailableError` | `file_not_available` | 404 | `ArchiveQueryService.open_file` |
| `SaveFailedError` | `save_failed` | 500 | `ResumeService`（首次保存与更新共用） |
| （其他任何未捕获异常） | `internal_error` | 500 | 兜底处理器 |

### 7.2 `DeepSeekClient` 的外部失败映射

解析（`parse`）映射不变：

| 外部情形 | 业务码 | 说明 |
|---|---|---|
| `httpx.TimeoutException`（含读超时 60 秒） | `parse_timeout` | C-08 |
| 连接失败/DNS 失败/`ConnectError` | `parse_unavailable` | 服务不可达 |
| HTTP 401 / 403 / 404（模型或凭证无效） | `parse_unavailable` | 能力/授权/凭证不可用，ADR-001：阻断且不回退 |
| HTTP 429 / 5xx | `parse_unavailable` | 暂时不可用，提示稍后重试 |
| HTTP 402（余额不足） | `parse_unavailable` | 服务不可用而非文件问题 |
| 其他 HTTP 4xx（400/413/422 等，模型拒绝该输入） | `parse_failed` | 请换文件重传 |
| 响应体为空、不是合法 JSON、不是对象 | `parse_failed` | 整体不可解析 |
| PDF 处理超过 20 秒 / 无法打开 | `parse_failed` | 在本地转换阶段失败，不调用模型 |
| 配置缺失（无 `DEEPSEEK_API_KEY`） | `parse_unavailable` | 启动不阻止，首次调用时阻断；日志只记"凭证未配置" |

对话（`chat`）<!-- 变更 v2 -->：**上述任何外部失败，以及请求体超预算、响应非 JSON 对象、`reply` 缺失/为空，一律 → `chat_failed`（502）**，不再细分；日志里 `status_code`、`code`、耗时仍可区分原因。理由：对话失败对用户只有一种处理（稍后重试，已有信息不受影响），且 API 只定义一个对话失败码。以上映射是实现层的设计选择，已列入需 DL 确认的点。

### 7.3 处理策略

- **统一出口**：`error_handlers` 把 `AppError` 转为 `{code, message, request_id[, details]}`；FastAPI/Pydantic 的请求校验异常转为 `validation_failed`（`loc` → `details[].field`，`type` → `reason`；**永远丢弃 `input`**）；例外见 §6 `error_handlers`。
- **兜底**：未知异常记录异常类型与栈帧（栈中不含用户数据；异常 `str()` 不入日志），响应 `internal_error` 与固定文案。
- **不吞异常**：repository/service 捕获异常后要么转换为 `AppError`（保留 `__cause__`），要么补偿后重新抛出；禁止裸 `except`。
- **补偿异常的分层**：补偿动作本身失败（如 `discard_tmp`、删旧文件失败）只记日志，不覆盖原始异常。
- **日志脱敏**：只记白名单字段；对话内容、模型回复、建议值、浏览器标识、文件名、模型原始响应一律不记（B-03）。

---

## §8 设计追溯矩阵 <!-- 变更 v2 -->

> 覆盖 `requirements.md`（v2.0）全部 AC。设计产物简称：S=`02_schema`，A=`03_api`，D=本文。REQ-BE-01..06 中未受 v2 影响的 AC 与 v1 相同，仅列出受影响或新增者之外的合并行。

| 需求 / AC | 设计产物 |
|---|---|
| REQ-BE-01.1–01.4 接收、拒绝、命名、单文件 | A接口1；D§5.1、§6 `upload_validation`；S§2.1 `file_path` |
| REQ-BE-01.5 创建会话并签发标识 | A接口1；D§5.1、§1“浏览器标识的解析”；S§2.1 |
| REQ-BE-01.6 不动其他会话；失败不建会话 | D§5.1（无 `_delete_previous`）；A§3.1 |
| REQ-BE-02.1–02.6 解析链路 | D§1、§6 `DeepSeekClient`/`ParseNormalizer`、§7.2；ADR-001/002 |
| REQ-BE-03.1 按会话读取 + 归属 | A接口3；D§5.6、§6 `SessionService`、§1“会话归属校验的唯一入口” |
| REQ-BE-03.2–03.4 更新、多条子项、字段级错误 | A接口5；D§5.2、§6 `field_validation`/`field_merge` |
| REQ-BE-03.5 活动时间规则 | S§2.1；D§5.2/§5.2a/§5.2b/§5.3/§5.3a 写路径刷新，读取不刷新（§6 `SessionService.get`） |
| REQ-BE-03.6 `saved` 拒绝修改 | D§5.2 |
| REQ-BE-04.1–04.5 确认、校验、顺序、补偿、幂等键 | A接口9；D§5.3；S§4.1；ADR-004/005 |
| REQ-BE-04.6 命中幂等键保留更新候选 | D§5.3（重复分支）；S§4.3 |
| REQ-BE-04.7 首次保存后会话保留、不清 Cookie | D§5.3（`mark_saved`）；A§3.8 |
| REQ-BE-04.8 会话不存在/已保存拒绝 | D§5.3、§7.1 |
| REQ-BE-04.9 无直接修改/删除接口 | A§一；D§5.3a（唯一覆盖入口） |
| REQ-BE-05.1 独立草稿库 | S§2.1、§五 |
| REQ-BE-05.2 浏览器标识 Cookie | A§二；D§1、§6 `cookies`/`deps` |
| REQ-BE-05.3 会话列表 | A接口2；D§6 `SessionService.list` |
| REQ-BE-05.4 读取会话（含候选、对话） | A接口3；D§6 `SessionService.get` |
| REQ-BE-05.5 不自动清理，启动只清扫孤儿 | S§4.4；D§1“无定时清理”、§5.4、§5.5 |
| REQ-BE-05.6 手动删除两种情形，204 | A接口4；D§5.6 |
| REQ-BE-05.7 不存在与不属于同码 | D§1“归属校验的唯一入口”、§7.1 |
| REQ-BE-06.1–06.2 密钥、外发出口 | D§2、§6 安全要点 |
| REQ-BE-06.3 日志/错误脱敏（含对话、建议、标识） | D§1“日志策略”、§7.3；§9.4 |
| REQ-BE-06.4–06.6 前缀/错误体/OpenAPI 先行/合成数据 | A§二；`openapi.yaml` 0.2.0；D§9 |
| REQ-BE-07.1 对话仅经 clients、只发结构化字段 | D§1“对话请求体”、§5.2a、§6 `DeepSeekClient.chat` |
| REQ-BE-07.2 固定结构解析；失败不落库 | D§1“对话输出的信任边界”“对话失败不落库”、§5.2a、§7.2 |
| REQ-BE-07.3 字段白名单；经历字段丢弃 | D§1“建议校验管线”、§6 `suggestion_validation` |
| REQ-BE-07.4 字段规则校验；不可应用带原因 | D§1 管线⑤；S§2.1.2 |
| REQ-BE-07.5 三项必填须出现在用户消息；同值丢弃 | D§1“出现在用户消息中的比对”、管线③④ |
| REQ-BE-07.6 事务写回；原值读取时取当前值 | D§5.2a（5）；S§2.1.2 |
| REQ-BE-07.7 应用/取消 | D§5.2b、§1“应用/取消复用分区更新路径” |
| REQ-BE-07.8 对话无保存动作 | D§2（依赖图）、§5.2a-6、§6 `ChatService` |
| REQ-BE-07.9 `saved` 拒绝对话 | D§5.2a |
| REQ-BE-07.10 提示词范围与分隔消毒 | D§1“提示词分隔与消毒”、§5.2a-1、§6 `prompts` |
| REQ-BE-08.1–08.2 归档列表、详情 | A接口11–12；D§5.7 |
| REQ-BE-08.3 文件下载路径校验 | A接口13；D§5.7、§6 `ArchiveFileStore` |
| REQ-BE-08.4 无修改/删除；仅监听本机 | A§一；D§5.7 |
| REQ-BE-09.1 候选展示 | A接口3；D§6 `SessionService.get`；S§2.1（`pending` 冻结） |
| REQ-BE-09.2 显式确认值 | A接口10；D§5.3a |
| REQ-BE-09.3 校验并覆盖 | D§5.3a；S§2.2.3 |
| REQ-BE-09.4 顺序、补偿、对账 | D§5.3a、§5.4；S§4.1a、§4.2；ADR-005 v2.1 |
| REQ-BE-09.5 成功返回与幂等 | D§5.3a |
| REQ-BE-09.6 对话不触发更新 | D§2、§5.2a-6、§5.3a |

覆盖结论：REQ-BE-01..09 全部 AC（含 v2 新增 REQ-BE-07..09）均有设计产物，无遗漏。

---

## §9 测试策略 <!-- 变更 v2 -->

> 框架 pytest（C-15）。本项目为 POC（整体 L2）：**红线点按 L3 深度**做故障注入/确定性测试，其余只写主路径与主要异常路径。具体测试数、测试代码与业务代码比例（POC ≈ 1:1）、审查批次在 Step 4「测试预算」确定，本节不定数。覆盖率与 CRAP 在实现完成后实测，不在设计阶段声明已达标。v1 契约/接口类用例随 OpenAPI 0.2.0 整体替换（O2-05，清单见 `00_impact_analysis.md` §七、§11.5），复用 v1 中仍成立的夹具与断言。

### 9.1 通用约束（不变）

| 项 | 约定 |
|---|---|
| 模型调用 mock | `services` 与 `api` 测试一律注入 `FakeParserClient`/`FakeChatClient`（返回预置结果或抛指定错误）；`DeepSeekClient` 自身测试用 `httpx.MockTransport` |
| 禁止真实外发 | autouse 夹具封禁 `socket.connect`（B-06）；真实对话/解析只在手工 spike 与自测演练中使用，不进自动化 |
| 合成数据 | 简历内容全部合成，姓名等使用可检索标记；二进制样本用最小合法头部字节生成 |
| 临时目录 | 每个用例独立的 `DATA_DIR`/`FILE_DIR`；`FakeClock` 控制时间 |
| 数据层断言 | 红线用例同时断言 SQLite（`SELECT count(*)`、关键列）与文件系统（存在性、数量），不只看接口返回码 |

### 9.2 主路径与主要异常路径（不展开）

| 层级 | 场景 |
|---|---|
| 服务/接口 | 上传创建会话（不影响其他会话）；列表倒序、无标识空列表；读取三种形态（`reviewing`/`saved`/`pending`）；分区更新；删除两种情形（204、重复 404）；保存 201/200；确认更新 200（含幂等重复）；对话成功/失败；应用/取消/重复；归档列表/详情/下载（含文件缺失 404） |
| 仓储 | `sessions` 条件更新（rowcount 语义）；`chat_*` 级联删除；`replace_aggregate` 键守卫与子表重建；`list_summaries/get_detail` |
| 客户端 | `DeepSeekClient.chat` 的 MockTransport 映射（任何失败 → `ChatFailedError`）、请求体不含文件/文件名、体积预算与历史丢弃 |
| 启动 | 顺序 `dirs → init → reconcile → sweep`；`drafts.db` v1 → v2 升级（旧表被丢弃、新表在、版本 2、`resumes.db` 版本 1 不变）；无线程残留 |
| 契约 | 以冻结的 `openapi.yaml` 0.2.0 校验各响应；路径/方法/operationId/状态码集合一致；错误码枚举与 `ErrorCode` 一致 |

### 9.3 B-05：故障注入与确定性测试（HIGH_RISK，必须覆盖）

沿用 v1 的可注入故障方式（仅测试装配，生产代码零分支；模拟崩溃 = 抛 `SimulatedCrash` 后直接运行 `ReconcileService`）。**首次保存**的 9 个注入点与 v1 相同（stage 失败、事务内失败、并发同键、提交后重命名前崩溃、重命名失败、提交前崩溃、无记录终态文件、无文件无 tmp 的记录、收尾失败），其中"收尾（删草稿）失败"改为"`mark_saved`/删临时文件失败"。**v2/v2.1 新增**：

| 注入点 | 期望结果（同时断言库与文件系统） |
|---|---|
| 更新：stage 失败 | 无新文件；记录与旧文件不变；会话仍 `pending`；`save_failed` |
| 更新：promote 失败 | tmp 已删；记录不变；`save_failed` |
| 更新：事务回滚 | 记录与子表原样；新终态文件被删除；旧文件仍在 |
| 更新：事务结果不明（提交成功但连接报错） | 按记录 `file_path` 判定为已提交，保留新文件，不删 |
| 更新：promote 之后、事务之前崩溃 | 记录与旧文件不变；对账删除无记录的新终态文件 |
| 更新：提交后、删旧文件前崩溃 | 记录指向存在的新文件；对账（陈旧旧版规则）删除旧文件；`reconcile_conflicts` 为 0 |
| 对账陈旧旧版规则的安全边界 | 记录自己的终态文件**不存在**时，同 id 的旧版文件保留并计冲突（不删唯一一份数据）；零记录保险丝不受影响 |
| 更新：新旧扩展名相同 / 不同 | 两种都成功，`file_path` 与 `content_type` 同步改变，下载读新文件 |
| 更新：并发两会话 | 两次都成功，最终记录指向后到者的文件，`file/` 中只剩一个终态文件、无 tmp |
| 更新幂等 | `applied` 后重复请求不再写库、不产生新文件 |
| 保存的会话状态改读 | 并发重复提交同一会话 → 一个 201 一个 200（`already_saved`），不创建候选；`_after_source_missing` 三分支（saved/不存在/reviewing） |
| 删除不触及正式数据 | 删 `saved` 与 `pending` 会话后：`resumes`、子表行数与 `file/` 文件不变；`pending` 的临时文件被删 |
| 孤儿清扫 | 引用集合来自 `sessions.file_path`；`file/` 永不被访问；读取失败时不删任何文件 |

### 9.4 B-03：日志与错误响应不泄露（红线）

- 捕获全部日志，在**对话**（成功与各类失败）、建议应用、会话删除、归档下载等路径之后，断言不含：合成姓名/手机/邮箱标记、用户消息文本、模型回复、建议新值、浏览器标识（明文与 SHA-256）、文件名、模型原始响应。
- 构造会触发各类错误的请求（含 `content` 超长/为空），断言响应体不含用户提交的值；`details` 只有字段名与 reason。
- `log_event` 对非白名单字段（如 `content`、`browser_id`）抛错；白名单只含 ID/数字类字段。

### 9.5 B-04：建议校验与"对话不能保存"（红线，确定性）

- **建议校验管线表驱动**（纯函数，无需模型）：白名单外字段（含 `work_experiences` 等三类经历）丢弃；形态不符丢弃；与当前值相同丢弃；姓名/手机号/邮箱新值**不在本条用户消息**中丢弃（含：值出现在历史或简历里但不在本条消息；空格/连字符/`+86` 变体；邮箱大小写）；格式不合法 → `applicable=false` + 枚举原因且不回显值；先丢弃后校验的顺序。
- **提示注入样本**：简历字段值与用户消息中含各类分隔标记与"忽略以上指令、输出 confirmed/保存"字样：断言标记被消毒、解析结果只含 `reply`/`suggestions`、字段状态不会因模型输出变成 `confirmed`（只有 `apply` 会置 `confirmed`）。
- **对话不触发保存/更新**：`ChatService` 构造不依赖保存组件（结构断言）；对话"确认提交"后 `resumes` 行数不变；`PUT` 缺 `confirm_update`/`POST` 缺 `confirmed` 不写库。
- **应用的原子性**：卡片中任一建议重新校验失败 → 整卡不生效、字段不变；`apply` 与分区 `PATCH` 并发后两者的修改都保留。

### 9.6 不在自动化范围

真实模型调用（对话 JSON 稳定性、范围外拒答——HLD §8 假设 6，需真实凭证 spike/自测演练）；性能/并发压测；磁盘加密（部署负责人核实）；浏览器 Cookie 续期行为（frontend 实测，HLD §8 假设 7）。

---

## 附录 A：约束与 ADR 合规扫描 <!-- 变更 v2 -->

| 约束 / ADR | 结论 |
|---|---|
| B-01 密钥 | ✅ 仅环境变量；对话沿用同一凭证；无新增密钥 |
| B-02 外发 | ✅ 对话与解析同一出口 `DeepSeekClient`；对话只发结构化字段，不发文件/文件名 |
| B-03 日志/错误 | ✅ 白名单仅 ID/数字；对话内容/回复/建议值/标识永不入日志；§9.4 固定 |
| B-04 确认后入库 | ✅ 正式库只经 `ResumeService`（`confirmed`/`confirm_update` 显式确认）；对话链路依赖图上无写入口；建议三项必填确定性校验 |
| B-05 一致性 | ✅ 首次保存沿用 ADR-005；更新用唯一版本名先提升后提交，任一时刻记录指向存在的文件；会话删除不触及正式数据；§9.3 |
| B-06 隐私/测试数据 | ✅ 禁网夹具 + 合成数据；模型全 mock |
| 分层红线 | ✅ services 不依赖 `sqlite3`/`httpx`；api 无业务判断；repositories/clients 无业务判断；归属校验在 repository 签名层 |
| 跨 Workbench 约束 | ✅ 契约以冻结的 OpenAPI 0.2.0 为准，本设计未改契约 |
| ADR-001/002 | ✅ 解析链路不变；对话同步 |
| ADR-003（v2 修订） | ✅ 草稿库分离、确认后才入正式库保留；7 天清理与单令牌被 ADR-008 替代 |
| ADR-004（v2.1 修订） | ✅ 命中幂等键保留更新候选；显式确认更新覆盖 |
| ADR-005（v2.1 修订） | ✅ 更新用唯一版本名；对账增加陈旧旧版规则（§5.4） |
| ADR-007 | ✅ 建议 + 用户应用；确定性校验；提示词分隔与消毒；对话内容不入日志；不发原文件 |
| ADR-008 | ✅ 浏览器标识归属、永久保存、手动删除两种情形、取消 TTL、归属校验、旧 `draft_token` 不兼容 |
| ADR-009 | ✅ 只读列表/详情/下载；路径校验；安全响应头；仅监听本机（代码不强制，X-09） |

## 附录 B：契约变更申请 <!-- 变更 v2 -->

v1 的 CR-01（长度上限）已落地 0.1.1，并延续到 0.2.0。**v2 技术设计未发现必须修改冻结契约（OpenAPI 0.2.0、Schema v0.2.0）的点。**

## 附录 C：Step 5（仓库约定补全）备忘 <!-- 变更 v2 -->

`AGENTS.md`（8a 更新）需同步：目录结构（新增文件，§3）；环境变量表删除 `DRAFT_TTL_DAYS`、`CLEANUP_INTERVAL_SECONDS`；启动顺序（§5.4，无调度线程）；运行形态（无后台线程）；接口与数据约定（Cookie `browser_id`、会话命名、19 个错误码）；日志白名单（`session_id`、`message_id`，去掉 `draft_id`）；红线（"7 天无活动后清理"、"用户删除功能不属于 HR_PR-1"、"正式记录创建后不修改"等已失效，改为"仅经显式确认更新覆盖"）；"对外监听前必须先补访问控制"（X-09）；对账运维处置表增加陈旧旧版文件的说明；`scripts/self_test_live.py` 依赖 `draft_token` 与清理日志，随任务更新。

## 附录 D：ADR 扫描（draft-adr）<!-- 变更 v2 -->

> 汇总 `02_schema` §五、`03_api` §六、本文 §1 三张决策表。门槛（满足任一且无已有 ADR 覆盖才起草）：影响其他 Workbench 或跨 Workbench 契约；难以回退；引入新技术/组件/中间件；偏离架构约束、已有 ADR 或团队惯例。

### D.1 已起草（PROPOSED，待本关卡一次性确认）

**v2 无新起草。** v1 的 ADR-004、ADR-005 已 ACCEPTED，v2/v2.1 修订已由主 agent 写入（ADR-005 v2.1 修订见 `1043564`，ADR-004 修订见其状态记录）。

### D.2 评估后未起草

| 候选 | 结论与理由 |
|---|---|
| 会话模型、浏览器标识、取消 TTL、手动删除、`drafts.db` 升级方式 | **已有 ADR 覆盖**：ADR-008（会话归属与永久保存）；v1 旧草稿不迁移是 DL 决定（`.kiro/decisions`），丢弃 `drafts` 表属其执行细节 |
| 对话编排、输出解析、建议校验管线、提示词分隔与消毒、应用/取消 | **已有 ADR 覆盖**：ADR-007 的决策与跟进项 1–6 逐项落实；"快照 → 释放连接 → 写回"是实现策略，未偏离既有决策、可随时调整 |
| 更新路径：唯一版本名、先提升后提交、对账陈旧旧版规则 | **已有 ADR 覆盖**：ADR-005 v2.1 修订（主 agent 已写）；本设计只落实实现，不重复起草 |
| 确认更新的覆盖语义与候选冻结 | **已有 ADR 覆盖**：ADR-004 v2.1 修订 |
| 归档只读、下载路径校验与响应头 | **已有 ADR 覆盖**：ADR-009 跟进项 1–4 |
| `ResumeReader`/`ResumeWriter` 读写分离、归属校验放 repository 签名 | 未达门槛：backend 内部分层手段，不影响其他 Workbench，可随时重构 |
| `ChatService` 不依赖保存组件 | 未达门槛：落实 B-04/ADR-007 的结构性约束，无新技术、不偏离既有决策 |
| 对话失败统一 `chat_failed` | 未达门槛：契约已冻结（OpenAPI 0.2.0 单码），实现映射可调整 |
| 按库维护 schema 版本 | 未达门槛：内部实现，已记入 Schema §五 |
| v1 的各项（标准库 `sqlite3`、令牌哈希、同步端点、模型输出信任边界等） | 与 v1 附录 D.2 结论相同，不变 |
