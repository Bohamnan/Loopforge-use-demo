# 开发自测用例 — 简历信息收集（backend Workbench，HR_PR-1）

> **模式：开发自测（白盒）**
> 每条用例含接口断言与 SQLite / 文件目录数据验证。v2 用例按执行方式记录结果：**引用单测**（引用已有自动化测试，本次全量 pytest 976 passed）、**实测**（真实 uvicorn + 真实 deepseek-flash 演练，合成样品）、**静态**（契约比对或结构检查）、**跟踪**（无自动化引用，已登记）。v1 的 `tests/selftest/` 已按 DL 2026-11-11 决定删除，v1 用例的自动化引用全部改指向现存测试。

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本：123 条用例，已执行并回填结果 | Yin Yang（backend） |
| v2.0 | 2026-11-11 | 增量更新（HR_PR-1 v2：REQ-BE-01..09、OpenAPI 0.2.0、design v0.4）。接口①–④改为会话接口；保留与 v2 无关的用例；删除 7 天 TTL / 定时清理相关用例；新增对话（§9）、会话列表与删除（§10）、归档只读（§11）、确认更新（§12）、红线 B-01..B-06 与会话归属（§13）；§8 改为合成样品真实演练。每条用例的 v2 变更标记见"v2 变更"列，删除项见文末"变更对照" | Yin Yang（backend） |

## 文档信息

| 项目 | 内容 |
|------|------|
| 需求文档 | `backend-docs/HR_PR-1/01_requirements/requirements.md`（v2.0；REQ-BE-01 ~ 09，共 60 条 AC） |
| PRD | `01-requirements/HR_PR-1/prd.md`（v2 / v2.1） |
| Workbench 设计文档 | `backend-docs/HR_PR-1/03_api/openapi.yaml`（**0.2.0，冻结**）、`03_api/api_design_resume.md`、`04_design/design.md`（v0.4）、`02_schema/sql_ddl_resume.md`（v0.2.0） |
| 测试范围 | 13 个接口（会话 / 对话 / 确认保存 / 确认更新 / 归档）、启动对账与孤儿清扫、模型调用（解析与对话，含 1 MB 预算、B-01..B-06）、会话归属、真实进程演练 |
| 测试环境 | 本机 dev；pytest 使用独立临时 DATA_DIR/FILE_DIR、`FakeClock`、`httpx.MockTransport` 与禁网夹具；第 8 节为真实 uvicorn（127.0.0.1:8000，单 worker）+ 真实 deepseek-flash，样品为脚本内生成的合成简历 |

## 用例编号规则

`TC-RES-{单元}-{场景}-{序号}`。单元：001 接口①（上传建会话）、002 接口②（读取会话）、003 接口③（分区更新）、004 接口④（确认保存）、005 启动对账、006 孤儿清扫、007 模型调用（解析与对话）、008 真实进程与真实模型、009 对话、010 会话列表与删除、011 归档只读、012 确认更新、013 红线与会话归属。场景：HP 正向 / PV 校验 / BL 业务逻辑 / EH 错误处理 / DB 数据边界 / SE 安全性 / CH 真实对话（仅第 8 节）。

## 数据源与执行方式

| 数据源 | 说明 |
|---|---|
| SQLite | `drafts.db`（sessions、chat_messages、chat_suggestions；`user_version=2`）、`resumes.db`（resumes、resume_work_experiences、resume_project_experiences、resume_educations；`user_version=1`）。测试中直接用 sqlite3 查询 |
| 原始文件目录 | `file/`（正式归档）与 `data/drafts/`（会话临时文件与更新候选）。只用合成占位文件；第 8 节样品为脚本内生成的合成简历，不读取任何真实简历 |
| 对外调用 | 第 1~7、9、12 节一律 mock（禁网夹具 `tests/conftest.py::_forbid_network` 生效，B-06）；第 8 节真实调用 deepseek-flash（DL 授权，仅此一步） |
| 自动化引用 | 引用 `codes/hr-collection-agent-backend/tests/` 下现存测试（文件::函数名）。本次未新增 pytest 用例（见"覆盖率统计"） |
| 实测脚本 | `codes/hr-collection-agent-backend/scripts/self_test_live.py`（不被 pytest 收集；v2 改为脚本内生成合成样品） |
| 复跑命令 | 全量：`uv run pytest -q`；真实进程：`set -a; . ./.env; set +a; PYTHONPATH=src:. uv run python scripts/self_test_live.py --out "$(mktemp -d)/live_result.json"`（只输出 OK/NG 与计数，不输出个人值、模型原文、文件名） |

## 用例统计

| 场景类型 | 代码 | 用例数 |
|---------|------|-------|
| 正向路径 | HP | 37 |
| 参数校验 | PV | 18 |
| 业务逻辑 | BL | 53 |
| 错误处理 | EH | 36 |
| 数据边界 | DB | 8 |
| 安全性 | SE | 17 |
| 真实对话（第 8 节） | CH | 1 |
| 合计 | — | 170 |

执行方式分布（按结果列标记，一条用例只计一类）：引用已有单测 154；真实演练实测 14；静态 0；跟踪（无自动化引用）2。

执行结果汇总见文末"执行汇总"。

---

## 1、接口① 上传简历并建会话 — POST /api/v1/sessions

> 列说明：**执行方式**中"引用"指向现存 pytest 用例（文件::函数），"实测"指第 8 节真实演练，"跟踪"指无自动化引用、已登记。**v2 变更**：保留 / 改（v2 语义或路径变化）/ 新 / 降级（无自动化引用，转跟踪）。

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-001-HP-01 | 上传合法 PDF（合成 300 B）创建会话并签发 browser_id | AC-01.1, 01.5, 02.6 | 201；SessionDetail 含 session_id、status=reviewing、update_state=none、fields 22 键；Set-Cookie `browser_id=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000`，无 Secure | `SELECT status, update_state, browser_hash FROM sessions` 1 行；browser_hash = sha256(Cookie 值)，库内无明文 | 引用 `tests/api/test_sessions_upload.py::test_upload_returns_201_with_session_and_browser_cookie`；`tests/services/test_session_service_create.py::test_create_inserts_a_reviewing_session_owned_by_the_browser_hash`。✅ 引用单测 | 改（草稿/令牌 → 会话/browser_id） |
| TC-RES-001-HP-02 | 上传 JPG、JPEG、PNG（魔数合法） | AC-01.1 | 三者 201；content_type 与扩展名一致 | `SELECT content_type FROM sessions` 与上传一致 | 引用 `tests/services/test_upload_validation.py::test_valid_files`。✅ 引用单测 | 保留 |
| TC-RES-001-HP-03 | 字段三态与空值不变式（模型桩返回 recognized / uncertain / missing，省略部分键） | AC-02.2 | 22 键齐全；缺失键为 missing 且值为 null 或 []；无 confirmed | `SELECT fields_json FROM sessions` 不含 `"confirmed"` | 引用 `tests/services/test_parse_normalizer.py::test_output_always_has_22_keys_and_fills_missing_ones`、`::test_empty_values_are_always_missing`。✅ 引用单测 | 保留 |
| TC-RES-001-HP-04 | 同一浏览器再次上传：新增第二个会话，旧会话保留，Cookie 同值续期 | AC-01.5, 01.6 | 201；sessions 2 行、browser_hash 相同；旧会话 status 与 fields 不变 | `SELECT count(*) FROM sessions WHERE browser_hash=?` 为 2 | 引用 `tests/api/test_sessions_upload.py::test_second_upload_keeps_both_sessions_and_renews_the_same_cookie`；`tests/services/test_session_service_create.py::test_create_without_identifier_issues_a_new_one_and_a_second_upload_keeps_both`。✅ 引用单测 | 改（v1 为替换旧草稿并删除，v2 不删除旧会话） |
| TC-RES-001-HP-05 | 两个浏览器各自上传，会话互不可见 | AC-05.3, 05.7 | 各自列表只含自己的会话；互读对方会话得 404 | `SELECT browser_hash, count(*) FROM sessions GROUP BY 1` 为两组 | 引用 `tests/services/test_session_service_create.py::test_list_is_most_recent_first_scoped_to_the_browser_and_empty_without_identifier`；`tests/e2e/test_redlines.py::test_another_browser_gets_one_404_and_changes_nothing`。✅ 引用单测 | 改 |
| TC-RES-001-HP-06 | 运行中的应用与冻结 OpenAPI 0.2.0 一致 | AC-06.4, 06.5 | info.version=0.2.0；(method, path, operationId) 集合一致；13 个接口的成功与错误状态三元组全部可产生 | 契约比对 | 引用 `tests/contract/test_openapi_conformance.py`（66 场景，覆盖 54 个三元组与 19 个错误码）；`tests/schemas/test_openapi_alignment.py::test_version`。✅ 引用单测 | 改（0.1.1 → 0.2.0） |
| TC-RES-001-PV-01 | 缺少 file 部分 | AC-01.2 | 400 file_missing；不建会话、不下发 Cookie、不调模型 | `SELECT count(*) FROM sessions` 为 0 | 引用 `tests/api/test_sessions_upload.py::test_validation_failure_has_no_cookie_and_missing_file_is_file_missing`；`tests/api/test_error_handling.py::test_upload_without_file_is_file_missing`。✅ 引用单测 | 改（路径） |
| TC-RES-001-PV-02 | 扩展名不在白名单（.exe） | AC-01.2 | 415 unsupported_file_type；不调模型 | sessions 为 0；`data/drafts/` 无新文件 | 引用 `tests/services/test_upload_validation.py::test_extension_whitelist_checked_before_reading`、`::test_unsupported_extension_wins_over_empty_content`。✅ 引用单测 | 改 |
| TC-RES-001-PV-03 | 空文件 | AC-01.2 | 400 file_empty | sessions 为 0 | 引用 `tests/services/test_upload_validation.py::test_empty_content`。✅ 引用单测 | 改 |
| TC-RES-001-PV-04 | 魔数与扩展名不符（PNG 内容命名为 .pdf） | AC-01.2 | 400 file_content_mismatch | sessions 为 0 | 引用 `tests/services/test_upload_validation.py::test_magic_bytes_must_match_the_extension`。✅ 引用单测 | 改 |
| TC-RES-001-PV-05 | 超过 10 MB（10485761 B） | AC-01.2 | 413 file_too_large；读取在超限时提前终止 | sessions 为 0；`data/drafts/` 为空 | 引用 `tests/services/test_upload_validation.py::test_one_byte_over_is_too_large_and_reading_stops_early`、`::test_far_larger_upload_is_aborted_without_reading_everything`。✅ 引用单测 | 改 |
| TC-RES-001-PV-06 | 同一请求带两个 file 部件 | AC-01.4 | 观测：框架绑定其一，201，仅 1 个会话与 1 个文件；OpenAPI 只声明单个 file 部件 | sessions 为 1；`data/drafts/` 为 1 个文件 | 静态（openapi.yaml 上传请求体）+ v1 观测记录。⚠ 跟踪：AC 01.4 要求"只接受一个文件"，当前对第二个部件静默忽略，无显式拒绝；无自动化引用，见"观察与遗留风险" | 保留（观测） |
| TC-RES-001-BL-01 | 用户文件名不参与落盘路径 | AC-01.3 | 落盘名为服务端生成；原文件名仅存库 | `SELECT original_filename, file_path FROM sessions`；file_path 不含用户文件名 | 引用 `tests/repositories/test_draft_file_store.py::test_save_uses_server_generated_name_from_content_type`；`tests/services/test_upload_validation.py::test_original_filename_is_basename_only`。✅ 引用单测 | 保留 |
| TC-RES-001-BL-02 | 类型以魔数为准，忽略客户端 Content-Type | AC-01.2 | content_type 由魔数决定 | `SELECT content_type FROM sessions` | 引用 `tests/services/test_upload_validation.py::test_content_type_comes_from_magic_bytes_only`。✅ 引用单测 | 保留 |
| TC-RES-001-BL-03 | 模型自报 confirmed / 未知状态一律降为 uncertain（B-04 提示注入） | AC-02.2, 02.3 | 字段状态只为 recognized、uncertain、missing | `SELECT fields_json FROM sessions` 不含 confirmed | 引用 `tests/services/test_parse_normalizer.py::test_confirmed_and_unknown_statuses_become_uncertain`、`::test_prompt_injection_cannot_produce_confirmed`。✅ 引用单测 | 保留 |
| TC-RES-001-BL-04 | 超长或类型不符的模型值降级，不猜测补全 | AC-02.3 | 超长截断；错类型置 missing | 同上 | 引用 `tests/services/test_parse_normalizer.py::test_scalar_truncation`、`::test_unusable_scalar_types_are_missing`、`::test_string_instead_of_list_is_wrapped_and_uncertain`。✅ 引用单测 | 保留 |
| TC-RES-001-BL-05 | 上传不写正式库（B-04） | AC-04.1, 05.1 | 上传后 resumes 与 file/ 无变化 | `SELECT count(*) FROM resumes` 为 0；`file/` 为空 | 结构断言：`tests/services/test_session_service_delete.py::test_session_service_has_no_write_access_to_resumes_or_archive`；`tests/services/test_resume_service.py::test_only_the_save_path_touches_the_resume_repository`。✅ 引用单测 | 改（v1 检查 resumes 表） |
| TC-RES-001-EH-01 | 解析失败不建会话、不下发 Cookie、不动已有会话 | AC-01.6, 02.5 | 502 parse_failed；无 Set-Cookie；已有会话不变 | `SELECT count(*) FROM sessions` 不增；`data/drafts/` 无新文件 | 引用 `tests/api/test_sessions_upload.py::test_parse_failure_has_no_cookie_no_row_no_file`；`tests/services/test_session_service_create.py::test_parse_failure_leaves_no_row_and_no_file_and_other_sessions_untouched`。✅ 引用单测 | 改（旧草稿与令牌 → 已有会话与 Cookie） |
| TC-RES-001-EH-02 | 模型不可用 / 超时的错误映射，不回退 | AC-02.4, 02.5 | 503 parse_unavailable；504 parse_timeout；无会话、无文件 | sessions 为 0 | 引用 `tests/clients/test_deepseek_client.py::test_unavailable_statuses`、`::test_timeouts_map_to_parse_timeout`（客户端）。✅ 引用单测 | 保留 |
| TC-RES-001-EH-03 | 上传写库失败时清理临时文件 | AC-01.6（间接） | 500 internal_error；`data/drafts/` 为空 | — | ⚠ 跟踪：v2 无对应自动化用例（v1 有自测）。非 AC 明示项、非红线，登记跟踪 | 降级（v1 实测 → v2 跟踪） |
| TC-RES-001-DB-01 | 大小边界 10485760 字节接受，+1 拒绝 | AC-01.1, 01.2 | 边界内接受，+1 返回 413 | `SELECT file_size FROM sessions` 为 10485760（仅接受时） | 引用 `tests/services/test_upload_validation.py::test_size_limit_boundary_exact_is_accepted`。✅ 引用单测 | 保留 |
| TC-RES-001-DB-02 | 原文件名超长（300 字符） | AC-01.3 | 存库前截断到 255 字符 | `SELECT length(original_filename)` ≤ 255 | 引用 `tests/services/test_upload_validation.py::test_original_filename_is_truncated_to_255`。✅ 引用单测 | 保留 |
| TC-RES-001-DB-03 | 极小合法文件（5 字节 `%PDF-`） | AC-01.1 | 201 | `SELECT file_size FROM sessions` 为 5 | 引用 `tests/services/test_upload_validation.py::test_valid_files`（等价类代表）。✅ 引用单测 | 保留 |
| TC-RES-001-SE-01 | 日志不含姓名、手机号、邮箱、文件名、browser_id 明文或哈希；库不存明文（B-03） | AC-06.3 | 日志与错误体无上述值 | 日志扫描；`SELECT browser_hash FROM sessions` 为 64 位十六进制 | 引用 `tests/e2e/test_redlines.py::test_logs_and_error_bodies_never_carry_personal_data`、`::test_browser_identifier_is_stored_only_as_a_hash`；第 8 节 SE-01 实测。✅ 引用单测 + 实测 | 改（draft_token → browser_id） |
| TC-RES-001-SE-02 | 错误响应只含约定键，不含文件名 | AC-06.4 | 错误体仅 `{code, message, request_id}`（+ `details` 字段名） | 接口断言 | 引用 `tests/api/test_error_handling.py::test_app_error_body_and_status`、`::test_error_logs_contain_no_request_content`。✅ 引用单测 | 保留 |

