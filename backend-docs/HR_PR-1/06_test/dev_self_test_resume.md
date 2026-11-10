# 开发自测用例 — 简历信息收集（backend Workbench，HR_PR-1）

> **模式：开发自测（白盒）**
> 每条用例含接口断言与 SQLite / 文件目录数据验证；变量用 `{变量:xxx}` 标记供造数脚本使用。执行结果已回填（见各用例“执行结果”）。

## 文档版本

| 版本 | 日期 | 修改说明 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-11-10 | 初始版本：122 条用例，已全部执行并回填结果 | Yin Yang（backend） |

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
| 正向路径 | HP | 26 |
| 参数校验 | PV | 16 |
| 业务逻辑 | BL | 35 |
| 错误处理 | EH | 27 |
| 数据边界 | DB | 9 |
| 安全性 | SE | 9 |
| 合计 | — | 122 |

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


