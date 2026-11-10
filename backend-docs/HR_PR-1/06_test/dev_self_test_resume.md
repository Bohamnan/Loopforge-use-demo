# 开发自测用例 — 简历信息收集（backend Workbench，HR_PR-1）

> **模式：开发自测（白盒）**
> 每条用例含接口断言与 SQLite / 文件目录数据验证；变量用 `{变量:xxx}` 标记供造数脚本使用。执行结果已回填（见各用例“执行结果”）。

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本：123 条用例，已全部执行并回填结果 | Yin Yang（backend） |

## 文档信息

| 项目 | 内容 |
|------|------|
| 需求文档 | `backend-docs/HR_PR-1/01_requirements/requirements.md`（REQ-BE-01 ~ 06，37 条 AC） |
| PRD | `01-requirements/HR_PR-1/prd.md` |
| Workbench 设计文档 | `backend-docs/HR_PR-1/03_api/api_design_resume.md`、`openapi.yaml`（0.1.1）、`04_design/design.md`、`02_schema/sql_ddl_resume.md` |
| 测试范围 | 接口①②③④、启动对账、草稿清理、模型调用（含 1 MB 预算、B-04/B-05/B-06）、真实进程端到端；tasks.md 全部 21 个任务已实现 |
| 测试环境 | 本机 dev；独立临时 DATA_DIR/FILE_DIR；假模型 / `httpx.MockTransport`；第 8 节为真实 uvicorn（127.0.0.1:8000，单 worker）+ 真实 deepseek-flash |

## 用例编号规则

`TC-RES-{单元}-{场景}-{序号}`。单元：001 接口①、002 接口②、003 接口③、004 接口④、005 启动对账、006 草稿清理、007 模型调用、008 真实进程与真实样品。场景：HP 正向 / PV 校验 / BL 业务逻辑 / EH 错误处理 / DB 数据边界 / SE 安全性。

## 数据源与执行方式

| 数据源 | 说明 |
|---|---|
| SQLite | `drafts.db`（drafts）与 `resumes.db`（resumes、resume_work_experiences、resume_project_experiences、resume_educations），测试中直接用 sqlite3 查询 |
| 原始文件目录 | `file/`（归档）与 `data/drafts/`（草稿临时文件），只用合成占位文件；第 8 节例外：DL 本人简历样品，仅放 `/tmp`，不入库，报告只写脱敏结论 |
| 对外调用 | 第 1~7 节一律 mock（禁网夹具生效，B-06）；第 8 节真实调用 DeepSeek（DL 已批准发送） |
| 自动化脚本 | `codes/hr-collection-agent-backend/tests/selftest/`（pytest，用例函数名 `test_tc_res_<单元>_<场景>_<序号>`）；`codes/hr-collection-agent-backend/scripts/self_test_live.py`（真实进程，不被 pytest 收集） |
| 复跑命令 | `uv run pytest tests/selftest`；真实进程：`set -a; . ./.env; set +a; PYTHONPATH=src:. uv run python scripts/self_test_live.py --sample <样品> --truth <真值JSON> --out <结果JSON>` |

## 用例统计

| 场景类型 | 代码 | 用例数 |
|---------|------|-------|
| 正向路径 | HP | 27 |
| 参数校验 | PV | 16 |
| 业务逻辑 | BL | 35 |
| 错误处理 | EH | 27 |
| 数据边界 | DB | 9 |
| 安全性 | SE | 9 |
| 合计 | — | 123 |

执行结果汇总见文末“执行汇总”。

---

## 1、接口① 上传简历并解析 — POST /api/v1/resume-drafts

#### TC-RES-001-HP-01：上传合法 PDF，创建草稿与令牌

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1, AC-01.3, AC-01.5, AC-02.6, AC-05.2 |
| 步骤/输入 | POST /api/v1/resume-drafts，multipart file=cv.pdf（合成，300 B，application/pdf） |
| 预期 | 201；键集合 draft_id/original_file/fields/created_at/updated_at/expires_at；fields 22 键；Set-Cookie 属性 `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` 且无 Secure；resumes 无新增 |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT id, token_hash, file_path, content_type, file_size FROM drafts WHERE id='{变量:draftId}'; -- token_hash = sha256(Cookie 值)；file_path = <id>.pdf；data/drafts/<id>.pdf 内容与上传逐字节一致`

#### TC-RES-001-HP-02：上传 JPG/JPEG/PNG（魔数合法）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1 |
| 步骤/输入 | 分别上传 a.jpg、a.JPEG、a.png（合成头部字节） |
| 预期 | 三者均 201；content_type 分别为 image/jpeg、image/jpeg、image/png；落盘扩展名 .jpg/.jpg/.png |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT content_type, file_path FROM drafts; -- 与上传类型一致`

#### TC-RES-001-HP-03：字段状态三态与空值不变式

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.2, AC-02.6 |
| 步骤/输入 | 假模型返回 recognized / uncertain（current_city）/ missing（homepage）并省略 gender |
| 预期 | name=recognized；current_city=uncertain 且非空；homepage 与缺键的 gender 为 missing 且值为 null；列表字段 missing ⇔ []；无 confirmed |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts WHERE id='{变量:draftId}'; -- 无 "confirmed"`

#### TC-RES-001-HP-04：带有效旧令牌重传，旧草稿被立即删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.6 |
| 步骤/输入 | 先上传一次，再带 Cookie 上传 second.pdf |
| 预期 | 201；Cookie 换新；drafts 仅剩新行；data/drafts 仅新文件 |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT id FROM drafts; -- 仅 {变量:newDraftId}；ls data/drafts 仅 <newDraftId>.pdf`

#### TC-RES-001-HP-05：两个浏览器各自上传，各得独立草稿与令牌

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.5 |
| 步骤/输入 | 两个 Cookie 罐各上传一次 |
| 预期 | draft_id、令牌均不同；drafts 2 行；各自 GET 只读到自己的草稿 |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 2`

#### TC-RES-001-HP-06：运行中的应用与冻结 OpenAPI 0.1.1 一致

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.4, AC-06.5 |
| 步骤/输入 | 读取 backend-docs/.../openapi.yaml 与 app.openapi() 比对 |
| 预期 | info.version=0.1.1；(path, method, operationId) 集合相等；路径均以 /api/v1/ 开头 |
| 自动化 | tests/selftest/ `test_tc_res_001_hp_06` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 契约比对断言`

#### TC-RES-001-PV-01：缺少 file 部分

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | POST 空 multipart |
| 预期 | 400 file_missing；不调模型；无草稿 |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0；假模型调用数 0`

#### TC-RES-001-PV-02：扩展名不在白名单（.exe）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | 上传 x.exe |
| 预期 | 415 unsupported_file_type；不调模型；无草稿无文件 |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0；data/drafts 为空`

#### TC-RES-001-PV-03：空文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | 上传 0 字节 e.pdf |
| 预期 | 400 file_empty；不调模型 |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-001-PV-04：魔数与扩展名不符（PNG 内容命名 .pdf）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | 上传 fake.pdf（PNG 头） |
| 预期 | 400 file_content_mismatch；不调模型 |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-001-PV-05：超过 10 MB

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | 上传 10 MiB+1 字节 PDF |
| 预期 | 413 file_too_large；不调模型；无草稿无文件 |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0；data/drafts 为空`

#### TC-RES-001-PV-06：同一请求带两个 file 部分

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.4 |
| 步骤/输入 | multipart 含两个 file 字段 |
| 预期 | 观测：框架只绑定其中一个，201；仍只产生 1 条草稿、1 个文件（一份简历只关联一个文件） |
| 自动化 | tests/selftest/ `test_tc_res_001_pv_06` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 1；ls data/drafts 1 个文件`