---

## 2、接口② 读取会话 — GET /api/v1/sessions/{session_id}

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-002-HP-01 | 凭 Cookie 读取 reviewing 会话，Cookie 续期 | AC-03.1, 05.2 | 200；字段、对话记录、原文件信息齐全，无"下一个字段/提问文案"键；Set-Cookie 同值 Max-Age=34560000 | `SELECT status FROM sessions WHERE id=?` = reviewing | 引用 `tests/api/test_sessions_get.py::test_get_returns_the_session_and_renews_the_cookie`；`tests/services/test_session_service_get.py::test_reviewing_shape_has_fields_and_messages_with_current_old_value`。✅ 引用单测 | 改（路径、Cookie 名） |
| TC-RES-002-HP-02 | 读取不刷新最近活动时间（v1 为读取刷新，v2 反向） | AC-03.5 | last_active_at、updated_at 与读取前相同；Cookie 仍续期 | `SELECT last_active_at, updated_at FROM sessions` 前后一致 | 引用 `tests/services/test_session_service_get.py::test_read_changes_nothing_and_misses_are_indistinguishable`。✅ 引用单测 | 改 |
| TC-RES-002-HP-03 | 三种形态：reviewing、saved、pending（候选） | AC-03.4, 05.4, 09.1 | reviewing 含字段与 old_value；saved 的 fields 为 null、resume 为正式库值；pending 返回已有记录与冻结候选 | `SELECT status, update_state, resume_id FROM sessions` | 引用 `tests/services/test_session_service_get.py::test_reviewing_shape_has_fields_and_messages_with_current_old_value`、`::test_saved_shape_reads_content_from_resumes_and_hides_old_value`、`::test_pending_shape_returns_existing_record_and_frozen_candidate`。✅ 引用单测 | 新 |
| TC-RES-002-EH-01 | 无 Cookie 读取 | AC-05.7 | 404 session_not_found；不下发 Cookie | — | 引用 `tests/api/test_sessions_get.py::test_foreign_unknown_or_anonymous_access_is_the_same_404`。✅ 引用单测 | 改（v1 为 draft_not_found） |
| TC-RES-002-EH-02 | 伪造或格式非法的 Cookie | AC-05.2, 05.7 | 按无标识处理，404 | — | 引用 `tests/api/test_cookies_deps.py::test_absent_or_malformed_cookie_means_no_identifier`。✅ 引用单测 | 改（v1 伪造令牌） |
| TC-RES-002-EH-03 | 保存后会话仍可读（v1"确认后令牌作废"已废止） | AC-04.7 | 200；status=saved；resume 为正式库内容（只含值） | `SELECT status, resume_id FROM sessions` 为 saved 与非空 | 引用 `tests/api/test_session_resume_confirm.py::test_first_save_is_201_keeps_the_cookie_and_the_session`；`tests/services/test_session_service_get.py::test_saved_shape_reads_content_from_resumes_and_hides_old_value`。✅ 引用单测 | 改（v1 为 404） |
| TC-RES-002-EH-04 | 超过 7 天未活动的会话仍可读（永久保存，无 TTL） | AC-05.5 | 200，不因时间过期 | `SELECT last_active_at FROM sessions` 为旧值且行仍存在 | ⚠ 部分：清扫侧 `tests/services/test_orphan_sweep_service.py::test_a_file_referenced_by_a_session_is_kept_however_old` ✅ 引用单测；读取侧无直接用例，跟踪 | 改（v1 草稿过期 404 废止） |
| TC-RES-002-SE-01 | 会话按浏览器隔离 | AC-05.7 | 他人会话 404，与不存在同码；无副作用 | 对方会话 fields 不变 | 引用 `tests/api/test_sessions_get.py::test_foreign_unknown_or_anonymous_access_is_the_same_404`；`tests/services/test_session_service_get.py::test_read_changes_nothing_and_misses_are_indistinguishable`。✅ 引用单测 | 改 |

---

## 3、接口③ 分区更新 — PATCH /api/v1/sessions/{session_id}/fields

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-003-HP-01 | 部分更新：出现的字段置 confirmed，未出现的保持原状 | AC-03.2 | 200；提交字段 confirmed；其余字段与状态不变；Cookie 续期 | `SELECT fields_json FROM sessions` 对比前后 | 引用 `tests/api/test_sessions_patch.py::test_patch_confirms_fields_and_conforms_to_the_contract`；`tests/services/test_field_merge.py::test_present_fields_are_confirmed_and_absent_fields_unchanged`。✅ 引用单测 | 改（路径） |
| TC-RES-003-HP-02 | 多条子项整体替换（新增、修改、删除），空白项丢弃 | AC-03.3 | 200；经历块整体替换 | fields_json 中子项数与内容 | 引用 `tests/services/test_field_merge.py::test_blocks_are_replaced_whole_and_blank_items_are_dropped`。✅ 引用单测 | 保留 |
| TC-RES-003-HP-03 | 确认留空：标量 null、列表 [] 视为已确认的空值 | AC-03.2 | status=confirmed，值为 null 或 [] | fields_json | 引用 `tests/services/test_field_merge.py::test_null_and_empty_list_are_confirmed_empty`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-01 | 手机号与邮箱格式非法，一次返回全部字段错误 | AC-03.4 | 422 validation_failed；details 含 phone、email 两项；不回显值 | `SELECT fields_json` 与请求前相同 | 引用 `tests/services/test_field_validation.py::test_all_problems_collected_in_one_pass`；`tests/api/test_sessions_patch.py::test_invalid_bodies_give_422_without_echoing_values`。✅ 引用单测 | 改（多错一次） |
| TC-RES-003-PV-02 | 手机号带空格或连字符，兜底去除后接受 | AC-03.4 | 200 | — | 引用 `tests/services/test_field_validation.py::test_update_phone_with_spaces_accepted_fallback`、`::test_strip_phone`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-03 | 空 fields | AC-03.4 | 422 validation_failed（required） | — | 引用 `tests/services/test_field_validation.py::test_empty_update_is_required_error`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-04 | 未知字段 | AC-03.4 | 422 validation_failed（unknown_field），details 只含字段名 | — | 引用 `tests/services/test_field_validation.py::test_pydantic_unknown_field`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-05 | 核心三项不可空、全空白 | AC-03.4 | 422 required | — | 引用 `tests/services/test_field_validation.py::test_update_whitespace_only_name_is_required`、`::test_pydantic_empty_string_core_is_required`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-06 | 长度或条数超限 | AC-03.4 | 422 too_long | — | 引用 `tests/services/test_field_validation.py::test_pydantic_too_long_scalar_and_list_and_block`。✅ 引用单测 | 保留 |
| TC-RES-003-PV-07 | 类型错误与非法请求体 | AC-03.4 | 422 validation_failed（invalid_type） | — | 引用 `tests/services/test_field_validation.py::test_pydantic_wrong_type_and_null_core`。✅ 引用单测 | 保留 |
| TC-RES-003-BL-01 | 校验失败不产生部分写入 | AC-03.4 | 422；库不变 | `SELECT fields_json, updated_at FROM sessions` 前后一致 | 引用 `tests/services/test_session_service_update.py::test_validation_failure_writes_nothing_and_details_do_not_echo_values`。✅ 引用单测 | 改 |
| TC-RES-003-BL-02 | 更新只写会话库，不写正式库（B-04） | AC-03.2, 04.1 | resumes 行数不变 | `SELECT count(*) FROM resumes` 前后一致 | 结构：`tests/services/test_session_service_delete.py::test_session_service_has_no_write_access_to_resumes_or_archive`；`tests/services/test_session_service_update.py::test_update_writes_merged_fields_and_refreshes_times`。✅ 引用单测 | 改 |
| TC-RES-003-BL-03 | 写入刷新 last_active_at 与 updated_at | AC-03.5 | 两个时间戳更新；created_at 不变 | `SELECT last_active_at, updated_at, created_at FROM sessions` | 引用 `tests/services/test_session_service_update.py::test_update_writes_merged_fields_and_refreshes_times`。✅ 引用单测 | 改（写路径刷新，读不刷新） |
| TC-RES-003-BL-04 | saved 会话拒绝修改 | AC-03.6 | 409 session_read_only；库不变 | `SELECT fields_json FROM sessions` 不变 | 引用 `tests/services/test_session_service_update.py::test_foreign_unknown_and_saved_sessions_are_rejected`。✅ 引用单测 | 新 |
| TC-RES-003-EH-01 | 无 Cookie 或他人会话更新 | AC-05.7 | 404 session_not_found | fields_json 不变 | 引用 `tests/api/test_sessions_patch.py::test_patch_of_a_foreign_session_is_404`。✅ 引用单测 | 改 |
| TC-RES-003-EH-02 | 并发更新不同字段，互不丢失 | AC-03.2 | 两个字段的修改都保留 | fields_json 同时含两者 | 引用 `tests/services/test_session_service_update.py::test_concurrent_updates_of_different_fields_are_both_kept`。✅ 引用单测 | 改 |
| TC-RES-003-DB-01 | 字段边界（邮箱 254 字符等） | AC-03.4 | 边界接受，超界拒绝 | — | 引用 `tests/services/test_field_validation.py::test_email_length_boundary`。✅ 引用单测 | 改 |
| TC-RES-003-SE-01 | 422 响应与日志不含提交值 | AC-06.3 | details 只含字段名与原因 | 响应与日志扫描 | 引用 `tests/services/test_field_validation.py::test_issues_never_carry_values`、`tests/api/test_sessions_patch.py::test_invalid_bodies_give_422_without_echoing_values`。✅ 引用单测 | 改 |

