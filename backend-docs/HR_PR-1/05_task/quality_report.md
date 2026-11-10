# 质量指标实测与交付自检草稿 — HR_PR-1 backend（任务 3.3）

- 日期：2026-11-10；基线提交：`4c688d6`（3.2 完成后）；实测人：backend worker
- 结论先行：**覆盖率、ruff、重复代码达标；CRAP 有 1 个函数超标（`build_user_blocks`，14.0 > 10），未达标，未修改代码，等待裁决。** 其余指标见下，全部为本次实测，未实测项已标明。

## 1. 测试

| 项 | 结果 | 来源 |
|---|---|---|
| `uv sync --frozen` | ✅ Checked 36 packages | 命令输出 |
| `uv run python -m compileall src`（先清 `__pycache__`） | ✅ 真实编译，输出 `Compiling` 行 | 命令输出 |
| `uv run pytest` | ✅ **999 passed**，3 条警告（Starlette 对 `httpx` 的弃用提示 1 条；e2e 伪造 Cookie 用例的 per-request cookies 弃用提示 2 条） | 命令输出 |
| 本阶段新增用例 | 3.1 契约 97，3.2 端到端/脱敏 25，文档同步补 `lifecycle` 超时用例 1 | 基线 876 → 999 |

## 2. 覆盖率

- **来源**：`uv run pytest --cov=app --cov-branch`（pytest-cov 7.1.0 / coverage.py），行 + 分支合计；分层数字由 coverage JSON 报告按目录汇总。
- 总计：1943 行 / 358 分支，**99%**（未覆盖 24 行、10 个分支）。

| 层 | 语句 | 已覆盖 | 分支 | 已覆盖 | 行+分支覆盖率 |
|---|---:|---:|---:|---:|---:|
| services | 701 | 686 | 210 | 205 | 97.8% |
| repositories | 315 | 311 | 40 | 40 | 98.9% |
| clients | 273 | 271 | 58 | 57 | 99.1% |
| core | 298 | 296 | 26 | 26 | 99.4% |
| api | 173 | 172 | 24 | 20 | 97.5% |
| schemas | 160 | 160 | 0 | 0 | 100% |
| app（根，`main.py`） | 23 | 23 | 0 | 0 | 100% |

- 要求“核心分支覆盖率 ≥ 85%（services、repositories、clients、core）”：✅ 四层均 ≥ 97.8%。
- 覆盖最低的文件：`services/resume_service.py` 91.6%，未覆盖为第七批审查已列的防御性分支（`duplicate_vanished`、`_resolve_source` 抛 `ValueError`、stage 时归档侧缺失、`tmp_cleanup_failed` 日志）。

## 3. 静态检查

| 命令 | 结果 |
|---|---|
| `uv run ruff check .` | ✅ All checks passed |
| `uv run ruff format --check .` | ✅ 全部已格式化 |

## 4. CRAP（`~/tools/crapper`，已运行）

- 命令：在代码根执行 `~/tools/crapper/crapper src`。工具对 Python 自行用 `coverage run -m pytest`（`--source=src`）生成 LCOV 再计算，**覆盖率来源是工具自己重跑的 pytest 覆盖数据**，不是上节的 pytest-cov 报告；公式 `CRAP = CC² × (1 − 覆盖率)³ + CC`。
- 共统计 198 个函数/方法：**CRAP > 10 的 1 个**，> 5 的 21 个。

| 函数 | CC | 覆盖率 | CRAP | 判定 |
|---|---:|---:|---:|---|
| `app.clients.deepseek_client.build_user_blocks` | 14 | 100% | **14.0** | ❌ 超过 10（覆盖率已 100%，只能靠降低复杂度） |
| `app.services.parse_normalizer._entry` | 10 | 94.1% | 10.0 | ✅ 恰在上限 |
| `app.services.parse_normalizer._string_items` | 10 | 100% | 10.0 | ✅ 恰在上限 |
| `field_validation._path`、`parse_normalizer._block`、`reconcile_service._remove_orphans` | 9 | 100% | 9.0 | ✅ |