#### TC-RES-001-BL-01：用户文件名不参与落盘路径

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.3 |
| 步骤/输入 | 文件名 `../../etc/zz-evil name.pdf` |
| 预期 | 201；落盘名 <draft_id>.pdf；DATA_DIR 之外未生成任何路径 |
| 自动化 | tests/selftest/ `test_tc_res_001_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT file_path FROM drafts; -- <draftId>.pdf`

#### TC-RES-001-BL-02：类型以魔数为准，忽略客户端 Content-Type

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2 |
| 步骤/输入 | PDF 内容 + Content-Type=image/png |
| 预期 | 201；original_file.content_type = application/pdf |
| 自动化 | tests/selftest/ `test_tc_res_001_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT content_type FROM drafts; -- application/pdf`

#### TC-RES-001-BL-03：模型自报 confirmed/未知状态一律降为 uncertain（B-04，提示注入）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.3 |
| 步骤/输入 | 假模型返回 name 状态 confirmed、skills 含“忽略指令”文本且状态 bogus、gender 状态 weird |
| 预期 | 响应中无 confirmed；这三项为 uncertain；resumes 无记录 |
| 自动化 | tests/selftest/ `test_tc_res_001_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0`

#### TC-RES-001-BL-04：超长/类型不符的模型值降级，不猜测补全

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.3 |
| 步骤/输入 | self_evaluation 6000 字符；job_title 返回数组 |
| 预期 | self_evaluation 截断 ≤5000 且 uncertain；job_title 为 uncertain/missing；库中无 confirmed |
| 自动化 | tests/selftest/ `test_tc_res_001_bl_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts; -- 无 "confirmed"`

#### TC-RES-001-BL-05：上传不写正式库（B-04/C-12）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.1 |
| 步骤/输入 | 上传一次 |
| 预期 | resumes=0、file/ 为空；resumes.db 中无 drafts 表 |
| 自动化 | tests/selftest/ `test_tc_res_001_bl_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0；SELECT name FROM sqlite_master WHERE name='drafts'; -- 空`

#### TC-RES-001-EH-01：解析失败不改动旧草稿与 Cookie（O-02）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.6, AC-02.5 |
| 步骤/输入 | 已有草稿；假模型抛 ParseFailedError 后再上传 |
| 预期 | 502 parse_failed；无 Set-Cookie；旧令牌仍有效；drafts 仍为旧行；无新临时文件 |
| 自动化 | tests/selftest/ `test_tc_res_001_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT id FROM drafts; -- 仍为 {变量:oldDraftId}；ls data/drafts 仅旧文件`

#### TC-RES-001-EH-02：模型不可用/超时的错误映射

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.4, AC-02.5 |
| 步骤/输入 | 假模型分别抛 ParseUnavailableError、ParseTimeoutError |
| 预期 | 503 parse_unavailable；504 parse_timeout；无草稿、无临时文件、GET 为 404 |
| 自动化 | tests/selftest/ `test_tc_res_001_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-001-EH-03：草稿写库失败时清理临时文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1 |
| 步骤/输入 | monkeypatch DraftRepository.insert 抛 OperationalError |
| 预期 | 500 internal_error，响应不含内部细节；data/drafts 为空；drafts=0 |
| 自动化 | tests/selftest/ `test_tc_res_001_eh_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-001-DB-01：大小边界 10485760 / +1

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1, AC-01.2 |
| 步骤/输入 | 上传恰 10 MiB 与 10 MiB+1 |
| 预期 | 前者 201 且 size_bytes=10485760；后者 413 |
| 自动化 | tests/selftest/ `test_tc_res_001_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT file_size FROM drafts; -- 仅 10485760`

#### TC-RES-001-DB-02：原文件名超长（300 字符）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.3 |
| 步骤/输入 | 文件名 300 字符 + .pdf |
| 预期 | 201；展示名 ≤255 字符；库内 ≤255 |
| 自动化 | tests/selftest/ `test_tc_res_001_db_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT length(original_filename) FROM drafts; -- ≤255`

#### TC-RES-001-DB-03：极小合法文件（5 字节 `%PDF-`）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1 |
| 步骤/输入 | 上传 5 字节 |
| 预期 | 201；size_bytes=5 |
| 自动化 | tests/selftest/ `test_tc_res_001_db_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT file_size FROM drafts; -- 5`

#### TC-RES-001-SE-01：日志/stdout 不含姓名、手机号、邮箱、文件名、令牌及其哈希；库不存令牌明文（B-03）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3, AC-05.2 |
| 步骤/输入 | 上传、GET、空文件上传后抓取全部日志 |
| 预期 | 不出现 ZZSECRETNAME/13911112222/邮箱/文件名/令牌/SHA-256；*.db 字节中无令牌明文 |
| 自动化 | tests/selftest/ `test_tc_res_001_se_01` |
| 执行结果 | ✅ 通过 |

数据验证：`grep 日志与 *.db 字节；SELECT token_hash FROM drafts; -- 为 64 位十六进制而非令牌`

#### TC-RES-001-SE-02：错误响应不含文件名且只有约定键

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3, AC-06.4 |
| 步骤/输入 | 空文件上传，文件名含标记 |
| 预期 | 响应不含文件名；键 ⊆ {code,message,request_id,details} |
| 自动化 | tests/selftest/ `test_tc_res_001_se_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

## 2、接口② 读取当前草稿 — GET /api/v1/resume-drafts/current

#### TC-RES-002-HP-01：凭 Cookie 读取草稿并续期

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.1, AC-05.3 |
| 步骤/输入 | 上传后 GET /api/v1/resume-drafts/current |
| 预期 | 200；draft_id 与 fields 同上传；无“下一个字段/提问文案”键；Set-Cookie 同值且 Max-Age=604800 |
| 自动化 | tests/selftest/ `test_tc_res_002_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT id FROM drafts WHERE id='{变量:draftId}';`

#### TC-RES-002-HP-02：读取刷新最近活动时间，expires_at = 活动时间 + 7 天

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.5 |
| 步骤/输入 | 上传后时钟前进 3 天再 GET |
| 预期 | last_active_at=+3 天；created_at 不变；expires_at=+10 天 |
| 自动化 | tests/selftest/ `test_tc_res_002_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT last_active_at, created_at FROM drafts WHERE id='{变量:draftId}';`

#### TC-RES-002-EH-01：无 Cookie 读取

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.4 |
| 步骤/输入 | 直接 GET |
| 预期 | 404 draft_not_found；体仅 code/message/request_id |
| 自动化 | tests/selftest/ `test_tc_res_002_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-002-EH-02：伪造令牌

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.4 |
| 步骤/输入 | Cookie draft_token=not-a-real-token |
| 预期 | 404 draft_not_found |
| 自动化 | tests/selftest/ `test_tc_res_002_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-002-EH-03：确认后令牌作废

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.4, AC-04.7 |
| 步骤/输入 | 上传→确认→GET |
| 预期 | GET 404；drafts=0 |
| 自动化 | tests/selftest/ `test_tc_res_002_eh_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-002-EH-04：草稿过期（>7 天，清理尚未运行）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.4 |
| 步骤/输入 | 时钟前进 8 天后 GET |
| 预期 | 404 draft_not_found，无任何字段 |
| 自动化 | tests/selftest/ `test_tc_res_002_eh_04` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-002-DB-01：7 天边界

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.4 |
| 步骤/输入 | 恰 7 天 GET → 200；再过 7 天+1 秒 → 404 |
| 预期 | 7 天整仍可读，超 1 秒不可读（与清理同一规则） |
| 自动化 | tests/selftest/ `test_tc_res_002_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT last_active_at FROM drafts;`