---

## 4、接口④ 确认保存 — POST /api/v1/sessions/{session_id}/resume

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-004-HP-01 | 首次确认：201；会话置 saved；保留会话与对话；删除临时文件；不清除 Cookie | AC-04.3, 04.7 | 201，already_saved=false；`file/` 恰 1 个 `{resume_id}.{ext}` 与上传逐字节一致；sessions.status=saved、file_path 为 NULL；`data/drafts/` 无该文件 | `SELECT file_path, original_filename, content_type, file_size FROM resumes`；`SELECT status, resume_id FROM sessions` | 引用 `tests/api/test_session_resume_confirm.py::test_first_save_is_201_keeps_the_cookie_and_the_session`；`tests/services/test_resume_service.py::test_new_resume_is_saved_with_file_and_the_session_is_kept_as_saved`。第 8 节 HP-06 实测。✅ 引用单测 + 实测 | 改（v1 删除草稿与令牌） |
| TC-RES-004-HP-02 | 同一人再次确认：200 already_saved；会话保留为更新候选 | AC-04.6, 09.1 | 200；resume_id 同首次；update_state=pending；本次临时文件冻结保留；resumes 仍 1 行；`file/` 仍 1 个 | `SELECT update_state FROM sessions` 为 pending；`data/drafts/` 仅候选文件 | 引用 `tests/api/test_session_resume_confirm.py::test_same_person_again_is_200_without_a_second_record`；`tests/services/test_resume_service.py::test_same_identity_returns_existing_record_and_keeps_the_update_candidate`。第 8 节 HP-07 实测。✅ 引用单测 + 实测 | 改（v1 为清除草稿） |
| TC-RES-004-HP-03 | 规范化等价的输入命中同一幂等键 | AC-04.5 | 第二次为 200 already_saved | — | 引用 `tests/services/test_identity_key.py::test_same_person_different_formatting_same_keys`。✅ 引用单测 | 保留 |
| TC-RES-004-PV-01 | 无明确确认（缺失或非 true） | AC-04.1 | 422 confirmation_required；resumes 与 file/ 无变化；会话仍 reviewing | `SELECT count(*) FROM resumes` 为 0 | 引用 `tests/api/test_session_resume_confirm.py::test_missing_or_non_true_confirmation_is_422_and_writes_nothing`；`tests/services/test_resume_service.py::test_without_confirmation_nothing_is_written`。✅ 引用单测 | 改 |
| TC-RES-004-PV-02 | 核心三项缺失（逐项） | AC-04.2 | 422 validation_failed，details 含缺失项；不写库 | resumes 为 0 | 引用 `tests/services/test_resume_service.py::test_core_fields_missing_or_invalid`；`tests/services/test_field_validation.py::test_blank_core_fields_are_required`。✅ 引用单测 | 改 |
| TC-RES-004-PV-03 | 核心三项格式非法，修正后可保存 | AC-04.2 | 先 422，修正后 201 | — | 引用 `tests/services/test_field_validation.py::test_invalid_phones`、`::test_valid_emails`。✅ 引用单测 | 保留 |
| TC-RES-004-BL-01 | 确认前正式库无数据（B-04） | AC-04.1, 05.1 | 上传与校对期间 resumes 与子表为 0 行 | `SELECT count(*) FROM resumes` 与三张子表为 0 | 引用 `tests/services/test_chat_service.py::test_talking_about_saving_never_writes_the_formal_database`；`tests/services/test_resume_service.py::test_only_the_save_path_touches_the_resume_repository`。✅ 引用单测 | 改（v1 检查 drafts 表） |
| TC-RES-004-BL-02 | 记录与文件一一对应，无 tmp（B-05） | AC-04.3, 04.4 | `file/` 只有终态 `{id}.{ext}`；记录 file_path 指向存在的文件 | `SELECT file_path FROM resumes` 与 `ls file/` 对照 | 引用 `tests/services/test_resume_service_faults.py::test_failure_inside_transaction_rolls_back_everything`；`tests/services/test_reconcile_service.py::test_record_with_both_tmp_and_final_loses_nothing`。第 8 节 HP-06 实测。✅ 引用单测 + 实测 | 改 |
| TC-RES-004-BL-03 | 子表与 JSON 列落库 | AC-04.3 | 工作经历、项目、教育各按条落库（§8 实测：1 / 2 / 1） | `SELECT count(*) FROM resume_work_experiences` 等三表 | 引用 `tests/repositories/test_resume_repository.py::test_create_aggregate_writes_main_and_sub_rows`、`::test_sub_rows_keep_order_and_values`。✅ 引用单测 | 保留 |
| TC-RES-004-BL-04 | 展示值只去首尾空白，幂等键规范化 | AC-04.5 | 展示值保留内部空格；幂等键合并空格 | `SELECT name FROM resumes` | 引用 `tests/services/test_identity_key.py::test_display_values_only_trim_edges`、`::test_name_key_trims_and_merges_whitespace`。✅ 引用单测 | 保留 |
| TC-RES-004-BL-05 | 未逐项确认的字段按会话当前值保存；状态不入正式库 | AC-04.3 | 保存值取会话当前值；resumes 无状态列 | `PRAGMA table_info(resumes)` 无 status | 引用 `tests/repositories/test_resume_repository.py::test_get_detail_round_trips_values_without_statuses`。✅ 引用单测 | 改（v1 草稿 → 会话） |
| TC-RES-004-BL-06 | 仅邮箱不同视为不同人 | AC-04.5 | 第二人 201 新记录 | `SELECT count(*) FROM resumes` 为 2 | 引用 `tests/repositories/test_resume_repository.py::test_find_requires_all_three_keys`。✅ 引用单测 | 保留 |
| TC-RES-004-BL-07 | 并发确认同一幂等键（两个会话） | AC-04.6 | 一个 201、一个 200；同一 resume_id | `SELECT count(*) FROM resumes` 为 1 | 引用 `tests/services/test_resume_service_faults.py::test_two_threads_same_identity_one_created_one_duplicate`；`tests/repositories/test_resume_repository.py::test_concurrent_same_identity_yields_exactly_one_record`。✅ 引用单测 | 改 |
| TC-RES-004-BL-08 | 无修改或删除已确认记录的接口 | AC-04.9 | 路由集合中无 PUT/PATCH/DELETE /resumes/{id} | 路由枚举 | 静态 + 引用 `tests/contract/test_openapi_conformance.py`（路径与方法集合）。✅ 引用单测 | 改 |
| TC-RES-004-EH-01 | 会话不存在或不属于本浏览器 | AC-04.8 | 404 session_not_found | resumes 为 0 | 引用 `tests/api/test_session_resume_confirm.py::test_foreign_session_is_404_and_saved_session_is_409`；`tests/services/test_resume_service.py::test_foreign_unknown_anonymous_and_saved_sessions_are_rejected`。✅ 引用单测 | 改（v1 为 draft_not_found） |
| TC-RES-004-EH-02 | 已保存会话再次确认（v1"用旧令牌重试"已废止） | AC-04.8 | 409 session_read_only；resumes 不变 | `SELECT count(*) FROM resumes` 不变 | 引用 `tests/api/test_session_resume_confirm.py::test_foreign_session_is_404_and_saved_session_is_409`（saved 分支）。✅ 引用单测 | 改 |
| TC-RES-004-EH-03 | 写库失败的补偿 | AC-04.4 | 500 save_failed；无记录无文件；会话保持 reviewing 可重试 | resumes 为 0；`file/` 为空 | 引用 `tests/services/test_resume_service_faults.py::test_failure_inside_transaction_rolls_back_everything`、`::test_crash_before_commit_leaves_tmp_without_record`。✅ 引用单测 | 改 |
| TC-RES-004-EH-04 | 暂存文件失败的补偿 | AC-04.4 | 500 save_failed；无记录、无文件；可重试成功 | `file/` 为空 | 引用 `tests/services/test_resume_service_faults.py::test_stage_failure_leaves_nothing_and_retry_succeeds`、`::test_real_copy_failure_removes_partial_tmp`。✅ 引用单测 | 保留 |
| TC-RES-004-EH-05 | 提交后重命名失败，重启对账 roll-forward | AC-04.4 | 重启后终态文件补齐，记录可用 | `ls file/` 为 `{id}.{ext}` | 引用 `tests/services/test_resume_service_faults.py::test_rename_failing_twice_is_save_failed_and_keeps_record_and_tmp`；`tests/services/test_reconcile_service.py::test_case1_record_with_only_tmp_is_rolled_forward`。✅ 引用单测 | 保留 |
| TC-RES-004-EH-06 | 收尾（删除临时文件）失败不影响成功结果 | AC-04.7 | 201；结果不变；会话 saved | — | 引用 `tests/services/test_resume_service_faults.py::test_temp_file_delete_failure_does_not_change_the_result`、`::test_mark_saved_failure_keeps_the_result_and_the_temp_file`。✅ 引用单测 | 改（v1 删草稿文件） |
| TC-RES-004-DB-01 | 姓名 100 字符、最短合法邮箱、+ 国际 6 位号码 | AC-04.2, 04.5 | 接受 | — | 引用 `tests/schemas/test_resume_fields.py::test_scalar_length_boundaries`；`tests/services/test_field_validation.py::test_valid_phones`。✅ 引用单测 | 保留 |
| TC-RES-004-DB-02 | +86 前缀去除，其他国际号保留 | AC-04.5 | 13800138000 与 +8613800138000 同键；+44 号码保留前缀 | — | 引用 `tests/services/test_identity_key.py::test_phone_key`；`tests/services/test_field_validation.py::test_strip_phone`。✅ 引用单测 | 保留 |
| TC-RES-004-SE-01 | 确认路径日志与响应不含个人数据 | AC-06.3 | 日志与响应无姓名、手机号、邮箱、文件名、browser_id | 日志扫描 | 引用 `tests/services/test_resume_service.py::test_logs_contain_no_personal_data_filename_or_browser_identifier`；`tests/e2e/test_redlines.py::test_logs_and_error_bodies_never_carry_personal_data`。✅ 引用单测 | 改 |
| TC-RES-004-SE-02 | SQL 注入样式姓名只作为数据（参数绑定） | 安全基线（REQ-BE-06 横切） | 原样存储；表结构不变 | `SELECT name FROM resumes` 原样 | 引用 `tests/repositories/test_resume_repository.py::test_values_are_parameter_bound`。✅ 引用单测 | 保留 |

