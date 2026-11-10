# 联调前演练记录 — uvicorn 真实进程 + 真实 DeepSeek spike（HR_PR-1 backend）

- 日期：2026-11-10；执行人：backend worker；代码基线：合并 `feature` 后（含 20 个任务 ✅ 与第十批审查）
- 授权：DL 2026-11-10“继续推进”；凭证来自本 worktree 的本地 `.env`（已被 `.gitignore` 忽略）。**本记录与演练日志均未记录或回显密钥、简历内容**；样本全部为自行生成的虚构简历（虚构姓名、`13800138xxx` 演示号段、`example.com` 邮箱）。
- 结论先行：**演练全部通过，真实模型在全部样本上识别 100% 正确（合成真值逐字段对比），缩到 1 MB 内未出现小字识别下降，不需要调整 JPEG 质量或分辨率阶梯。** 局限见 §5。

## 1. uvicorn 真实进程演练

- 命令（同 AGENTS.md，单 worker）：`uv run uvicorn --app-dir src app.main:create_app --factory --workers 1 --host 127.0.0.1 --port 8000`，环境变量 `DATA_DIR`、`FILE_DIR` 指向 `/tmp` 下的独立临时目录（演练后已删除）。
- **启动顺序**：日志依次为 `Started server process` → `Waiting for application startup` → `reconcile_done`（count=0）→ `cleanup_done`（count=0）→ `Application startup complete` → `Uvicorn running on http://127.0.0.1:8000`。目录与两个库（`drafts.db`、`resumes.db`、`drafts/`、`file/`）在启动完成时均已存在。注：建目录与初始化数据库两步本身不打日志，其先于对账由“对账读取 `resumes.db` 成功”间接体现，顺序的直接断言在 `tests/core/test_lifecycle.py`。
- **完整流程（curl，真实模型）**

| 步骤 | 结果 |
|---|---|
| ① 上传文本层 PDF | 201，`Set-Cookie: draft_token=…; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`；响应键 `draft_id/original_file/fields/created_at/updated_at/expires_at`；22 个字段状态均为 `recognized` 或 `missing`；耗时约 4.8 s |
| ② GET current | 200，Cookie 属性相同（续期） |
| ③ PATCH current | 200，被改字段状态 `confirmed`，未改字段保持 `recognized`，Cookie 续期 |
| ④ POST resumes | 201，`already_saved=false`，`Set-Cookie: draft_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` |
| 数据层 | `resumes` 1 行，`work_experiences` 2 行，`educations` 1 行；`file/` 恰 1 个文件，`file_path = <id>.pdf`，与上传文件逐字节相同（`cmp`）；`drafts` 0 行，`data/drafts/` 为空 |
| 再次上传同一人并确认 | 200，`already_saved=true`，`resume_id` 与首次一致；`resumes` 仍 1 行，`file/` 仍 1 个文件；Cookie 被清除 |

- **错误码**：`confirmed:"yes"` → 422 `confirmation_required`；`confirmed:false` → 422 `confirmation_required`；无 Cookie 的 GET / POST resumes → 404 `draft_not_found`；`phone:"12"` → 422 `validation_failed`（`details=[{field:phone, reason:invalid_format}]`）；无文件 → 400 `file_missing`；内容不符 → 400 `file_content_mismatch`；`.exe` → 415 `unsupported_file_type`；空文件 → 400 `file_empty`；10 MB + 1 字节 → 413 `file_too_large`。错误体均只含 `code/message/request_id(/details)`。
- **日志检查**：服务端日志共 74 行，事件仅 `reconcile_done`、`cleanup_done`、`draft_created`、`model_call`、`resume_saved`、`resume_duplicate`、`request_failed`；检索不到合成姓名、手机号、邮箱域名、文件名、`draft_token`、`sk-`。
- **优雅退出**：对进程发 SIGINT（等同 Ctrl+C）后日志为 `Shutting down` → `Waiting for application shutdown` → `Application shutdown complete` → `Finished server process`；无 `scheduler_stop_timeout` 告警（调度线程在超时内退出）；端口 8000 释放，无残留 uvicorn 进程。

## 2. 并发：5 个并发上传（真实模型）

- 5 份不同虚构人物的文本层 PDF 同时上传：全部 201，单次耗时 **1.9 / 2.3 / 2.5 / 2.8 / 3.0 s**（并发总墙钟约 3 s，对比单次约 3.5–4.8 s，无串行化迹象）。
- **不串数据**：5 个 Cookie 各自 GET 到的姓名、手机号、邮箱与自己上传的完全一致（5/5）。
- 并发确认：5 个全部 201；`resumes` 共 6 行（含前面的 1 行），手机号键与文件路径各 6 个不同值；`file/` 6 个文件、0 个 tmp；`drafts` 0 行、`data/drafts/` 为空；每行姓名、邮箱与对应人物一致（5/5）。

## 3. 真实 DeepSeek spike（`deepseek-flash`，经项目自己的 `DeepSeekClient`）