#### TC-RES-002-SE-01：草稿按令牌隔离

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.3, AC-05.4 |
| 步骤/输入 | 两个浏览器各自上传不同姓名 |
| 预期 | 各自只读到自己的；无 Cookie 的客户端 404 |
| 自动化 | tests/selftest/ `test_tc_res_002_se_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

## 3、接口③ 提交校对结果 — PATCH /api/v1/resume-drafts/current

#### TC-RES-003-HP-01：部分更新：出现的字段置 confirmed，未出现保持原状

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | PATCH {phone, skills} |
| 预期 | 200；两字段 confirmed 且值为提交值；name 仍 recognized；Set-Cookie 续期；库中已写入 |
| 自动化 | tests/selftest/ `test_tc_res_003_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts WHERE id='{变量:draftId}'; -- 含新手机号`

#### TC-RES-003-HP-02：多条子项整体替换：新增/修改/删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.3 |
| 步骤/输入 | 先提交 3 条工作经历，再提交 2 条（改第 1 条、删第 2/3 条、新增 1 条） |
| 预期 | 第二次响应为 2 条且顺序/内容为提交值；GET 同值；区块状态 confirmed |
| 自动化 | tests/selftest/ `test_tc_res_003_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts; -- work_experiences 2 条`

#### TC-RES-003-HP-03：确认留空：标量 null、列表 []

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | PATCH {job_title:null, skills:[], educations:[]} |
| 预期 | 三项值为 null/[]/[]，状态 confirmed |
| 自动化 | tests/selftest/ `test_tc_res_003_hp_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts;`

#### TC-RES-003-HP-04：幂等：同一请求重复提交结果相同

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | 连续两次提交相同 body |
| 预期 | 两次响应 fields 完全一致 |
| 自动化 | tests/selftest/ `test_tc_res_003_hp_04` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-01：手机号/邮箱格式非法（含多错一次返回）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | phone=12、+123、email 无 @、两者同时非法（用不易与 request_id 混淆的标记值） |
| 预期 | 422 validation_failed；details 只含 field+reason（invalid_format），不回显值；库未改动 |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts; -- 与请求前相同`

#### TC-RES-003-PV-02：手机号带空格/连字符被兜底去除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | 138 0013 8000、138-0013-8000、+852 1234 5678、+85212345678 |
| 预期 | 均 200 |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-03：空 fields

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | PATCH {"fields":{}} |
| 预期 | 422；details 含 {field:fields, reason:required} |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_03` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-04：未知字段

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | fields.hobby=... |
| 预期 | 422；reason=unknown_field；不回显值 |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_04` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-05：核心三项不可空/全空白

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4, AC-04.2 |
| 步骤/输入 | name/phone/email 分别为 "   "；name=null |
| 预期 | 422；reason=required |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_05` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-06：长度/条数超限

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | name 101 字；self_evaluation 5001；skills 51 项；work_experiences 21 条 |
| 预期 | 均 422，reason=too_long |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_06` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-PV-07：类型错误与非法请求体

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | skills="not-a-list"；body 非 JSON；body={} |
| 预期 | 422；invalid_type / 校验失败 |
| 自动化 | tests/selftest/ `test_tc_res_003_pv_07` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-BL-01：校验失败不产生部分写入

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | 一个字段合法、一个非法的同一请求 |
| 预期 | 422；fields_json 与 updated_at 均不变 |
| 自动化 | tests/selftest/ `test_tc_res_003_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json, updated_at FROM drafts; -- 前后一致`

#### TC-RES-003-BL-02：更新只写草稿库，不写正式库（B-04）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | PATCH 核心三项 |
| 预期 | resumes=0，file/ 为空 |
| 自动化 | tests/selftest/ `test_tc_res_003_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0`

#### TC-RES-003-BL-03：更新刷新 last_active_at / updated_at

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.5 |
| 步骤/输入 | 时钟前进 2 天后 PATCH |
| 预期 | 两者=+2 天；created_at 不变 |
| 自动化 | tests/selftest/ `test_tc_res_003_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT last_active_at, updated_at, created_at FROM drafts;`

#### TC-RES-003-EH-01：无/伪造令牌更新

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.8 |
| 步骤/输入 | 无 Cookie；Cookie=forged |
| 预期 | 404 draft_not_found |
| 自动化 | tests/selftest/ `test_tc_res_003_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-EH-02：并发更新不同字段互不丢失

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | 两线程同时 PATCH skills 与 languages |
| 预期 | 均 200；GET 同时含两个新值 |
| 自动化 | tests/selftest/ `test_tc_res_003_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT fields_json FROM drafts;`

#### TC-RES-003-DB-01：字段边界

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.4 |
| 步骤/输入 | name 100/101；phone +123456 / +1234567890123456 / +12345；skills 50×1000 字 |
| 预期 | 100✓101✗；6 位国际号✓、16 位✗、5 位✗；50×1000✓ |
| 自动化 | tests/selftest/ `test_tc_res_003_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-003-SE-01：校验错误的响应与日志不含提交值

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3 |
| 步骤/输入 | phone/email 提交含标记的非法值 |
| 预期 | 响应与日志均不含标记值 |
| 自动化 | tests/selftest/ `test_tc_res_003_se_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 抓取日志`

## 4、接口④ 确认保存 — POST /api/v1/resumes

#### TC-RES-004-HP-01：首次确认：201，记录+文件+草稿清理

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.3, AC-04.7, AC-01.1 |
| 步骤/输入 | 上传→POST /api/v1/resumes {confirmed:true} |
| 预期 | 201 already_saved=false；Set-Cookie `draft_token=; …; Max-Age=0`；file/ 恰 1 个 <id>.pdf 且与上传逐字节一致；草稿行与草稿文件已删；再 GET 404 |
| 自动化 | tests/selftest/ `test_tc_res_004_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT file_path, original_filename, content_type, file_size FROM resumes WHERE id='{变量:resumeId}'; -- file_path=<id>.pdf；SELECT count(*) FROM drafts; -- 0`

#### TC-RES-004-HP-02：同一人再次确认：200 already_saved

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5, AC-04.6 |
| 步骤/输入 | 确认后再上传同一人并确认 |
| 预期 | 200，resume_id/saved_at 同首次；resumes 仍 1 行；file/ 仍 1 个文件；草稿与 Cookie 清除 |
| 自动化 | tests/selftest/ `test_tc_res_004_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 1`

#### TC-RES-004-HP-03：规范化等价命中同一幂等键

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5 |
| 步骤/输入 | 首次：`Zhang   San`/13800138000/`ZS@Example.com`；再次：` Zhang San `/`+86 138-0013-8000`/`zs@example.com` |
| 预期 | 第二次 200 且同 resume_id；展示值保留首次原样，键列为规范化值 |
| 自动化 | tests/selftest/ `test_tc_res_004_hp_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT name, phone, email, name_key, phone_key, email_key FROM resumes;`

#### TC-RES-004-PV-01：无明确确认不保存

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.1 |
| 步骤/输入 | body 为 {}、false、"yes"、1、null |
| 预期 | 422 confirmation_required；resumes=0、file/ 空；草稿与令牌仍有效 |
| 自动化 | tests/selftest/ `test_tc_res_004_pv_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0；SELECT count(*) FROM drafts; -- 1`

#### TC-RES-004-PV-02：核心三项缺失（各缺一项）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.2 |
| 步骤/输入 | 模型缺 name/phone/email 之一后确认 |
| 预期 | 422 validation_failed，details 含该项 required；不写库不建文件；草稿保留 |
| 自动化 | tests/selftest/ `test_tc_res_004_pv_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0`