---

## 5、启动对账与初始化（lifespan）

> v2 说明：本节用例沿用 v1 的 AC 标注，AC 编号以文末「覆盖追溯矩阵」（v2 requirements.md）为准。自动化列已改为现存测试引用。

#### TC-RES-005-HP-01：启动后目录、库、版本就绪

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.1, AC-04.4 |
| 步骤/输入 | 启动应用（lifespan） |
| 预期 | drafts/、file/ 存在；drafts.db user_version=2、resumes.db user_version=1；sessions、chat_messages、chat_suggestions 与 4 张正式库表存在；可接收请求 |
| 自动化 | 引用 test_lifecycle::test_real_start_creates_directories_and_databases_at_their_versions |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`PRAGMA user_version; SELECT name FROM sqlite_master WHERE type='table';`

#### TC-RES-005-HP-02：启动顺序（design §5.4）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4, AC-05.5 |
| 步骤/输入 | 给 Lifecycle 各步骤打桩记录顺序 |
| 预期 | prepare_directories → init_databases → reconcile → orphan sweep（启动一次），之后才响应请求；无调度线程（v2） |
| 自动化 | 引用 test_lifecycle::test_start_order_is_dirs_init_reconcile_sweep_and_runs_in_the_calling_thread |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 记录顺序断言`

#### TC-RES-005-BL-01：对账情形①：有记录+tmp → roll-forward

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A 与 .A.pdf.tmp，启动 |
| 预期 | tmp 变为 A.pdf；记录保留 |
| 自动化 | 引用 test_reconcile_service::test_case1_record_with_only_tmp_is_rolled_forward |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/ = [A.pdf]；SELECT file_path FROM resumes;`

#### TC-RES-005-BL-02：对账情形②：tmp 无记录 → 删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A+A.pdf 与孤儿 tmp |
| 预期 | 孤儿 tmp 被删，A.pdf 保留 |
| 自动化 | 引用 test_reconcile_service::test_case2_tmp_without_record_is_deleted |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/ = [A.pdf]`

#### TC-RES-005-BL-03：对账情形③：终态文件无记录 → 删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A+A.pdf 与孤儿终态文件 |
| 预期 | 孤儿被删，A.pdf 保留 |
| 自动化 | 引用 test_reconcile_service::test_case3_final_without_record_is_deleted |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/ = [A.pdf]`

#### TC-RES-005-BL-04：对账保险丝：零记录时保留终态文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 空库 + file/ 有终态文件 |
| 预期 | 文件保留，告警不删 |
| 自动化 | 引用 test_reconcile_service::test_final_files_are_kept_when_there_are_no_records_at_all |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/ 仍有该文件；SELECT count(*) FROM resumes; -- 0`

#### TC-RES-005-BL-05：对账情形④：记录缺文件仅告警

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A（无任何文件）与记录 B+B.pdf |
| 预期 | 启动成功；记录不删；日志有 reconcile_record_file_missing 含 A 的 id |
| 自动化 | 引用 test_reconcile_service::test_case4_record_without_any_file_is_kept_and_warned |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`SELECT count(*) FROM resumes; -- 2`

#### TC-RES-005-BL-06：对账只在启动阶段由 lifecycle 调用

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 扫描 src 中 ReconcileService( 的调用点 |
| 预期 | 仅 core/lifecycle.py |
| 自动化 | 引用 test_lifecycle::test_only_the_lifecycle_module_uses_the_reconcile_service |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 源码扫描`

#### TC-RES-005-EH-01：对账抛错不阻止启动

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | monkeypatch ReconcileService.run 抛错 |
| 预期 | 应用正常启动；日志有 reconcile_failed |
| 自动化 | 引用 test_lifecycle::test_reconcile_and_sweep_failures_do_not_block_start_and_are_logged |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- HTTP 断言`

#### TC-RES-005-EH-02：冲突：记录同时有 tmp 与终态文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A、A.pdf 与 .A.pdf.tmp |
| 预期 | 两个文件均不删不改 |
| 自动化 | 引用 test_reconcile_service::test_record_with_both_tmp_and_final_loses_nothing |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/ 两个文件仍在`

#### TC-RES-005-DB-01：全空环境启动

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 空 DATA_DIR/FILE_DIR |
| 预期 | 两库 0 行，目录均为空，启动成功 |
| 自动化 | 引用 test_reconcile_service::test_empty_directory_and_empty_database_is_a_no_op |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`SELECT count(*) FROM resumes; SELECT count(*) FROM sessions;`

#### TC-RES-005-BL-07：陈旧旧版文件（确认更新中途中断后的对账）【v2 新增】

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-09.4（B-05） |
| 步骤/输入 | 记录已指向新版本终态文件；同 id 的旧版文件残留；启动对账 |
| 预期 | 旧版文件删除；记录与新版文件保留；记录自己的终态文件不存在时旧版保留并计入 reconcile_conflicts |
| 自动化 | 引用 test_reconcile_service::test_stale_old_version_is_deleted_when_the_records_own_file_exists；test_reconcile_service::test_old_version_is_kept_and_counted_when_the_records_own_file_is_missing |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`ls file/`；`SELECT file_path FROM resumes` 与终态文件一致

---


## 6、孤儿清扫（启动一次，无定时线程）【v2 替换 v1 草稿清理】

> v1 的 7 天 TTL 与定时清理已取消（ADR-008）。v2 唯一的清理是启动时运行一次的孤儿清扫：只作用于 `data/drafts/` 中**不被任何会话引用且超过 1 天宽限**的文件，永不访问 `file/`。

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-006-BL-02 | 无引用的临时文件：超过 1 天才删除，窗口内保留 | AC-05.5 | 2 天前的无引用文件删除；1 小时前的保留 | `ls data/drafts/` 前后对照 | 引用 `tests/services/test_orphan_sweep_service.py::test_unreferenced_files_are_deleted_only_after_one_day`。✅ 引用单测 | 保留（v1 改为本节） |
| TC-RES-006-BL-03 | 清扫永不触碰 file/ 正式归档 | AC-05.5 | file/ 文件数与内容不变 | `ls file/` 前后一致 | 引用 `tests/services/test_orphan_sweep_service.py::test_archive_directory_is_never_changed`；`tests/core/test_lifecycle.py::test_real_start_sweeps_old_orphans_but_never_the_archive`。✅ 引用单测 | 保留 |
| TC-RES-006-BL-04 | 启动时执行一次清扫 | AC-05.5 | 启动后过期孤儿被删；运行期间不再执行 | `ls data/drafts/` | 引用 `tests/core/test_lifecycle.py::test_real_start_sweeps_old_orphans_but_never_the_archive`。✅ 引用单测 | 改（v1 为启动一次 + 定时） |
| TC-RES-006-BL-05 | 无后台线程：启动后无调度线程残留，无定时清理 | AC-05.5 | 请求可用；`threading.enumerate()` 中无清理线程 | 线程枚举 | 引用 `tests/core/test_lifecycle.py::test_requests_start_after_the_whole_sequence_and_no_thread_is_left`。✅ 引用单测 | 改（v1 的"调度线程按间隔清理"废止） |
| TC-RES-006-BL-06 | 被会话引用的文件无论多旧都保留 | AC-05.5 | 文件保留 | `ls data/drafts/`；会话 file_path 仍指向该文件 | 引用 `tests/services/test_orphan_sweep_service.py::test_a_file_referenced_by_a_session_is_kept_however_old`。✅ 引用单测 | 新 |
| TC-RES-006-EH-01 | 引用列表读取失败时一个文件都不删；清扫失败不阻止启动 | AC-05.5 | 不删除；启动成功；日志仅计数 | `ls data/drafts/`；启动日志 | 引用 `tests/services/test_orphan_sweep_service.py::test_unreadable_reference_list_means_nothing_is_deleted`；`tests/core/test_lifecycle.py::test_reconcile_and_sweep_failures_do_not_block_start_and_are_logged`。✅ 引用单测 | 改（v1 为单次清理失败不终止调度线程） |

---

## 7、模型调用（clients 层，含 1 MB 请求体预算、B-02/B-04/B-05/B-06）

> v2 说明：本节用例沿用 v1 的 AC 标注，AC 编号以文末「覆盖追溯矩阵」为准。自动化列已改为现存测试引用；v2 新增的对话客户端用例见末尾。

#### TC-RES-007-HP-01：PNG 照片请求形态

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1, AC-06.2, AC-06.1 |
| 步骤/输入 | DeepSeekClient（MockTransport）解析合成 PNG |
| 预期 | POST api.deepseek.com …/chat/completions；model=deepseek-flash；Authorization 头带密钥，请求体不含密钥；image_url 为 data:image/jpeg;base64；体积 ≤995,904；返回 token 用量 |
| 自动化 | 引用 test_deepseek_client::test_png_request_shape_and_result |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-HP-02：文本层 PDF 走文本块

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1 |
| 步骤/输入 | 解析含文本层的合成 PDF |
| 预期 | 请求无 image_url，含 `text layer` 文本块 |
| 自动化 | 引用 test_deepseek_client::test_text_layer_pdf_is_sent_as_text_blocks_only |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-HP-03：扫描 PDF（无文本层）走图片块

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1 |
| 步骤/输入 | 解析合成扫描 PDF |
| 预期 | 请求含 image_url |
| 自动化 | 引用 test_deepseek_client::test_scanned_pdf_is_sent_as_rendered_jpeg |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-BL-01：1 MB 预算：不可压缩噪点大图

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1（约束：LLM ≤1 MB） |
| 步骤/输入 | 3000×2000 与 1200×1600 随机噪点 PNG |
| 预期 | 请求体 ≤995,904 B 且小于原图 |
| 自动化 | 引用 test_deepseek_client::test_photo_near_10mb_request_body_within_1mb；test_image_prep::test_large_photo_near_10mb_fits_budget |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- len(request.content)`

#### TC-RES-007-BL-02：压到下限仍超限 → parse_failed 且不外发

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5（约束：LLM ≤1 MB） |
| 步骤/输入 | 把预算改小到 3000 B |
| 预期 | 抛 ParseFailedError；传输层 0 次请求 |
| 自动化 | 引用 test_image_prep::test_floor_still_too_large_raises_parse_failed |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 请求计数 0`

#### TC-RES-007-BL-03：像素炸弹（>2500 万像素）拒绝

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 小文件头声明 >25M 像素的 PNG |
| 预期 | ParseFailedError；0 次请求 |
| 自动化 | 引用 test_image_prep::test_pixel_bomb_is_rejected_before_decoding |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 请求计数 0`

#### TC-RES-007-BL-04：B-02：模型名与外发地址锁定

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.2 |
| 步骤/输入 | DEEPSEEK_MODEL=other-model；BASE_URL=evil/http；model_copy 绕过后构造客户端 |
| 预期 | Settings 校验失败且错误信息不回显配置值；绕过构造时 DeepSeekClient 抛 ValueError |
| 自动化 | 引用 test_deepseek_client::test_every_request_uses_deepseek_flash_on_the_approved_host；test_deepseek_client::test_client_refuses_a_model_that_bypassed_settings_validation |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-BL-05：B-02：仅 clients 层引入 HTTP 栈/模型主机

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.2 |
| 步骤/输入 | 扫描 src（除 clients、core/config） |
| 预期 | 无 httpx/requests/urllib/socket 导入，无 api.deepseek.com 字面量 |
| 自动化 | 引用 test_deepseek_client::test_all_requests_go_to_the_configured_host_only；静态：services、api、repositories 不引入 httpx |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 源码扫描`