- **未达标项处理建议**：`build_user_blocks` 是模型外发路径（B-02/请求体预算），任务 3.3 只做实测，本次**未改动**。建议另立一个小任务，把“PDF/图片分块”“按预算编码”“总量复核”拆成 2–3 个函数；该路径有完整测试（请求体预算、PDF 转换、超限不外发）可兜底。需要 DL 裁决是否做以及何时做。

## 5. 重复代码（`~/tools/dryer`，已运行）

- 命令：`~/tools/dryer/dryer src`（默认阈值 0.82、最少 4 行）：**No duplicate candidates found**。
- 放宽到 `--threshold 0.8 --min-lines 3`：仅报告 `core/db.py` 的 `init_drafts_db` / `init_resumes_db` 两个 3 行薄封装（相似度 1.0，职责不同，不合并）。
- 项目规范要求“相似度 < 0.8 时提取复用”：✅ 无需提取。
- 注：dryer 首次运行在 `~/tools/dryer/.venv` 创建了虚拟环境（工具目录，不在本仓库）；两个工具都会在代码根写 `.metrics/`、`target/`，已在记录结果后删除，未提交。

## 6. 安全与红线自检

| 项 | 结果 | 证据 |
|---|---|---|
| B-01 密钥不入库/日志 | ✅ | 3.2：日志与 stdout 全量断言不含 API 密钥；`data/`、`file/` 字节扫描无密钥；`.env.example` 仅占位符；仓库（git 会纳入的文件）密钥模式扫描无命中 |
| B-02 外发仅限获批 | ✅ | 3.2 断言唯一外发主机为 `api.deepseek.com`、每次上传仅 1 次、更新与确认不调用模型；Settings 锁定模型与地址（第二批审查） |
| B-03 日志/错误响应脱敏 | ✅ | 3.2：姓名/手机/邮箱/原文件名/模型响应/令牌及哈希均不出现在日志、stdout；12 类错误请求不回显提交的值；内部异常无细节 |
| B-04 确认前不入正式库 | ✅ | 3.2：恶意模型输出（声称 confirmed、注入文本、额外键）不产生 `confirmed`，上传后正式库 0 行、`file/` 为空 |
| B-05 记录必关联原文件 | ✅ | 2.4 故障注入 + 2.5/2.7 对账；3.2：终态文件内容与上传一致，启动对账先于首个请求 |
| B-06 仅合成数据 | ✅ | 所有测试夹具为合成数据，全局禁网夹具，3.2 使用 `MockTransport` |

## 7. 契约一致性（3.1）

- 对冻结 OpenAPI 0.1.1 的 4 个接口、全部 (路径, 方法, 状态码) 共 25 项均有真实请求产出并通过 `jsonschema` 校验；13 个错误码全部被产出；`Set-Cookie` 属性与描述一致；`maxLength`/`maxItems`/`pattern` 与代码一致且服务端按限拒绝（`too_long`）。契约文件未改动。
- **已知差异**：`app.openapi()` 是 FastAPI 自动生成，只含成功状态码和默认 422，不含统一错误处理器产生的 4xx/5xx，因此状态码集合以“真实响应”为准比对，成功状态码仍与 `app.openapi()` 比对。若要让生成文档带全错误响应，需在路由上声明 `responses`（代码改动，未做）。

## 8. 未完成 / 需要裁决

1. `build_user_blocks` CRAP 14.0 超标（见 §4）。
2. 本地存在被忽略的 `codes/hr-collection-agent-backend/.env`（未跟踪）。我没有读取其内容；仓库扫描只覆盖 git 会纳入的文件，该文件不在范围内。请持有者确认它只留在本机。
3. 未做：uvicorn 真实进程启动演练（生命周期仅以 `TestClient` 的 `with` 块验证）；真实 DeepSeek 调用（C-01/ADR-001 待核验，需 DL 提供凭证后另行 spike）；约 5 人并发的容量实测（AGENTS.md 待确认清单 3a）；`~/tools/mutator` 未运行（各任务内以手工变异验证代替）。

## 9. 自审结论草稿

**有风险需关注**：功能、契约、脱敏、故障恢复与对账均有测试与实测证据，覆盖率与静态检查达标；唯一未达标的量化指标是 `build_user_blocks` 的 CRAP（14.0），需 DL 裁决处理方式；并发容量与真实模型联调属于集成阶段待办。