#### TC-RES-004-PV-03：核心三项格式非法，修正后可保存

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.2 |
| 步骤/输入 | 模型给 phone=12、email=nope → 确认 → PATCH 修正 → 确认 |
| 预期 | 第一次 422（phone、email 均 invalid_format），resumes=0；修正后 201 |
| 自动化 | tests/selftest/ `test_tc_res_004_pv_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0 然后 1`

#### TC-RES-004-BL-01：B-04：确认前正式库无数据

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.1, AC-05.1 |
| 步骤/输入 | 上传、PATCH 后检查；确认后再检查 |
| 预期 | 确认前 resumes 与子表均 0 行、草稿可读；确认后 1 行 |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; SELECT count(*) FROM resume_work_experiences;`

#### TC-RES-004-BL-02：B-05：记录与文件一一对应，无 tmp

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.3, AC-04.4 |
| 步骤/输入 | 确认后对比 |
| 预期 | 每条记录 file_path=<id>.pdf 与 file/ 文件名集合完全相等；无以 . 开头或 .tmp 结尾的文件 |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT id, file_path FROM resumes; -- 对 ls file/`

#### TC-RES-004-BL-03：子表与 JSON 列落库

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.3 |
| 步骤/输入 | 模型给 2 条工作经历、1 条教育、1 条项目、技能 2 项 |
| 预期 | 子表行数与 seq 正确；skills_json 为合法 JSON |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT seq, company FROM resume_work_experiences WHERE resume_id='{变量:resumeId}' ORDER BY seq; SELECT json_valid(skills_json) FROM resumes;`

#### TC-RES-004-BL-04：展示值只去首尾空白，键列规范化

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5 |
| 步骤/输入 | name=`  ZhangSan  `、phone=` 138-0013-8000 `、email=`  A@B.COM ` |
| 预期 | name/phone/email 去首尾空白；phone_key=13800138000；email_key=a@b.com |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT name, phone, email, name_key, phone_key, email_key FROM resumes;`

#### TC-RES-004-BL-05：D-03：未逐项确认的字段按草稿当前值保存；状态不入正式库

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.3 |
| 步骤/输入 | 上传后不 PATCH 直接确认 |
| 预期 | job_title/current_city 等取草稿值；resumes 表无状态列 |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT job_title, current_city FROM resumes; PRAGMA table_info(resumes); -- 无 status 列`

#### TC-RES-004-BL-06：仅邮箱不同视为不同人

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5 |
| 步骤/输入 | 确认后再上传仅 email 不同者并确认 |
| 预期 | 201 already_saved=false；resumes 2 行；file/ 2 个文件 |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_06` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 2`

#### TC-RES-004-BL-07：并发确认同一幂等键（两个浏览器）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.6, AC-04.4 |
| 步骤/输入 | 两线程同时确认两份同键草稿 |
| 预期 | 返回码为 {200,201}；resume_id 相同；resumes 1 行；file/ 1 个终态文件；两个草稿均清除 |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_07` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 1；SELECT count(*) FROM drafts; -- 0`

#### TC-RES-004-BL-08：不提供修改/删除已确认记录的接口

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.9 |
| 步骤/输入 | 对 /api/v1/resumes/{id} 与 /api/v1/resumes 发 PUT/PATCH/DELETE；检查 OpenAPI |
| 预期 | 均 404/405；记录不变；OpenAPI 在 /api/v1/resumes* 下仅有 POST |
| 自动化 | tests/selftest/ `test_tc_res_004_bl_08` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes WHERE id='{变量:resumeId}'; -- 1`

#### TC-RES-004-EH-01：草稿不存在

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.8 |
| 步骤/输入 | 无 Cookie 直接确认 |
| 预期 | 404 draft_not_found；resumes=0 |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0`

#### TC-RES-004-EH-02：成功后用旧令牌重试（响应丢失场景）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.8 |
| 步骤/输入 | 确认成功后把旧令牌放回再确认 |
| 预期 | 404 draft_not_found；resumes 仍 1 |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 1`

#### TC-RES-004-EH-03：写库失败的补偿

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | monkeypatch ResumeRepository.create_aggregate 抛错 |
| 预期 | 500 save_failed，响应不含异常文本；resumes=0；file/ 空（无 tmp）；草稿保留且可重试成功 |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_03` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0；ls file/ 空`

#### TC-RES-004-EH-04：暂存文件失败的补偿

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | monkeypatch ArchiveFileStore.stage 抛 OSError |
| 预期 | 500 save_failed；无记录无文件；草稿保留 |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 0`

#### TC-RES-004-EH-05：提交后重命名失败 → 重启对账 roll-forward

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | monkeypatch promote 抛错；再用同目录启动新应用实例 |
| 预期 | 500 save_failed；此时记录存在且仅有 .<id>.pdf.tmp；重启后终态文件出现且内容一致；再次上传确认得 already_saved=true |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT file_path FROM resumes; -- ls file/：先 tmp，重启后 <id>.pdf`

#### TC-RES-004-EH-06：收尾（删草稿文件）失败不影响成功结果

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.7 |
| 步骤/输入 | monkeypatch DraftFileStore.delete 抛 OSError |
| 预期 | 仍 201；resumes 1 行；file/ 1 个文件 |
| 自动化 | tests/selftest/ `test_tc_res_004_eh_06` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 1`

#### TC-RES-004-DB-01：姓名 100 字符、最短合法邮箱、+国际 6 位号码

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.2 |
| 步骤/输入 | 模型返回边界值后确认 |
| 预期 | 201；length(name)=100；phone_key=+123456 |
| 自动化 | tests/selftest/ `test_tc_res_004_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT length(name), phone_key FROM resumes;`

#### TC-RES-004-DB-02：+86 前缀去除，其他国际号保留

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5 |
| 步骤/输入 | +8613800138000 确认；再确认 +85212345678 |
| 预期 | 首个 phone_key=13800138000；国际号 201 为新记录且 phone_key 保留 + |
| 自动化 | tests/selftest/ `test_tc_res_004_db_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT phone_key FROM resumes ORDER BY 1;`

#### TC-RES-004-SE-01：确认路径日志与响应脱敏

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3 |
| 步骤/输入 | 确认两次（含 already_saved）后抓取日志 |
| 预期 | 日志与响应均不含姓名/手机号/邮箱/文件名/令牌 |
| 自动化 | tests/selftest/ `test_tc_res_004_se_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 抓取日志`

#### TC-RES-004-SE-02：SQL 注入样式姓名只作数据（参数绑定）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3 |
| 步骤/输入 | name=`ZZ'; DROP TABLE resumes;--` |
| 预期 | 201；姓名原样入库；resumes 表仍在 |
| 自动化 | tests/selftest/ `test_tc_res_004_se_02` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT name FROM resumes; SELECT count(*) FROM sqlite_master WHERE name='resumes'; -- 1`

## 5、启动对账与初始化（lifespan）

#### TC-RES-005-HP-01：启动后目录、库、版本就绪

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.1, AC-04.4 |
| 步骤/输入 | 启动应用（lifespan） |
| 预期 | drafts/、file/ 存在；两库 user_version=1；4 张正式库表与 drafts 表存在；可接收请求 |
| 自动化 | tests/selftest/ `test_tc_res_005_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`PRAGMA user_version; SELECT name FROM sqlite_master WHERE type='table';`

#### TC-RES-005-HP-02：启动顺序（design §5.4）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4, AC-05.5 |
| 步骤/输入 | 给 Lifecycle 各步骤打桩记录顺序 |
| 预期 | prepare_directories → init_databases → reconcile → cleanup → start_scheduler，之后才响应请求 |
| 自动化 | tests/selftest/ `test_tc_res_005_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 记录顺序断言`