#### TC-RES-007-BL-06：B-01：无凭证 → parse_unavailable 且不外发；代码无密钥字面量

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.1, AC-02.5 |
| 步骤/输入 | API key=None 解析；扫描 src 中 sk- 密钥样式 |
| 预期 | ParseUnavailableError，0 次请求；无匹配 |
| 自动化 | 引用 test_deepseek_client::test_missing_api_key_is_unavailable_and_sends_nothing |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 源码扫描`

#### TC-RES-007-BL-07：B-06：测试禁网夹具生效

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.6 |
| 步骤/输入 | 在测试里创建 socket 连接 |
| 预期 | 抛 RuntimeError(network access is forbidden) |
| 自动化 | 引用 tests/conftest.py::_forbid_network（autouse） |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-01：读/连接超时 → parse_timeout，不重试

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.4 |
| 步骤/输入 | 传输层抛 ReadTimeout、ConnectTimeout |
| 预期 | ParseTimeoutError；仅 1 次请求 |
| 自动化 | 引用 test_deepseek_client::test_timeouts_map_to_parse_timeout |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 请求计数 1`

#### TC-RES-007-EH-02：HTTP 401/402/403/404/429/500/503 → parse_unavailable

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | MockTransport 返回对应状态 |
| 预期 | ParseUnavailableError，异常文本不含供应商响应体；1 次请求 |
| 自动化 | 引用 test_deepseek_client::test_unavailable_statuses |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-03：HTTP 400/413/422 → parse_failed

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 同上 |
| 预期 | ParseFailedError |
| 自动化 | 引用 test_deepseek_client::test_other_4xx_is_parse_failed |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-04：响应体空/非 JSON/非对象/无 choices → parse_failed

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.3, AC-02.5 |
| 步骤/输入 | 5 种异常响应 |
| 预期 | ParseFailedError |
| 自动化 | 引用 test_deepseek_client::test_unparsable_success_bodies_are_parse_failed |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-05：连接失败 → parse_unavailable

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 传输层抛 ConnectError |
| 预期 | ParseUnavailableError |
| 自动化 | 引用 test_deepseek_client::test_transport_errors_map_to_unavailable |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-06：超时配置 connect5/write30/read60/pool5，MODEL_TIMEOUT_SECONDS 可调

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.4 |
| 步骤/输入 | 读取 client.timeout；MODEL_TIMEOUT_SECONDS=7 |
| 预期 | (5,30,60,5)；自定义读超时 7 |
| 自动化 | 引用 test_deepseek_client::test_timeout_configuration |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 属性断言`

#### TC-RES-007-EH-07：仅有 PDF 魔数的损坏 PDF → parse_failed，不外发

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 解析 300 字节伪 PDF |
| 预期 | ParseFailedError |
| 自动化 | 引用 test_deepseek_client::test_unreadable_pdf_fails_without_calling_the_model |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 请求计数 0`

#### TC-RES-007-DB-01：token 用量只记数字

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3 |
| 步骤/输入 | 模型响应 usage 123/45 |
| 预期 | 日志含 prompt_tokens=123、completion_tokens=45 |
| 自动化 | 引用 test_deepseek_client::test_success_is_logged_with_numbers_only |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 抓取日志`

#### TC-RES-007-SE-01：日志不含请求内容、响应体、密钥、Bearer

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3, AC-06.1 |
| 步骤/输入 | 文本 PDF 含标记，响应含标记，解析失败 |
| 预期 | 日志与 stdout 均无标记、密钥、Bearer |
| 自动化 | 引用 test_deepseek_client::test_failures_never_log_bodies_or_keys |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`-- 抓取日志`

---

#### TC-RES-007-HP-04：对话请求形态（只含结构化字段、历史与本条消息）【v2 新增】

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-07.1 |
| 步骤/输入 | 调用对话客户端，传入字段、最近历史与一条消息；成功返回回复与建议 |
| 预期 | 返回回复、建议与 token 用量；请求体不含文件、文件名与标识 |
| 自动化 | 引用 test_deepseek_client::test_chat_success_returns_reply_suggestions_and_usage；test_deepseek_client::test_chat_request_carries_only_text_sections_no_file_name_or_identifier |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：请求体 JSON 中不含原始文件字段与文件名

#### TC-RES-007-BL-08：对话历史超预算时丢弃最旧记录，超长字段不发送【v2 新增】

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-07.1 |
| 步骤/输入 | 最近历史超过预算；字段值超长 |
| 预期 | 最旧历史被丢弃直到满足预算；超长字段不进入请求 |
| 自动化 | 引用 test_deepseek_client::test_oldest_history_is_dropped_to_fit_and_oversized_fields_are_not_sent |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：请求体字节数 ≤ 预算

#### TC-RES-007-EH-08：对话失败类别全部映射为 chat_failed，不重试【v2 新增】

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-07.2 |
| 步骤/输入 | 超时、连接失败、HTTP 错误、响应不合法等各类失败 |
| 预期 | 全部为 ChatFailedError（业务码 chat_failed）；不自动重试；不写库 |
| 自动化 | 引用 test_deepseek_client::test_every_failure_class_is_chat_failed_without_retry；test_deepseek_client::test_timeout_and_connection_failures_are_chat_failed |
| 执行结果 | ✅ 引用单测（全量 pytest 976 passed） |

数据验证：`SELECT count(*) FROM chat_messages` 不变（见 TC-RES-009-EH-01）

---


## 8、真实进程 + 真实 deepseek-flash + 合成样品（v2 实测）

> **授权与边界**：DL 授权仅在本步使用真实模型。凭证只经 `set -a; . ./.env; set +a` 装入环境变量，脚本与报告均不读取、打印、复制凭证。样品为脚本内生成的**合成简历**（example.com 邮箱、137 0000 0001 号码、虚构学校与公司），不读取任何真实简历。外发地址只允许 `https://api.deepseek.com`，模型只允许 `deepseek-flash`。真实 uvicorn 只监听 127.0.0.1:8000、单 worker；临时 DATA_DIR/FILE_DIR 与进程演练后已清理，端口已释放。报告只记 OK/NG 与计数。

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-008-HP-01 | 真实进程启动：对账 → 孤儿清扫 → 启动完成 → 监听 | AC-05.5, 04.4 | 日志顺序 reconcile_done < orphan_sweep_done < Application startup complete；GET /sessions 返回 200；目录与两库存在 | 启动日志；`ls` | ✅ 实测 OK | 改（v1 为 cleanup_done） |
| TC-RES-008-EH-01 | 真实进程错误码：无 file 400、.exe 415、空文件 400、魔数不符 400、10 MiB+1 413；无 Cookie 列表为空且无 Set-Cookie；无 Cookie 的 GET 与确认均 404 | AC-01.2, 05.7 | 全部符合；sessions 为 0 | `SELECT count(*) FROM sessions` 为 0 | ✅ 实测 OK | 改 |
| TC-RES-008-BL-01 | 样品外发预算：合成 PNG 请求体 ≤ 995,904 字节 | AC-02.1 | 源 115,731 B → 请求体 132,204 B | 计算 `_body_size` | ✅ 实测 OK | 改（v1 为真实样品） |
| TC-RES-008-HP-02 | 上传合成简历（真实 deepseek-flash） | AC-01.1, 02.1, 02.2, 02.6 | 201；22 键；状态 ⊆ {recognized, uncertain, missing}；Cookie 属性正确；4.6 s | sessions 1 行 | ✅ 实测 OK（首次即 201，无重试） | 改 |
| TC-RES-008-HP-03 | 逐字段对比合成真值（11 项） | AC-02.2, 02.3 | 11 项全部一致 | 内存比对，不输出值 | ✅ 实测 OK（11/11） | 改 |
| TC-RES-008-HP-04 | GET 与上传响应一致 | AC-03.1 | 200；fields 相同；session_id 相同 | — | ✅ 实测 OK | 改 |
| TC-RES-008-HP-05 | 分区更新：确认姓名、手机号、邮箱、homepage | AC-03.2 | 200；4 项 confirmed；其余 18 项不变 | — | ✅ 实测 OK | 改 |
| TC-RES-008-CH-01 | 真实对话一轮（不应用任何建议） | AC-07.1, 07.2, 07.6 | 201；助手回复非空；建议条数记录（本次 0 条） | `chat_messages` 新增 2 行 | ✅ 实测 OK（回复 41 字符，建议 0 条） | 新 |
| TC-RES-008-HP-06 | 确认保存：库与文件一致 | AC-04.3, 04.7（B-05） | 201；resumes 1 行，子表 1 / 2 / 1；saved 会话 1 个；临时目录 0 个文件；`file/` 仅 `{id}.png` 且 SHA-256 与样品一致；身份列与真值一致；Cookie 保留 | `SELECT count(*)` 各表；sha256 对比 | ✅ 实测 OK | 改（v1 为 drafts 表） |
| TC-RES-008-EH-02 | 重启对账：计划中的孤儿文件被清理，记录文件保留 | AC-04.4 | 退出码 0；植入的 tmp 与无记录终态文件被删；记录文件保留；resumes 仍 1 行 | `ls file/`；`SELECT count(*) FROM resumes` | ✅ 实测 OK | 改 |
| TC-RES-008-HP-07 | 同一人再次上传与确认（真实模型） | AC-04.6, 09.1 | 上传 201；确认 200 already_saved，resume_id 不变；会话 update_state=pending；临时目录仅含候选文件；resumes 仍 1 行；`file/` 仅 `{id}.png` | `SELECT update_state FROM sessions`；`ls data/drafts/` 与候选 file_path 对照 | ✅ 实测 第 2 次 OK。第 1 次 NG：脚本断言把"临时目录必须为空"写错（设计 5.3 要求保留候选文件），已修正脚本后复测通过 | 改（v1 为草稿清除） |
| TC-RES-008-HP-08 | 确认更新：覆盖已有记录，文件为版本名 | AC-09.2, 09.3, 09.5 | 200；resumes 仍 1 行；`file/` 仅 `{id}-{8位}.png`；内容与样品一致；update_state=applied | `SELECT file_path FROM resumes`；sha256 对比 | ✅ 实测 OK | 新 |
| TC-RES-008-SE-01 | 真实进程日志无个人数据、Cookie 值或密钥（B-03） | AC-06.1, 06.3 | 无泄漏；事件名均在白名单内 | 日志与内存中的敏感值逐项比对，不输出值 | ✅ 实测 OK（0 处泄漏；日志 75 行） | 改 |
| TC-RES-008-SE-02 | 优雅退出，端口释放，临时目录清理 | AC-06.1 | 两次退出码均为 0；日志含 shutdown complete；8000 端口释放 | `lsof` 与 `ls` 检查 | ✅ 实测 OK | 改 |

**演练记录**

| 次序 | 结果 | 说明 |
|---|---|---|
| 第 1 次 | 13 OK / 1 NG | NG 为 TC-RES-008-HP-07 的脚本断言错误（见上表），业务代码未改动 |
| 第 2 次（采纳） | 14 OK / 0 NG | 脚本修正后的复测，本文档结果以此为准 |

**token 用量（第 2 次，仅计数）**：模型调用 3 次（解析 1、对话 1、二次上传解析 1）；prompt_tokens 合计 3,752；completion_tokens 合计 2,128。第 1 次为 3 次调用，prompt 3,752，completion 2,080。

---

## 9、对话 — POST /api/v1/sessions/{id}/messages，…/messages/{mid}/apply、cancel【v2 新增】