- 方法：直接调用 `DeepSeekClient.parse`（与应用同一路径，含本地 PDF 转换与图片压缩），再经 `ParseNormalizer` 后与合成真值逐字段对比；外发字节数由传输层记录的请求体长度得出（预算上限 995,904；任务口径 996,000）。每个样本跑 1 次。
- 对比口径：姓名/邮箱忽略空白与大小写；手机号、出生年月、工作年限只比较数字；城市/学历/职位为“真值包含于识别值”；技能为集合包含；经历按公司/学校定位后比较职位、专业、学历与起止日期（“至今/Present”视为等价）。每个样本 3 项联系方式 + 14 项标量/经历字段 + 6 个日期。

| 样本 | 原文件 | 外发请求体 | 图片（长边×短边，字节） | 耗时 | prompt / completion tokens | 联系方式 | 日期 | 其他字段 |
|---|---:|---:|---|---:|---|---|---|---|
| 文本层 PDF（英文，1 页） | 1,256 B | 3,254 B | 无（纯文本） | 3.5 s | 767 / 837 | 3/3 | 6/6 | 14/14 |
| 扫描式 PDF（中文，无文本层，渲染成图） | 105,544 B | 91,817 B | 1600×1131，66,804 B | 4.1 s | 1,623 / 886 | 3/3 | 6/6 | 14/14 |
| 照片 PNG（中文，1240×1754） | 114,361 B | 96,443 B | 1600×1131，70,306 B | 4.1 s | 1,615 / 812 | 3/3 | 6/6 | 14/14 |
| 照片 JPEG（中文，3000×4000，带倾斜/噪点） | 728,173 B | 104,519 B | 1600×1200，76,364 B | 3.9 s | 1,624 / 778 | 3/3 | 6/6 | 14/14 |
| **大照片 JPEG（9,542,451 B ≈ 9.1 MiB，4000×5600，重噪点）** | 9,542,451 B | 284,843 B | 1600×1143，211,608 B | 4.3 s | 1,615 / 869 | 3/3 | 6/6 | 14/14 |
| 小字照片（中文，页面字号 15 px） | 925,710 B | 71,983 B | 1600×1143，51,963 B | 3.5 s | 1,615 / 816 | 3/3 | 6/6 | 14/14 |
| **极小字照片（页面字号 11 px）** | 886,157 B | 52,475 B | 1600×1143，37,330 B | 3.6 s | 1,615 / 727 | 3/3 | 6/6 | 14/14 |
| 多页混合 PDF（文本页 + 图片页 + 文本页） | 86,512 B | 93,904 B | 2 张：1600×1131（52,162 B、15,927 B） | 4.2 s | 2,698 / 851 | 3/3 | 6/6 | 14/14 |
| **5 页扫描 PDF（高噪点，预算受限）** | 7,798,560 B | **786,865 B** | 5 张 1600×1131，各约 116–118 KB | 5.3 s | 5,663 / 830 | 3/3 | 6/6 | 14/14 |

- 所有样本：调用成功；请求体均 ≤ 996,000 字节（最大 786,865）；无错误码；无字段错误（`wrong_fields` 全空）。
- **重点结论：缩到 1 MB 内后小字（手机号、邮箱、日期）仍被正确识别。**
  - 常规单页（含 9.5 MB 大照片）压缩后只有 50–285 KB，远低于预算，压缩阶梯停在最高档（长边 1600 px、JPEG 质量约 80，量化表首项 6），预算在单页场景下不构成约束。
  - 唯一让预算真正起作用的是 5 页高噪点扫描 PDF：每张图被压到约 116–118 KB（量化表首项 23，约对应质量 35，即质量阶梯下限，长边仍为 1600 px），总体 786,865 B 仍在预算内，手机号、邮箱、全部日期仍 100% 正确。
  - 页面字号压到 11 px（相当于很密的 A4）并缩到长边 1600 px 后仍全对。
- **调整建议：目前没有证据表明需要提高 JPEG 质量下限或调整分辨率阶梯，建议保持现状。** 若以后要更保守，可在联调时用真实手机拍摄的低光、手写体、折痕扫描件再测一轮（见 §5），再决定是否把质量下限从 35 提到 50。

## 4. 清理与合规确认

- uvicorn 进程已退出，端口 8000 无监听，无 `uvicorn` / `app.main:create_app` 残留进程；临时目录（含样本、临时库、日志）已删除；`.env` 全程未被读取内容或回显（仅用 `cut -d= -f1` 看过变量名 `DEEPSEEK_API_KEY`，以及由应用自身从环境加载）。
- 仓库未提交任何样本、日志、密钥；本文件只含结果与数字。

## 5. 局限与未覆盖

- 样本是用字体渲染的合成页面（中文 Hiragino Sans GB、英文 Helvetica），加了倾斜、模糊和噪点；**不含手写体、真实相机的低光/透视/折痕、复杂版式（多栏、表格、头像照片）**，因此 100% 不代表真实简历的准确率；每个样本只跑 1 次，未评估模型输出的随机波动。
- 文本层 PDF 只测了英文（项目的最小 PDF 构造器不嵌入中文字体）；中文走了图片路径。
- 并发只测了 5 路，未做压测；模型耗时随服务端负载波动，样本耗时仅供参考。
- 未测：模型超时（60 s）、429/余额不足等真实服务端失败（已由 `MockTransport` 单元测试覆盖）；供应商留存与训练授权证明（ADR-001/C-01，需 DL 在供应商侧确认）。