#### TC-RES-005-BL-01：对账情形①：有记录+tmp → roll-forward

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A 与 .A.pdf.tmp，启动 |
| 预期 | tmp 变为 A.pdf；记录保留 |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ = [A.pdf]；SELECT file_path FROM resumes;`

#### TC-RES-005-BL-02：对账情形②：tmp 无记录 → 删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A+A.pdf 与孤儿 tmp |
| 预期 | 孤儿 tmp 被删，A.pdf 保留 |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ = [A.pdf]`

#### TC-RES-005-BL-03：对账情形③：终态文件无记录 → 删除

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A+A.pdf 与孤儿终态文件 |
| 预期 | 孤儿被删，A.pdf 保留 |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ = [A.pdf]`

#### TC-RES-005-BL-04：对账保险丝：零记录时保留终态文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 空库 + file/ 有终态文件 |
| 预期 | 文件保留，告警不删 |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_04` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ 仍有该文件；SELECT count(*) FROM resumes; -- 0`

#### TC-RES-005-BL-05：对账情形④：记录缺文件仅告警

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A（无任何文件）与记录 B+B.pdf |
| 预期 | 启动成功；记录不删；日志有 reconcile_record_file_missing 含 A 的 id |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; -- 2`

#### TC-RES-005-BL-06：对账只在启动阶段由 lifecycle 调用

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 扫描 src 中 ReconcileService( 的调用点 |
| 预期 | 仅 core/lifecycle.py |
| 自动化 | tests/selftest/ `test_tc_res_005_bl_06` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 源码扫描`

#### TC-RES-005-EH-01：对账抛错不阻止启动

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | monkeypatch ReconcileService.run 抛错 |
| 预期 | 应用正常启动；日志有 reconcile_failed |
| 自动化 | tests/selftest/ `test_tc_res_005_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- HTTP 断言`

#### TC-RES-005-EH-02：冲突：记录同时有 tmp 与终态文件

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 预置记录 A、A.pdf 与 .A.pdf.tmp |
| 预期 | 两个文件均不删不改 |
| 自动化 | tests/selftest/ `test_tc_res_005_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ 两个文件仍在`

#### TC-RES-005-DB-01：全空环境启动

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 空 DATA_DIR/FILE_DIR |
| 预期 | 两库 0 行，目录均为空，启动成功 |
| 自动化 | tests/selftest/ `test_tc_res_005_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM resumes; SELECT count(*) FROM drafts;`

## 6、草稿清理（启动一次+定时）

#### TC-RES-006-BL-01：7 天边界清理

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 上传后前进恰 7 天 → 清理；再 +1 秒 → 清理 |
| 预期 | 恰 7 天保留；超 1 秒后草稿行与文件均删 |
| 自动化 | tests/selftest/ `test_tc_res_006_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 1 然后 0`

#### TC-RES-006-BL-02：孤儿草稿文件 1 天窗口

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | data/drafts 放 2 天前与 1 小时前的无行文件后清理 |
| 预期 | 仅保留 1 小时前的文件 |
| 自动化 | tests/selftest/ `test_tc_res_006_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`ls data/drafts`

#### TC-RES-006-BL-03：清理永不触碰 file/

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 确认一条记录，放一个 mtime 极旧的孤儿终态文件，时钟前进 400 天后清理 |
| 预期 | file/ 内容、resumes 均不变 |
| 自动化 | tests/selftest/ `test_tc_res_006_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`ls file/ 前后一致；SELECT count(*) FROM resumes; -- 1`

#### TC-RES-006-BL-04：启动时执行一次清理

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 草稿存在，应用关闭；时钟 +9 天重启 |
| 预期 | 重启后草稿行与文件已被清除 |
| 自动化 | tests/selftest/ `test_tc_res_006_bl_04` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-006-BL-05：调度线程按间隔清理（无请求触发）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 间隔 0.05 秒；创建草稿后前进 8 天 |
| 预期 | 5 秒内草稿被后台线程清除 |
| 自动化 | tests/selftest/ `test_tc_res_006_bl_05` |
| 执行结果 | ✅ 通过 |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-006-EH-01：单次清理失败不终止调度线程

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | 第 2 次 run_once 抛错 |
| 预期 | 线程继续运行 ≥4 次；日志有 cleanup_failed |
| 自动化 | tests/selftest/ `test_tc_res_006_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 调用计数断言`

## 7、模型调用（clients 层，含 1 MB 请求体预算、B-02/B-04/B-05/B-06）

#### TC-RES-007-HP-01：PNG 照片请求形态

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1, AC-06.2, AC-06.1 |
| 步骤/输入 | DeepSeekClient（MockTransport）解析合成 PNG |
| 预期 | POST api.deepseek.com …/chat/completions；model=deepseek-flash；Authorization 头带密钥，请求体不含密钥；image_url 为 data:image/jpeg;base64；体积 ≤995,904；返回 token 用量 |
| 自动化 | tests/selftest/ `test_tc_res_007_hp_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-HP-02：文本层 PDF 走文本块

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1 |
| 步骤/输入 | 解析含文本层的合成 PDF |
| 预期 | 请求无 image_url，含 `text layer` 文本块 |
| 自动化 | tests/selftest/ `test_tc_res_007_hp_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-HP-03：扫描 PDF（无文本层）走图片块

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1 |
| 步骤/输入 | 解析合成扫描 PDF |
| 预期 | 请求含 image_url |
| 自动化 | tests/selftest/ `test_tc_res_007_hp_03` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 捕获请求断言`

#### TC-RES-007-BL-01：1 MB 预算：不可压缩噪点大图

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1（约束：LLM ≤1 MB） |
| 步骤/输入 | 3000×2000 与 1200×1600 随机噪点 PNG |
| 预期 | 请求体 ≤995,904 B 且小于原图 |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- len(request.content)`

#### TC-RES-007-BL-02：压到下限仍超限 → parse_failed 且不外发

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5（约束：LLM ≤1 MB） |
| 步骤/输入 | 把预算改小到 3000 B |
| 预期 | 抛 ParseFailedError；传输层 0 次请求 |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 请求计数 0`

#### TC-RES-007-BL-03：像素炸弹（>2500 万像素）拒绝

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 小文件头声明 >25M 像素的 PNG |
| 预期 | ParseFailedError；0 次请求 |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_03` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 请求计数 0`

#### TC-RES-007-BL-04：B-02：模型名与外发地址锁定

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.2 |
| 步骤/输入 | DEEPSEEK_MODEL=other-model；BASE_URL=evil/http；model_copy 绕过后构造客户端 |
| 预期 | Settings 校验失败且错误信息不回显配置值；绕过构造时 DeepSeekClient 抛 ValueError |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_04` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-BL-05：B-02：仅 clients 层引入 HTTP 栈/模型主机

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.2 |
| 步骤/输入 | 扫描 src（除 clients、core/config） |
| 预期 | 无 httpx/requests/urllib/socket 导入，无 api.deepseek.com 字面量 |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_05` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 源码扫描`

#### TC-RES-007-BL-06：B-01：无凭证 → parse_unavailable 且不外发；代码无密钥字面量

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.1, AC-02.5 |
| 步骤/输入 | API key=None 解析；扫描 src 中 sk- 密钥样式 |
| 预期 | ParseUnavailableError，0 次请求；无匹配 |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_06` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 源码扫描`

#### TC-RES-007-BL-07：B-06：测试禁网夹具生效

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.6 |
| 步骤/输入 | 在测试里创建 socket 连接 |
| 预期 | 抛 RuntimeError(network access is forbidden) |
| 自动化 | tests/selftest/ `test_tc_res_007_bl_07` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-01：读/连接超时 → parse_timeout，不重试

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.4 |
| 步骤/输入 | 传输层抛 ReadTimeout、ConnectTimeout |
| 预期 | ParseTimeoutError；仅 1 次请求 |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 请求计数 1`

#### TC-RES-007-EH-02：HTTP 401/402/403/404/429/500/503 → parse_unavailable

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | MockTransport 返回对应状态 |
| 预期 | ParseUnavailableError，异常文本不含供应商响应体；1 次请求 |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_02` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-03：HTTP 400/413/422 → parse_failed

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 同上 |
| 预期 | ParseFailedError |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_03` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-04：响应体空/非 JSON/非对象/无 choices → parse_failed

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.3, AC-02.5 |
| 步骤/输入 | 5 种异常响应 |
| 预期 | ParseFailedError |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_04` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-05：连接失败 → parse_unavailable

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 传输层抛 ConnectError |
| 预期 | ParseUnavailableError |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_05` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 异常断言`

#### TC-RES-007-EH-06：超时配置 connect5/write30/read60/pool5，MODEL_TIMEOUT_SECONDS 可调

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.4 |
| 步骤/输入 | 读取 client.timeout；MODEL_TIMEOUT_SECONDS=7 |
| 预期 | (5,30,60,5)；自定义读超时 7 |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_06` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 属性断言`

#### TC-RES-007-EH-07：仅有 PDF 魔数的损坏 PDF → parse_failed，不外发

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.5 |
| 步骤/输入 | 解析 300 字节伪 PDF |
| 预期 | ParseFailedError |
| 自动化 | tests/selftest/ `test_tc_res_007_eh_07` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 请求计数 0`

#### TC-RES-007-DB-01：token 用量只记数字

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3 |
| 步骤/输入 | 模型响应 usage 123/45 |
| 预期 | 日志含 prompt_tokens=123、completion_tokens=45 |
| 自动化 | tests/selftest/ `test_tc_res_007_db_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 抓取日志`

#### TC-RES-007-SE-01：日志不含请求内容、响应体、密钥、Bearer

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3, AC-06.1 |
| 步骤/输入 | 文本 PDF 含标记，响应含标记，解析失败 |
| 预期 | 日志与 stdout 均无标记、密钥、Bearer |
| 自动化 | tests/selftest/ `test_tc_res_007_se_01` |
| 执行结果 | ✅ 通过 |

数据验证：`-- 抓取日志`

## 8、真实进程 + 真实 DeepSeek + 真实简历样品（脱敏）

#### TC-RES-008-HP-01：真实进程启动：对账→清理→启动完成→监听

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4, AC-05.5 |
| 步骤/输入 | uvicorn --workers 1 127.0.0.1:8000，独立临时 DATA_DIR/FILE_DIR |
| 预期 | 日志顺序 reconcile_done < cleanup_done < startup complete < running on；两库与目录存在；端口监听 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（start-up log order reconcile->cleanup->startup complete->listening; dirs and dbs exist） |

数据验证：`ls DATA_DIR；日志顺序断言`

#### TC-RES-008-EH-01：真实进程错误码

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.2, AC-04.8, AC-05.4 |
| 步骤/输入 | 无 file 部件/.exe/空文件/PNG 改名 .pdf/10MiB+/无 Cookie GET 与 POST |
| 预期 | 400/415/400/400/413/404/404；无 Cookie 被下发；drafts=0 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（failed checks: none） |

数据验证：`SELECT count(*) FROM drafts; -- 0`

#### TC-RES-008-BL-01：真实样品的 1 MB 外发预算

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.1（约束：LLM ≤1 MB） |
| 步骤/输入 | 用应用同一函数 build_user_blocks 计算样品（PNG 约 740 KB）的请求体 |
| 预期 | 请求体 ≤995,904（实测约 278 KB） |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（source 759100 B -> request body 284772 B (limit 995904)） |

数据验证：`-- 数字比较`

#### TC-RES-008-HP-02：真实样品上传（真实 DeepSeek）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-01.1, AC-02.1, AC-02.2, AC-02.6, AC-05.2 |
| 步骤/输入 | POST 样品 PNG（/tmp，不入库） |
| 预期 | 201；22 键；状态 ⊆{recognized,missing}；Cookie 属性正确；<75 s |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（HTTP attempts=[201], 8.4s total, statuses=['missing', 'recognized']） |

数据验证：`-- HTTP 断言`

#### TC-RES-008-HP-03：逐字段对比真值（脱敏结论）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-02.2, AC-02.3 |
| 步骤/输入 | 对比姓名/邮箱/手机号/职位/工作年限/学历三项/证书/技能/项目段数 |
| 预期 | 11/11 项一致（核心三项精确一致） |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（11/11 matched: name=OK,email=OK,phone=OK,job_title=OK,work_years=OK,education_school=OK,education_major=OK,education_degree=OK,certificates=OK,skills=OK,projects_count=OK） |

数据验证：`-- 脚本内存比对，不输出值`

#### TC-RES-008-HP-04：GET 与上传一致

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.1, AC-05.3 |
| 步骤/输入 | GET current |
| 预期 | 200；draft_id 与 fields 与上传完全相同 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（HTTP 200） |

数据验证：`-- HTTP 断言`

#### TC-RES-008-HP-05：PATCH：核心三项+homepage 确认

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-03.2 |
| 步骤/输入 | PATCH 提交 4 个字段 |
| 预期 | 4 项 confirmed，其余 18 项与上传完全相同 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（HTTP 200; 4 fields confirmed, 18 untouched fields unchanged） |

数据验证：`-- HTTP 断言`

#### TC-RES-008-HP-06：确认并核对库与 file/ 一致

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.3, AC-04.7, AC-04.4 |
| 步骤/输入 | POST /resumes |
| 预期 | 201；resumes=1，projects=4，educations=1，drafts=0，data/drafts 空；file/ 仅 <id>.png 且 SHA-256 等于样品；姓名/手机/邮箱列等于真值；Cookie 清除 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（HTTP 201; counts={'resumes': 1, 'work': 0, 'projects': 4, 'educations': 1, 'drafts': 0, 'draft_files': 0}; file==sample(sha256)=True; identity columns==truth=True） |

数据验证：`SELECT count(*) FROM resumes/子表/drafts; -- 摘要计数`

#### TC-RES-008-EH-02：重启对账（真实进程）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.4 |
| 步骤/输入 | 关闭服务（SIGINT），在 file/ 放孤儿 tmp 与孤儿终态文件，重启 |
| 预期 | 孤儿被清；记录文件保留；日志含 reconcile_*_removed；首次关闭退出码 0 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（exit code of first stop=0; after restart file/ holds only the record's file=True） |

数据验证：`ls file/ 仅记录文件`

#### TC-RES-008-HP-07：同一人再次确认（真实 DeepSeek）

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-04.5, AC-04.6 |
| 步骤/输入 | 再次上传样品，PATCH 核心三项为真值后确认 |
| 预期 | 200 already_saved=true，同 resume_id；resumes 仍 1 行；file/ 仍 1 个；草稿清除 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（upload attempts=[201], confirm HTTP 200; one record, one file; first model_call log: {"event": "model_call", "request_id": "req_b0976ba36e5f4856", "status_code": 200, "duration_ms": 8879, "code": null, "prompt_tokens": 1496, "completion_tokens": 1894}） |

数据验证：`SELECT count(*) FROM resumes; -- 1`

#### TC-RES-008-SE-01：真实进程日志脱敏

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-06.3, AC-06.1 |
| 步骤/输入 | 扫描全部日志：姓名/邮箱/手机号/样品文件名/draft_token=/Bearer/API Key |
| 预期 | 0 处泄露；事件仅白名单类型 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（69 log lines, leaked secret indexes=[], events=['cleanup_done', 'draft_created', 'model_call', 'reconcile_done', 'reconcile_final_removed', 'reconcile_tmp_removed', 'request_failed', 'resume_duplicate', 'resume_saved']） |

数据验证：`-- 日志扫描`

#### TC-RES-008-SE-02：优雅退出与清理

| 项目 | 内容 |
|---|---|
| 追溯 AC | AC-05.5 |
| 步骤/输入 | SIGINT 关闭 |
| 预期 | 退出码 0；日志含 Application shutdown complete，无 scheduler_stop_timeout；端口 8000 释放；临时目录已删 |
| 自动化 | scripts/self_test_live.py |
| 执行结果 | ✅ 通过（exit codes=0,0; shutdown complete logged; port 8000 released） |

数据验证：`lsof -i :8000 无输出`

## 覆盖追溯矩阵

### 验收标准覆盖（REQ-BE-01 ~ 06，共 37 条）

| AC 编号 | AC 描述 | 覆盖用例（节选） | 状态 |
|---|---|---|---|
| AC-01.1 | 合法 PDF/JPG/JPEG/PNG ≤10MB 被接收并解析 | TC-RES-001-HP-01, TC-RES-001-HP-02, TC-RES-001-EH-03, TC-RES-001-DB-01 等 7 条 | ✅ 已覆盖 |
| AC-01.2 | 非法类型/超限/空/魔数不符被拒，不调模型 | TC-RES-001-PV-01, TC-RES-001-PV-02, TC-RES-001-PV-03, TC-RES-001-PV-04 等 8 条 | ✅ 已覆盖 |
| AC-01.3 | 服务端命名落盘 | TC-RES-001-HP-01, TC-RES-001-BL-01, TC-RES-001-DB-02 | ✅ 已覆盖 |
| AC-01.4 | 每次只接受一个文件 | TC-RES-001-PV-06 | ✅ 已覆盖 |
| AC-01.5 | 成功上传新建草稿与新令牌 Cookie | TC-RES-001-HP-01, TC-RES-001-HP-05 | ✅ 已覆盖 |
| AC-01.6 | 重传替换旧草稿；失败不动旧草稿与 Cookie | TC-RES-001-HP-04, TC-RES-001-EH-01 | ✅ 已覆盖 |
| AC-02.1 | 仅经 clients 调 deepseek-flash | TC-RES-007-HP-01, TC-RES-007-HP-02, TC-RES-007-HP-03, TC-RES-007-BL-01 等 6 条 | ✅ 已覆盖 |
| AC-02.2 | 字段状态 recognized/uncertain/missing | TC-RES-001-HP-03, TC-RES-008-HP-02, TC-RES-008-HP-03 | ✅ 已覆盖 |
| AC-02.3 | 结构不合法/无依据值降级，不猜测 | TC-RES-001-BL-03, TC-RES-001-BL-04, TC-RES-007-EH-04, TC-RES-008-HP-03 | ✅ 已覆盖 |
| AC-02.4 | 60 秒超时 → parse_timeout | TC-RES-001-EH-02, TC-RES-007-EH-01, TC-RES-007-EH-06 | ✅ 已覆盖 |
| AC-02.5 | 不可用/拒绝/错误 → 阻断不回退 | TC-RES-001-EH-01, TC-RES-001-EH-02, TC-RES-007-BL-02, TC-RES-007-BL-03 等 10 条 | ✅ 已覆盖 |
| AC-02.6 | 同步返回草稿与字段状态 | TC-RES-001-HP-01, TC-RES-001-HP-03, TC-RES-008-HP-02 | ✅ 已覆盖 |
| AC-03.1 | 读取返回全部字段值与状态 | TC-RES-002-HP-01, TC-RES-008-HP-04 | ✅ 已覆盖 |
| AC-03.2 | 更新置 confirmed，未提交保持原状 | TC-RES-003-HP-01, TC-RES-003-HP-03, TC-RES-003-HP-04, TC-RES-003-BL-02 等 6 条 | ✅ 已覆盖 |
| AC-03.3 | 多条子项增删改 | TC-RES-003-HP-02 | ✅ 已覆盖 |
| AC-03.4 | 手机号/邮箱字段级错误 | TC-RES-003-PV-01, TC-RES-003-PV-02, TC-RES-003-PV-03, TC-RES-003-PV-04 等 9 条 | ✅ 已覆盖 |
| AC-03.5 | 读取/更新刷新活动时间 | TC-RES-002-HP-02, TC-RES-003-BL-03 | ✅ 已覆盖 |
| AC-04.1 | 无明确确认不写库 | TC-RES-004-PV-01, TC-RES-004-BL-01 | ✅ 已覆盖 |
| AC-04.2 | 核心三项缺失/非法拒绝 | TC-RES-003-PV-05, TC-RES-004-PV-02, TC-RES-004-PV-03, TC-RES-004-DB-01 | ✅ 已覆盖 |
| AC-04.3 | 文件→正式库保存顺序 | TC-RES-004-HP-01, TC-RES-004-BL-02, TC-RES-004-BL-03, TC-RES-004-BL-05 等 5 条 | ✅ 已覆盖 |
| AC-04.4 | 失败补偿与启动对账（B-05） | TC-RES-004-BL-02, TC-RES-004-BL-07, TC-RES-004-EH-03, TC-RES-004-EH-04 等 18 条 | ✅ 已覆盖 |
| AC-04.5 | 规范化幂等键与唯一约束 | TC-RES-004-HP-02, TC-RES-004-HP-03, TC-RES-004-BL-04, TC-RES-004-BL-06 等 6 条 | ✅ 已覆盖 |
| AC-04.6 | 同键不新增不覆盖，返回 already_saved | TC-RES-004-HP-02, TC-RES-004-BL-07, TC-RES-008-HP-07 | ✅ 已覆盖 |
| AC-04.7 | 成功后删草稿并作废令牌 | TC-RES-002-EH-03, TC-RES-004-HP-01, TC-RES-004-EH-06, TC-RES-008-HP-06 | ✅ 已覆盖 |
| AC-04.8 | 草稿不存在/令牌无效 → draft_not_found | TC-RES-003-EH-01, TC-RES-004-EH-01, TC-RES-004-EH-02, TC-RES-008-EH-01 | ✅ 已覆盖 |
| AC-04.9 | 无修改/删除接口 | TC-RES-004-BL-08 | ✅ 已覆盖 |
| AC-05.1 | 草稿库与正式库分离 | TC-RES-001-BL-05, TC-RES-004-BL-01, TC-RES-005-HP-01 | ✅ 已覆盖 |
| AC-05.2 | HttpOnly Cookie 令牌 7 天，随机 | TC-RES-001-HP-01, TC-RES-001-SE-01, TC-RES-008-HP-02 | ✅ 已覆盖 |
| AC-05.3 | 有效令牌读取当前草稿 | TC-RES-002-HP-01, TC-RES-002-SE-01, TC-RES-008-HP-04 | ✅ 已覆盖 |
| AC-05.4 | 无效/作废/过期 → 无可恢复草稿 | TC-RES-002-EH-01, TC-RES-002-EH-02, TC-RES-002-EH-03, TC-RES-002-EH-04 等 7 条 | ✅ 已覆盖 |
| AC-05.5 | 启动与定时清理，不触及 file/ | TC-RES-005-HP-02, TC-RES-005-DB-01, TC-RES-006-BL-01, TC-RES-006-BL-02 等 10 条 | ✅ 已覆盖 |
| AC-06.1 | 凭证仅来自环境变量 | TC-RES-007-HP-01, TC-RES-007-BL-06, TC-RES-007-SE-01, TC-RES-008-SE-01 | ✅ 已覆盖 |
| AC-06.2 | 仅经 clients 外发 | TC-RES-007-HP-01, TC-RES-007-BL-04, TC-RES-007-BL-05 | ✅ 已覆盖 |
| AC-06.3 | 日志/错误不含原文与敏感信息 | TC-RES-001-SE-01, TC-RES-001-SE-02, TC-RES-003-SE-01, TC-RES-004-SE-01 等 8 条 | ✅ 已覆盖 |
| AC-06.4 | 前缀/snake_case/统一错误体 | TC-RES-001-HP-06, TC-RES-001-SE-02 | ✅ 已覆盖 |
| AC-06.5 | OpenAPI 先于实现并冻结 | TC-RES-001-HP-06 | ✅ 已覆盖 |
| AC-06.6 | 测试仅合成数据且模型 mock | TC-RES-007-BL-07 | ✅ 已覆盖 |

说明：AC-06.5（OpenAPI 先冻结）属流程性要求，由 `tests/contract/test_openapi_conformance.py`（既有契约测试）与冻结的 `openapi.yaml` 0.1.1 保证；本自测在 TC-RES-004-BL-08 中核对了路径集合，并在 TC-RES-001/002/003/004 的 HTTP 断言中核对了响应键集合。AC-01.4（单文件）的覆盖用例观测到框架在两个 file 部件时只绑定其一（见遗漏项 2）。

### 本 Workbench 附加追溯维度

| 维度 | 覆盖情况 |
|---|---|
| 接口覆盖 | ①②③④ 四个接口 4/4（100%）；另覆盖启动对账、草稿清理、模型调用 3 个内部单元 |
| 错误码覆盖（13 个） | file_missing(001-PV-01)、file_empty(001-PV-03)、file_content_mismatch(001-PV-04)、file_too_large(001-PV-05)、unsupported_file_type(001-PV-02)、parse_failed(001-EH-01)、parse_unavailable/parse_timeout(001-EH-02)、draft_not_found(002-EH-01)、validation_failed(003-PV-01)、confirmation_required(004-PV-01)、save_failed(004-EH-03)、internal_error(001-EH-03)：13/13 |
| 业务规则 B-01~B-06 | B-01(007-BL-06,007-SE-01,008-SE-01)、B-02(007-BL-04,007-BL-05)、B-03(001-SE-01,003-SE-01,004-SE-01,007-SE-01,008-SE-01)、B-04(001-BL-03,004-BL-01,004-PV-01)、B-05(004-BL-02,004-BL-07,004-EH-03/04/05,005-BL-01~05)、B-06(007-BL-07)：6/6 |
| LLM 1 MB 请求体预算 | 007-BL-01/02/03、008-BL-01：噪点大图、预算不足不外发、像素炸弹、真实样品 |
| 状态转换 | recognized/uncertain/missing → confirmed 单向（001-HP-03、003-HP-01/03、001-BL-03） |

## 覆盖率统计

| 维度 | 总数 | 已覆盖 | 覆盖率 |
|---|---|---|---|
| 验收标准（AC） | 37 | 37 | 100% |
| 被测单元（①②③④、对账、清理、模型调用、真实进程） | 8 | 8 | 100% |
| 错误码 | 13 | 13 | 100% |

## 执行汇总

| 项目 | 结果 |
|---|---|
| 用例总数 | 123（pytest 自动化 112；真实进程脚本 11） |
| 通过 / 失败 / 未执行 | 123 / 0 / 0 |
| 执行通过率 | 100%（123/123） |
| 全量回归 | `uv run pytest`：1141 passed（既有 1001 + 自测 140 个收集项）；`ruff check`、`ruff format --check` 通过 |
| 真实进程 + 真实 DeepSeek | 11/11 通过；样品 PNG（约 741 KB）外发体约 278 KB（≤995,904）；上传耗时约 8~13 s；逐字段对比 11/11 一致（姓名、邮箱、手机号精确一致，职位、工作年限、学历三项、证书、技能、项目段数一致）；库与 file/ 一致（resumes 1、projects 4、educations 1、drafts 0、file/ 1 个且 SHA-256 等于样品）；日志 0 泄露 |
| 清理 | 服务进程已退出、端口 8000 已释放、临时 DATA_DIR/FILE_DIR 已删；样品与真值只在 /tmp |
| 本次 DeepSeek 调用 | 脚本 3 轮完整运行 + 排查性重复调用约 50 次，均为 DL 批准的样品 |

## 观察与遗留风险（非本自测失败项）

1. **真实模型偶发 `parse_failed` / `parse_timeout`**：同一样品约 50 次调用中出现 2 次 502 `parse_failed`、另有一轮上传 504（60.5 s）。服务行为符合设计（不留草稿、不动旧草稿、可重新上传），脚本在上传和二次上传步骤各允许 1 次显式重试并在结果中记录次数。疑似原因：模型偶发超长输出（completion_tokens 个别达 6000~7000，接近 `max_tokens=8192`）被截断致 JSON 不完整，**未证实**，建议联调时记录 `finish_reason`（仅记录该枚举值，不含内容）后再判断；不属于本次自测的代码缺陷。
2. **同一请求带多个 `file` 部件**：框架只绑定其一，返回 201 且只产生 1 条草稿（001-PV-06）。AC-01.4“只接受一个文件”实质满足，但不是显式拒绝；契约未规定，不改动。
3. **本地代理**：开发机环境存在代理变量时，测试脚本的 httpx 若信任环境变量会让简历经本地代理转发；脚本已设 `trust_env=False`，服务端 `DeepSeekClient` 本就不信任环境代理。

## 遗漏场景（PRD / 设计 vs 自测）

| 编号 | 遗漏场景 | 原因 / 处理 |
|---|---|---|
| 1 | 60 秒真实超时（真实 DeepSeek 慢响应） | 真实环境不可控；超时映射由 007-EH-01/06 在 MockTransport 下验证 |
| 2 | 5 路并发上传的处理能力（design §9.5、AGENTS 待确认 3a） | 属性能实测，已有联调记录 `10_review/integration_drill.md`；本自测只做并发更新（003-EH-02）与并发确认（004-BL-07） |
| 3 | 真实手写体/低光/折痕等复杂版式简历 | 只有 1 份真实样品；准确率结论仅限该样品 |
| 4 | 进程崩溃（SIGKILL）发生在“提交后、重命名前”的真实窗口 | 以注入 promote 失败 + 重启对账模拟（004-EH-05）；真实 SIGKILL 窗口极窄，未做 |
| 5 | 磁盘加密、部署权限（AGENTS 待确认 2a） | 属部署侧，非自动化范围 |
| 6 | 供应商留存/训练授权证明（待确认 4） | 供应商侧文件证明，非自测可验证 |
| 7 | 前端联调 | 已由 frontend 联调演练覆盖，不在 backend 自测范围 |

## 查询变量速查表

| 变量名 | 说明 | 获取方式 |
|---|---|---|
| `{变量:draftId}` / `{变量:oldDraftId}` / `{变量:newDraftId}` | 草稿 id | 上传响应 `draft_id` |
| `{变量:resumeId}` | 简历记录 id | 确认响应 `resume_id` |
| `DATA_DIR` / `FILE_DIR` | 草稿库与草稿文件 / 归档目录 | 自测使用独立临时目录；真实进程脚本通过环境变量传入 |