> 对话只产生文本回复与修改建议，不保存、不更新正式库（B-04）。模型调用一律 mock（`FakeChatClient` 与 `httpx.MockTransport`）。

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-009-HP-01 | 发送消息：返回用户消息与助手消息，建议经校验 | AC-07.6 | 201；两条消息；建议字段为白名单内，原值取会话当前值 | `SELECT count(*) FROM chat_messages WHERE session_id=?` 增 2；chat_suggestions 行与返回一致 | 引用 `tests/api/test_chat_messages.py::test_message_returns_201_with_both_messages_and_conforms`；`tests/services/test_chat_service.py::test_success_stores_both_messages_and_validated_suggestions_only`。✅ 引用单测 | 新 |
| TC-RES-009-HP-02 | 应用建议卡片：字段置 confirmed，建议置 applied | AC-07.7 | 200；返回卡片与字段；可应用项全部生效 | `SELECT status FROM chat_suggestions`；`fields_json` 对应字段 status=confirmed | 引用 `tests/api/test_chat_apply.py::test_apply_returns_the_card_and_fields_and_repeat_is_409`；`tests/services/test_chat_apply.py::test_apply_confirms_the_fields_and_marks_only_applicable_suggestions`。✅ 引用单测 | 新 |
| TC-RES-009-HP-03 | 取消建议卡片：字段不变，建议置 cancelled | AC-07.7 | 字段不变；之后应用返回 409 | `SELECT status FROM chat_suggestions` 为 cancelled | 引用 `tests/api/test_chat_apply.py::test_cancel_keeps_the_fields_and_later_apply_is_409`。✅ 引用单测 | 新 |
| TC-RES-009-PV-01 | 消息空白或超过 2000 字符 | AC-07.1 | 422 validation_failed（仅字段名）；不调模型；日志只记长度 | `chat_messages` 不增 | 引用 `tests/api/test_chat_messages.py::test_blank_or_too_long_message_is_422_on_content_and_only_the_length_is_logged`；`tests/services/test_chat_service.py::test_whitespace_only_message_is_required_and_never_reaches_the_model`。✅ 引用单测 | 新 |
| TC-RES-009-BL-01 | 建议只接受字段白名单，经历三类字段的建议丢弃 | AC-07.3 | 白名单外与三类经历字段的建议被丢弃 | 返回建议集合不含这些字段 | 引用 `tests/services/test_suggestion_validation.py::test_fields_outside_the_whitelist_are_dropped`、`::test_wrong_shape_for_the_field_kind_is_dropped`。✅ 引用单测 | 新 |
| TC-RES-009-BL-02 | 字段规则不合规的建议标记为不可应用，附原因代码，不回显值 | AC-07.4 | applicable=false，reason 为枚举值，new_value 不出现在 details | 响应与日志不含该值 | 引用 `tests/services/test_suggestion_validation.py::test_invalid_values_stay_visible_but_not_applicable_without_echoing_the_value`。✅ 引用单测 | 新 |
| TC-RES-009-BL-03 | 姓名、手机号、邮箱的新值必须出现在本条用户消息中；与当前值相同的建议丢弃 | AC-07.5 | 未出现在本条消息的新值被丢弃；同值被丢弃 | 返回建议集合 | 引用 `tests/services/test_suggestion_validation.py::test_name_phone_email_must_occur_in_this_users_message`、`::test_unchanged_values_are_dropped_after_trimming`。✅ 引用单测 | 新 |
| TC-RES-009-BL-04 | 对话链路不得保存或更新正式库（B-04） | AC-07.8, 09.6 | 确认提交类内容只得文本回复；resumes 不变 | `SELECT count(*) FROM resumes` 前后一致 | 引用 `tests/services/test_chat_service.py::test_talking_about_saving_never_writes_the_formal_database`；`::test_chat_service_cannot_reach_saving_or_the_archive`（结构）。✅ 引用单测 | 新 |
| TC-RES-009-BL-05 | 应用卡片原子性：任一建议失败则整卡不生效；应用与分区更新并发两者都保留 | AC-07.7 | 整卡不生效，字段不变；并发两修改都保留 | `fields_json` 对比 | 引用 `tests/services/test_chat_apply.py::test_one_failing_suggestion_voids_the_whole_card`、`::test_apply_and_partial_update_running_together_keep_both_changes`。✅ 引用单测 | 新 |
| TC-RES-009-EH-01 | 模型调用失败或超时：不写任何消息、建议或字段 | AC-07.2 | 502 chat_failed；无新增消息 | `SELECT count(*) FROM chat_messages` 不变 | 引用 `tests/api/test_chat_messages.py::test_model_failure_is_502_and_stores_nothing`；`tests/services/test_chat_service.py::test_model_failure_writes_nothing`。✅ 引用单测 | 新 |
| TC-RES-009-EH-02 | 模型输出结构不合法：截断与降级，不写入非法结构 | AC-07.2 | 合法部分保留；不合法建议丢弃；不触发保存 | 返回结构 | 引用 `tests/clients/test_deepseek_client.py::test_reply_is_truncated_and_bad_suggestion_items_dropped_first_per_field_kept`；`::test_model_output_cannot_carry_a_save_or_confirm_action`。✅ 引用单测 | 新 |
| TC-RES-009-EH-03 | saved 会话拒绝对话、应用与取消 | AC-07.9 | 409 session_read_only；不调模型 | `chat_messages` 不增 | 引用 `tests/api/test_chat_messages.py::test_foreign_is_404_and_saved_session_is_409`；`tests/services/test_chat_apply.py::test_saved_session_cannot_apply_or_cancel`。✅ 引用单测 | 新 |
| TC-RES-009-SE-01 | 提示词限定范围，分隔标记消毒，数据区不可被闭合 | AC-07.10 | 提示词含范围与禁止保存约束；标记被消毒 | — | 引用 `tests/clients/test_prompts.py::test_chat_prompt_guards_scope_provenance_and_no_saving`；`tests/clients/test_deepseek_client.py::test_markers_in_fields_history_and_message_cannot_close_a_section`。✅ 引用单测。⚠ 范围外拒答的语义效果无法由自动化判定，见"观察与遗留风险" | 新 |
| TC-RES-009-SE-02 | 对话内容、回复、建议值不入日志（B-03） | AC-06.3 | 日志仅含数字与 ID | 日志扫描 | 引用 `tests/services/test_chat_service.py::test_logs_hold_no_message_reply_or_suggestion_values`；`tests/clients/test_deepseek_client.py::test_chat_logs_numbers_only`。✅ 引用单测 | 新 |

---

## 10、会话列表与手动删除 — GET /api/v1/sessions；DELETE /api/v1/sessions/{id}【v2 新增】

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-010-HP-01 | 列表：本浏览器全部会话，按最近活动倒序 | AC-05.3 | 200；字段含 session_id、name、status、last_active_at；倒序 | `SELECT id, last_active_at FROM sessions WHERE browser_hash=? ORDER BY last_active_at DESC` | 引用 `tests/services/test_session_service_create.py::test_list_is_most_recent_first_scoped_to_the_browser_and_empty_without_identifier`；`tests/repositories/test_session_repository.py::test_list_by_browser_is_owned_and_newest_active_first`。✅ 引用单测 | 新 |
| TC-RES-010-EH-01 | 无 browser_id 的列表 | AC-05.3 | 200 空列表；不下发 Cookie | — | 引用 `tests/api/test_sessions_upload.py::test_list_without_identifier_is_empty_and_issues_no_cookie`。✅ 引用单测 | 新 |
| TC-RES-010-BL-01 | 删除 reviewing 会话：删会话、对话、建议与临时文件；204 | AC-05.6 | 204；再次 GET 404 | sessions、chat_messages、chat_suggestions 对应行为 0；`data/drafts/` 对应文件不存在 | 引用 `tests/api/test_sessions_delete.py::test_delete_is_204_then_404_and_keeps_the_saved_resume`；`tests/services/test_session_service_delete.py::test_reviewing_session_goes_with_messages_suggestions_and_temp_file`。✅ 引用单测 | 新 |
| TC-RES-010-BL-02 | 删除 saved 会话：只删会话、对话与建议，不触及正式库与 file/ | AC-05.6 | 204；resumes 与子表行数不变；file/ 不变 | `SELECT count(*) FROM resumes` 与 `ls file/` 前后一致 | 引用 `tests/services/test_session_service_delete.py::test_saved_session_leaves_resumes_and_archive_untouched`。✅ 引用单测 | 新 |
| TC-RES-010-EH-02 | 删除他人或不存在的会话：同一 404，无副作用 | AC-05.7 | 404 session_not_found；对方会话不变 | 对方会话行数不变 | 引用 `tests/api/test_sessions_delete.py::test_foreign_delete_is_404_and_deletes_nothing`；`tests/services/test_session_service_delete.py::test_foreign_or_unknown_session_is_404_with_no_side_effect`。✅ 引用单测 | 新 |

---

## 11、归档只读 — GET /api/v1/resumes；…/{id}；…/{id}/file【v2 新增】

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-011-HP-01 | 归档列表（倒序、不分页）与详情（只含值） | AC-08.1, 08.2 | 列表含 resume_id、姓名、手机号、邮箱、求职意向、saved_at；详情含字段值、原文件名与类型、file_available | `SELECT resume_id, saved_at FROM resumes ORDER BY saved_at DESC` | 引用 `tests/api/test_archive.py::test_list_and_detail_conform_and_need_no_cookie`；`tests/services/test_archive_query_service.py::test_list_is_most_recent_first_and_detail_reports_file_availability`。✅ 引用单测 | 新 |
| TC-RES-011-HP-02 | 下载原始文件：内容与类型来自库内记录，文件名安全编码 | AC-08.3 | 200；Content-Disposition attachment；内容与归档文件一致 | sha256 对比 | 引用 `tests/api/test_archive.py::test_download_sends_the_attachment_with_safe_headers`；`tests/services/test_archive_query_service.py::test_open_file_streams_the_final_file`。✅ 引用单测 | 新 |
| TC-RES-011-EH-01 | 归档文件缺失：专用业务码，详情仍可读 | AC-08.3 | 404 file_not_available；详情 200，file_available=false | `ls file/` 缺该文件 | 引用 `tests/api/test_archive.py::test_missing_file_is_404_file_not_available_but_detail_still_reads`。✅ 引用单测 | 新 |
| TC-RES-011-SE-01 | 文件路径只按库内记录读取：拒绝符号链接、越界与 tmp 名 | AC-08.3 | 拒绝并不返回内容 | — | 引用 `tests/services/test_archive_query_service.py::test_missing_tmp_only_symlink_and_tampered_paths_are_not_available`；`tests/repositories/test_archive_file_store.py::test_symlinked_final_file_is_not_followed`、`::test_open_final_rejects_unsafe_or_tmp_names`。✅ 引用单测 | 新 |
| TC-RES-011-BL-01 | 归档无修改、删除接口，仅本机监听 | AC-08.4 | 契约路径集合中无 PUT/PATCH/DELETE /resumes 系列 | 契约枚举 | 静态 + 引用 `tests/contract/test_openapi_conformance.py`。✅ 引用单测 | 新 |

---

## 12、确认更新 — PUT /api/v1/sessions/{id}/resume【v2 新增，v2.1】

| 编号 | 用例与步骤 | 追溯 AC | 预期 | 数据验证 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-012-HP-01 | 显式确认更新：200，记录被候选覆盖，id 与首次保存时间不变 | AC-09.3, 09.5 | 200；resume_id 不变；update_state=applied；候选与临时文件清除 | `SELECT file_path, updated_at FROM resumes`；`ls file/` 为唯一版本名 | 引用 `tests/api/test_session_resume_update.py::test_confirmed_update_is_200_and_applies_the_session`；`tests/services/test_resume_update.py::test_update_overwrites_the_record_with_a_new_unique_file_and_applies_the_session`。第 8 节 HP-08 实测。✅ 引用单测 + 实测 | 新 |
| TC-RES-012-HP-02 | pending 会话读取：返回已有记录与冻结候选（只含值）及文件信息 | AC-09.1 | 200；update_candidate 非空；resume 为已有记录 | `SELECT update_state FROM sessions` 为 pending | 引用 `tests/services/test_session_service_get.py::test_pending_shape_returns_existing_record_and_frozen_candidate`。✅ 引用单测 | 新 |
| TC-RES-012-PV-01 | 缺少或非 true 的 confirm_update | AC-09.2 | 422 confirmation_required；不写入 | `SELECT file_path, updated_at FROM resumes` 不变 | 引用 `tests/api/test_session_resume_update.py::test_missing_or_non_true_confirmation_is_422_and_changes_nothing`；`tests/services/test_resume_update.py::test_missing_or_false_confirmation_writes_nothing`。✅ 引用单测 | 新 |
| TC-RES-012-BL-01 | 新旧扩展名不同：file_path 与 content_type 同步变化 | AC-09.3 | 两种扩展名都成功；下载读新文件 | `SELECT file_path, content_type FROM resumes` | 引用 `tests/services/test_resume_update.py::test_new_extension_changes_file_path_and_content_type_together`。✅ 引用单测 | 新 |
| TC-RES-012-BL-02 | 已应用后重复请求幂等 | AC-09.5 | 同一结果；不再写库、不产生新文件 | `ls file/` 不变 | 引用 `tests/services/test_resume_update.py::test_repeating_the_request_is_idempotent`。✅ 引用单测 | 新 |
| TC-RES-012-BL-03 | 两个会话先后更新同一记录 | AC-09.4 | 两次都成功；最终记录指向后到者；`file/` 只剩一个终态文件 | `ls file/`；`SELECT file_path FROM resumes` | 引用 `tests/services/test_resume_update.py::test_two_sessions_updating_the_same_record_leave_one_final_file`。✅ 引用单测 | 新 |
| TC-RES-012-BL-04 | 对话内容不能触发更新 | AC-09.6 | 对话与建议路径无更新入口；仅 confirm_update=true 写入 | 结构断言 + resumes 不变 | 引用 `tests/services/test_chat_service.py::test_chat_service_cannot_reach_saving_or_the_archive`。✅ 引用单测 | 新 |
| TC-RES-012-EH-01 | 无候选的会话 409；他人会话 404 | AC-09.2, 05.7 | 409 update_not_available；404 session_not_found | — | 引用 `tests/api/test_session_resume_update.py::test_session_without_a_candidate_is_409_and_foreign_is_404`；`tests/services/test_resume_update.py::test_only_a_pending_session_of_the_caller_can_update`。✅ 引用单测 | 新 |
| TC-RES-012-EH-02 | 故障注入：更新事务的 B-05 关键失败点（HIGH_RISK） | AC-09.4（B-05） | 每个注入点：记录与文件处于一致状态，失败时记录保持不变 | 同时断言 SQLite 与 `file/`、`data/drafts/` | 引用 `tests/services/test_resume_update_faults.py::test_stage_or_promote_failure_leaves_record_and_old_file_and_retry_succeeds`、`::test_transaction_rollback_removes_the_new_file_and_keeps_everything_else`、`::test_commit_with_unknown_outcome_is_decided_by_the_record`、`::test_crash_between_promote_and_transaction_leaves_a_removable_new_file`、`::test_crash_after_commit_before_old_file_removal_is_cleaned_by_reconcile`、`::test_old_file_removal_failure_does_not_change_the_result`、`::test_mark_applied_failure_keeps_the_result_and_a_retry_overwrites_with_same_content`（7 项）。✅ 引用单测 | 新 |

---

## 13、红线与会话归属（B-01 ~ B-06，ADR-008）【v2 新增】

| 编号 | 红线 | 用例与步骤 | 追溯 AC | 预期 | 执行方式与结果 | v2 变更 |
|---|---|---|---|---|---|---|
| TC-RES-013-SE-01 | B-01 | 代码与示例配置无密钥字面量；`.env.example` 只含占位符 | AC-06.1 | 扫描无密钥形态字符串 | 引用 `tests/e2e/test_redlines.py::test_example_env_holds_placeholders_only`、`::test_repository_has_no_key_shaped_string`。✅ 引用单测 | 新 |
| TC-RES-013-SE-02 | B-02 | 所有外发请求只到配置的主机，且只用 deepseek-flash | AC-06.2 | 请求地址与模型名锁定 | 引用 `tests/clients/test_deepseek_client.py::test_all_requests_go_to_the_configured_host_only`、`::test_every_request_uses_deepseek_flash_on_the_approved_host`。✅ 引用单测 | 新 |
| TC-RES-013-SE-03 | B-03 | 日志与错误响应不含个人数据、浏览器标识、会话内容 | AC-06.3 | 日志白名单；响应无个人数据 | 引用 `tests/e2e/test_redlines.py::test_logs_and_error_bodies_never_carry_personal_data`；`tests/core/test_logging.py::test_non_whitelisted_field_rejected`。第 8 节 SE-01 实测。✅ 引用单测 + 实测 | 新 |
| TC-RES-013-BL-01 | B-04 | 正式库只经显式确认写入（首次保存 confirmed=true、确认更新 confirm_update=true） | AC-04.1, 09.2 | 对话与分区更新不写 resumes | 引用 `tests/api/test_session_resume_confirm.py::test_missing_or_non_true_confirmation_is_422_and_writes_nothing`；`tests/services/test_chat_service.py::test_talking_about_saving_never_writes_the_formal_database`。第 8 节 HP-06 实测。✅ 引用单测 + 实测 | 新 |
| TC-RES-013-BL-02 | B-05 | 首次保存与确认更新的失败均不留下记录与文件的不一致；会话删除不触及正式数据 | AC-04.4, 09.4 | 记录与文件一一对应 | 引用 `tests/services/test_resume_service_faults.py::test_failure_inside_transaction_rolls_back_everything`；`tests/services/test_session_service_delete.py::test_saved_session_leaves_resumes_and_archive_untouched`。✅ 引用单测 | 新 |
| TC-RES-013-BL-03 | B-06 | 测试只用合成数据，模型调用全部 mock，禁止真实外发 | AC-06.6 | 出站套接字被拒绝 | 引用 `tests/conftest.py::_forbid_network`（autouse）。✅ 引用单测 | 新 |
| TC-RES-013-SE-04 | 会话归属（ADR-008） | 表驱动：每个会话接口（读取、更新、确认、消息、应用、取消、删除、确认更新）对他人会话均返回同一 404 且无副作用 | AC-05.7 | 9 行表驱动，全部 404 | 引用 `tests/e2e/test_redlines.py::test_another_browser_gets_one_404_and_changes_nothing`；`tests/repositories/test_session_repository.py::test_every_method_addressing_a_session_requires_browser_hash`。✅ 引用单测 | 新 |
| TC-RES-013-SE-05 | 浏览器标识（ADR-008） | 库内只存 SHA-256；明文标识不入库、不入日志 | AC-05.2, 06.3 | `SELECT browser_hash` 为 64 位十六进制 | 引用 `tests/e2e/test_redlines.py::test_browser_identifier_is_stored_only_as_a_hash`；`tests/repositories/test_session_repository.py::test_plain_browser_id_is_never_stored`。✅ 引用单测 | 新 |

---

## 覆盖追溯矩阵

### 验收标准覆盖（REQ-BE-01 ~ 09，共 60 条 AC，按 requirements.md v2.0）

| AC 编号 | AC 描述（摘要） | 覆盖用例 | 状态 |
|---|---|---|---|
| AC-01.1 | 接收 PDF / JPG / JPEG / PNG，≤ 10 MB | 001-HP-01, 001-HP-02, 001-DB-01, 008-HP-02 | ✅ 已覆盖 |
| AC-01.2 | 拒绝不支持类型、超限、空文件、魔数不符，不调模型 | 001-PV-01 ~ 05, 001-BL-02, 001-EH-01, 008-EH-01 | ✅ 已覆盖 |
| AC-01.3 | 服务端命名落盘，不用用户文件名 | 001-BL-01, 001-DB-02 | ✅ 已覆盖 |
| AC-01.4 | 每次请求只接受一个文件 | 001-PV-06（观测 + 静态） | ⚠ 部分覆盖（见观察 1） |
| AC-01.5 | 成功上传新建会话；无有效标识则签发 | 001-HP-01, 001-HP-04, 001-HP-05 | ✅ 已覆盖 |
| AC-01.6 | 不动其他会话；失败不建会话、不改 Cookie | 001-HP-04, 001-EH-01 | ✅ 已覆盖 |
| AC-02.1 | 仅经 clients 调 deepseek-flash，直接提交 PDF 或图片 | 007-HP-01 ~ 03, 007-BL-04, 008-HP-02 | ✅ 已覆盖 |
| AC-02.2 | 字段状态 recognized / uncertain / missing | 001-HP-03, 008-HP-03 | ✅ 已覆盖 |
| AC-02.3 | 结构不合法或无依据的值降级，不猜测补全 | 001-BL-03, 001-BL-04 | ✅ 已覆盖 |
| AC-02.4 | 超过 60 秒返回超时业务码 | 001-EH-02, 007-EH-01, 007-EH-06 | ✅ 已覆盖 |
| AC-02.5 | 模型不可用或拒绝则阻断，不回退 | 001-EH-02, 007-BL-06, 007-EH-02 ~ 04 | ✅ 已覆盖 |
| AC-02.6 | 同步返回会话标识、候选值与字段状态 | 001-HP-01, 008-HP-02 | ✅ 已覆盖 |
| AC-03.1 | 按会话标识读取，不属于本浏览器按不存在处理 | 002-HP-01, 002-SE-01, 008-HP-04 | ✅ 已覆盖 |
| AC-03.2 | 提交的字段置 confirmed，未提交字段保持原状 | 003-HP-01, 003-HP-03, 003-BL-02, 003-EH-02, 008-HP-05 | ✅ 已覆盖 |
| AC-03.3 | 多条子项新增、修改、删除 | 003-HP-02 | ✅ 已覆盖 |
| AC-03.4 | 字段级错误 details，不回显值 | 003-PV-01 ~ 07, 003-BL-01, 003-SE-01 | ✅ 已覆盖 |
| AC-03.5 | 写入刷新活动时间，读取不刷新 | 003-BL-03, 002-HP-02 | ✅ 已覆盖 |
| AC-03.6 | saved 会话拒绝修改 | 003-BL-04 | ✅ 已覆盖 |
| AC-04.1 | 无明确确认不写正式库，不返回成功 | 004-PV-01, 013-BL-01 | ✅ 已覆盖 |
| AC-04.2 | 核心三项缺失或非法则拒绝，返回字段级错误 | 004-PV-02, 004-PV-03, 004-DB-01 | ✅ 已覆盖 |
| AC-04.3 | 先文件（临时名）、后单事务写库、提交后重命名 | 004-HP-01, 004-BL-02, 004-BL-03, 004-BL-05, 008-HP-06 | ✅ 已覆盖 |
| AC-04.4 | 失败补偿，无孤立文件或记录；启动对账清理残留 | 004-EH-03 ~ 05, 005-BL-01 ~ 03, 008-EH-02 | ✅ 已覆盖 |
| AC-04.5 | 幂等键为规范化的姓名 + 手机号 + 邮箱，正式库唯一约束 | 004-HP-03, 004-BL-04, 004-BL-06, 004-DB-02 | ✅ 已覆盖 |
| AC-04.6 | 命中幂等键返回 200 already_saved，会话保留为更新候选 | 004-HP-02, 004-BL-07, 008-HP-07 | ✅ 已覆盖 |
| AC-04.7 | 首次保存 201，会话置 saved，删除临时文件，不清除 Cookie | 004-HP-01, 004-EH-06, 002-EH-03, 008-HP-06 | ✅ 已覆盖 |
| AC-04.8 | 会话不存在或不属于本浏览器返回 404；已保存再确认拒绝 | 004-EH-01, 004-EH-02 | ✅ 已覆盖 |
| AC-04.9 | 无直接修改或删除已确认记录的接口 | 004-BL-08, 011-BL-01 | ✅ 已覆盖 |
| AC-05.1 | 草稿库与正式库分离，确认前不写正式库 | 001-BL-05, 004-BL-01, 005-HP-01 | ✅ 已覆盖 |
| AC-05.2 | HttpOnly Cookie browser_id，随机值，库内只存哈希 | 001-HP-01, 002-EH-02, 013-SE-05 | ✅ 已覆盖 |
| AC-05.3 | 会话列表：本浏览器、倒序、无标识返回空 | 001-HP-05, 010-HP-01, 010-EH-01 | ✅ 已覆盖 |
| AC-05.4 | 读取会话返回字段、对话、原文件信息与状态 | 002-HP-03, 009-HP-01 | ✅ 已覆盖 |
| AC-05.5 | 不自动清理会话；启动只清扫无引用临时文件 | 002-EH-04（清扫侧）, 006-BL-02 ~ 06, 006-EH-01, 008-EH-02 | ✅ 已覆盖 |
| AC-05.6 | 手动删除 reviewing（全删）与 saved（不触及正式数据），204 | 010-BL-01, 010-BL-02 | ✅ 已覆盖 |
| AC-05.7 | 不存在与不属于本浏览器返回同一 404 | 002-EH-01, 003-EH-01, 010-EH-02, 008-EH-01, 013-SE-04 | ✅ 已覆盖 |
| AC-06.1 | 密钥只从环境变量读取 | 013-SE-01, 008-SE-02 | ✅ 已覆盖 |
| AC-06.2 | 只经 clients 向 deepseek-flash 外发 | 013-SE-02, 007-BL-04, 007-BL-05 | ✅ 已覆盖 |
| AC-06.3 | 日志与错误响应不含个人数据、标识、对话内容（白名单） | 013-SE-03, 001-SE-01, 003-SE-01, 004-SE-01, 009-SE-02, 008-SE-01 | ✅ 已覆盖 |
| AC-06.4 | /api/v1 前缀、snake_case、ISO 8601 UTC、统一错误体 | 001-HP-06, 001-SE-02 | ✅ 已覆盖 |
| AC-06.5 | OpenAPI 先行，冻结后供 frontend 对齐 | 001-HP-06, 004-BL-08 | ✅ 已覆盖 |
| AC-06.6 | 测试只用合成数据，模型调用一律 mock | 013-BL-03 | ✅ 已覆盖 |
| AC-07.1 | 对话仅经 clients，只发结构化字段，最近 20 条与本条消息，≤ 2000 字符 | 007-HP-04, 007-BL-08, 009-PV-01, 008-CH-01 | ✅ 已覆盖 |
| AC-07.2 | 固定结构解析；失败返回 chat_failed 且不落库 | 007-EH-08, 009-EH-01, 009-EH-02 | ✅ 已覆盖 |
| AC-07.3 | 只接受白名单字段，三类经历字段建议丢弃 | 009-BL-01 | ✅ 已覆盖 |
| AC-07.4 | 字段规则校验，不合规标记不可应用并附原因，不回显值 | 009-BL-02 | ✅ 已覆盖 |
| AC-07.5 | 三项新值须出现在本条消息中；与当前值相同则丢弃 | 009-BL-03 | ✅ 已覆盖 |
| AC-07.6 | 单事务保存消息、回复与建议；原值取读取时的当前值 | 009-HP-01, 008-CH-01 | ✅ 已覆盖 |
| AC-07.7 | 应用全有全无并置 applied；取消置 cancelled 且字段不变 | 009-HP-02, 009-HP-03, 009-BL-05 | ✅ 已覆盖 |
| AC-07.8 | 对话不提供保存或确认动作 | 009-BL-04, 012-BL-04 | ✅ 已覆盖 |
| AC-07.9 | saved 会话拒绝对话 | 009-EH-03 | ✅ 已覆盖 |
| AC-07.10 | 提示词限定范围，拒答范围外问题；分隔标记消毒 | 009-SE-01（分隔与消毒）；范围外拒答未自动化 | ⚠ 部分覆盖（见观察 2） |
| AC-08.1 | 归档列表：全部记录，倒序，不分页 | 011-HP-01 | ✅ 已覆盖 |
| AC-08.2 | 归档详情：完整字段值、原文件信息、可用标志 | 011-HP-01 | ✅ 已覆盖 |
| AC-08.3 | 文件只按库内路径读取，拒绝符号链接，缺失返回专用码 | 011-HP-02, 011-EH-01, 011-SE-01 | ✅ 已覆盖 |
| AC-08.4 | 无修改、删除接口；仅本机监听 | 011-BL-01 | ✅ 已覆盖 |
| AC-09.1 | 有候选时返回已有记录与候选内容供前端比较 | 002-HP-03, 004-HP-02, 012-HP-02, 008-HP-07 | ✅ 已覆盖 |
| AC-09.2 | 只有显式 confirm_update=true 才写入 | 012-PV-01, 012-EH-01, 008-HP-08 | ✅ 已覆盖 |
| AC-09.3 | 校验后整体覆盖记录；id、幂等键、首次保存时间不变 | 012-HP-01, 012-BL-01, 008-HP-08 | ✅ 已覆盖 |
| AC-09.4 | 唯一版本名先提升、再事务覆盖、后删旧文件；失败保持记录；对账清理 | 012-EH-02, 012-BL-03, 005-BL-07 | ✅ 已覆盖 |
| AC-09.5 | 成功返回记录 id 与时间；已应用后幂等 | 012-HP-01, 012-BL-02 | ✅ 已覆盖 |
| AC-09.6 | 对话内容不触发更新；候选期间不开放对话 | 012-BL-04, 009-BL-04 | ✅ 已覆盖 |

### 本 Workbench 附加追溯维度

- **接口覆盖**：OpenAPI 0.2.0 的 13 个接口全部有用例（会话 4：创建、列表、读取、删除；分区更新 1；对话 3：发送、应用、取消；确认保存与确认更新 2；归档 3）。契约测试覆盖全部 54 个（path、method、status）三元组。
- **错误码覆盖**：19 个 `ErrorCode` 均由 `tests/contract/test_openapi_conformance.py` 通过真实响应产生；上传、会话、对话、更新与归档相关码另有上表用例。
- **业务规则覆盖**：B-01 ~ B-06 与会话归属（ADR-008）见 §13；B-04、B-05 同时有数据层（SQLite、文件目录）断言。

---

## 覆盖率统计

| 维度 | 总数 | 已覆盖 | 覆盖率 |
|------|------|--------|--------|
| 验收标准（AC） | 60 | 60（其中 2 条部分覆盖：AC-01.4、AC-07.10） | 100%（有用例）；完整覆盖 58/60 = 96.7% |
| 接口 | 13 | 13 | 100% |
| 错误码（ErrorCode） | 19 | 19 | 100%（契约测试产生） |
| 红线 B-01 ~ B-06 与会话归属 | 7 | 7 | 100% |
| 用例（文档内，按 ID 去重） | 170 | — | 见下 |
| 其中：引用已有单测 | 154 | — | — |
| 其中：真实演练实测 | 14 | — | — |
| 其中：静态 | 0 | — | — |
| 其中：跟踪（无自动化引用） | 2 | — | — |
| 新增 pytest 用例 | 0 | — | — |

**新增 pytest 为 0 的理由**：v2 的 60 条 AC 与红线均能由现存测试引用覆盖。剩余两处缺口（AC-01.4 的显式拒绝、AC-07.10 的范围外拒答语义）不属于可由新增断言闭合的问题：前者需要业务决策，后者需要真实模型判读。按防止过度规则，不为缺口凑测试。

---

## 执行汇总

| 项目 | 结果 |
|---|---|
| 全量 pytest（`uv run pytest -q`） | 976 passed，1 warning（FastAPI TestClient 弃用提示），12.02 s |
| 静态检查 | `uv run ruff check .` 通过；`uv run ruff format --check .` 通过（修正后）；`scripts/self_test_live.py` 编译通过 |
| 真实演练（第 8 节，第 2 次采纳） | 14 项 OK / 0 NG；3 次模型调用，prompt_tokens 3,752，completion_tokens 2,128 |
| 真实演练（第 1 次） | 13 OK / 1 NG（TC-RES-008-HP-07，脚本断言缺陷，已修正；业务代码未改） |
| 演练后清理 | 进程已停止（退出码 0）；8000 端口已释放；临时 DATA_DIR/FILE_DIR 已删除；结果临时文件已删除 |
| 脚本改动 | 提交 `e5e7e74`：样品改为脚本内生成的合成简历，移除 `--sample`/`--truth` 参数，新增 token 用量计数（仅数字） |

---

## 变更对照（v1 → v2）

**删除**

| v1 用例 | 删除理由 |
|---|---|
| 002-DB-01（7 天边界读取） | 7 天 TTL 取消（ADR-008），无过期概念 |
| 003-HP-04（同一 PATCH 重复提交） | 非 AC、非红线的幂等细节，按防止过度规则删除；幂等写入由 003-BL-03 与 003-EH-02 间接覆盖 |
| 006-BL-01（7 天边界清理） | 无 TTL 清理 |
| 006-BL-05 中的"调度线程按间隔清理"语义 | 取消后台线程；替换为 006-BL-05（无线程） |

**降级为跟踪**

| v1 用例 | 去向 |
|---|---|
| 001-EH-03（上传写库失败清理临时文件） | 无 v2 自动化引用，登记跟踪；非 AC 明示项，非红线 |

**改写（编号保留，语义变化）**：001-HP-01/04/05/06、001-PV-01 ~ 05、001-BL-05、001-SE-01、002-HP-02、002-EH-02/03/04、003-PV-01、003-BL-01/02/03、004-HP-01/02、004-PV-01/02、004-BL-01/02/05/07、004-EH-01/02/03/06、004-SE-01、005-HP-01/02、006-BL-04、006-EH-01、008 全部（真实样品 → 合成样品）。

**测试代码**：v1 的 `tests/selftest/`（DL 2026-11-11 决定删除，v2 后失效）不再引用；v1 所有"自动化"字段已改为现存测试的引用。

---

## 观察与遗留风险（非本自测失败项）

1. **AC-01.4（一次一个文件）**：同一请求带两个 `file` 部件时，框架绑定其一，另一个被静默忽略（TC-RES-001-PV-06，v1 观测结果在 v2 仍成立）。需求只说"只接受一个文件"，未规定显式拒绝；契约也未规定。是否改为 400 需要 DL 决定，若改则属于契约变更，需经 cross-workbench-reviewer。
2. **AC-07.10（范围外拒答）**：提示词约束与分隔消毒有单元测试；真实模型是否拒答范围外问题只能人工判读。第 8 节只发送了一条概括类问题，未判定拒答效果。建议 DL 抽查，或在 11q 的语义用例中覆盖。
3. **建议应用路径未经真实模型验证**：第 8 节真实对话返回 0 条建议，`apply` 与 `cancel` 仅由桩数据覆盖（009-HP-02、009-HP-03）。
4. **TC-RES-002-EH-04（读取超过 7 天的会话）**：只有清扫侧的引用，读取侧无直接用例，已登记跟踪。
5. **上传写库失败的临时文件清理**（TC-RES-001-EH-03）：无自动化用例，已登记跟踪。
6. **真实模型偶发失败**（v1 观察：约 50 次调用中 2 次 502 parse_failed、1 次 504）：本次 3 次调用全部成功，未再出现。脚本对 5xx 有一次显式测试级重试，服务端本身不重试。
7. **第 1 次演练 NG**：脚本断言误判（设计要求候选会话保留临时文件），已修正；此为脚本缺陷，不是业务缺陷。

---

## 遗漏场景（PRD / 设计 vs 自测）

- 设计 §9.6 声明不在自动化范围：性能与并发压测（约 5 人并发，design 3a 保留项）、磁盘加密与部署权限（2a 保留项）、浏览器 Cookie 续期行为（frontend 实测）。
- 归档中"未知 resume_id"与对话中"建议不可应用"两个错误码，只由契约测试产生，没有单独的端到端用例。

---

## 查询变量速查表

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `{变量:sessionId}` | 会话标识 | 上传响应 `session_id` |
| `{变量:browserHash}` | 浏览器标识的 SHA-256（库内只存此值） | `SELECT browser_hash FROM sessions` |
| `{变量:messageId}` | 对话消息标识 | 发送消息响应 `user_message` / `assistant_message` |
| `{变量:resumeId}` | 简历记录标识 | 确认保存响应 `resume_id` |
| `DATA_DIR` / `FILE_DIR` | 会话库与临时文件目录 / 归档目录 | 环境变量；自动化测试与演练使用独立临时目录 |
