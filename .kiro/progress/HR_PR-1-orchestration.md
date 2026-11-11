# HR_PR-1 主 agent 编排接续文件

| 项 | 内容 |
|---|---|
| 当前级别 | v2 需求变更（Type C）：整体 L2，红线功能点（B-03 日志、B-04 建议校验、B-05 更新补偿）按 L3 深度验证 |
| 状态 | 🔄 v2 重跑清单执行到第 9 项：编码第 2 批（阶段 2）进行中 |
| 最后更新 | 2026-11-11，feature `8afff0b` |
| 权威进度 | `01-requirements/HR_PR-1/_progress.md`（流程表、人类门控、「需求变更记录 → 重跑清单（v2）/ v2.1 小表」、贡献记录、关键决策） |

> 本文件只记录**编排的接续上下文**，供新会话或新 worker 接手。业务结论以 `_progress.md`、`cross-workbench-review.md`、各设计文档为准，这里不重复。
> 新会话接手：先读本文件，再读 `_progress.md` 的「重跑清单（v2）」与最近 10 条贡献记录，不需要回看历史对话。

---

## 一、编排结构

- **主 agent（协调者）**：Kiro，工作区 `/Users/yanyin/Desktop/Projects/格兰富/workspce-coding`，分支 `feature`，role `dev-lead`。只做合并、复验、审视、记录，不写业务代码。
- **Orca**：repo id `bb1c2ec0-15e2-4fe2-9da4-3e030fbd0567`；Run `run_5ec58456618d`。
- **worker**（kiro-cli，`--keep-open`）：

| worktree | 分支 | 路径 | role | 最近 dispatch | 状态（2026-11-11） |
|---|---|---|---|---|---|
| backend | feature-backend | `/Users/yanyin/orca/workspaces/workspce-coding/feature-backend` | backend | `ctx_4cc071af025c` | 空闲（阶段 1 已交付） |
| frontend | feature-frontend | `/Users/yanyin/orca/workspaces/workspce-coding/feature-frontend` | frontend | `ctx_0788935e6ecd` | 空闲（阶段 1 已交付） |
| QA | feature-qa | `/Users/yanyin/orca/workspaces/workspce-coding/feature-qa` | qa（`code_roots: {}`，不读代码） | `ctx_e7bd268b345e` | 空闲（5q 已完成，11q 待开发自测后） |
| 审查 agent | review-batch1 | `/Users/yanyin/orca/workspaces/workspce-coding/review-batch1` | dev-lead（只读审查） | `ctx_d01f5e56ce74` | 空闲（第 1 批已交付，已 /compact） |

## 二、启动 / 下发 worker 的做法（已踩过的坑）

0. **worker 管理**：可能复用的 agent 不关闭，同 worktree 空闲时 send 复用；上下文压缩见第六节。
1. kiro 的 trust-all 确认已全局关闭（`chat.disableTrustAllConfirmation = true`）。
2. **新 worktree** 首次启动会卡在"Trust this workspace?"：`orca terminal create --worktree path:<路径> --command "kiro-cli chat --tui --trust-all-tools"`，`orca terminal send --terminal <h> --text "" --enter`（回车即 Trust），再 `--text "/quit" --enter`，然后 `orca terminal close`。上表四个 worktree 都已信任。
3. 模型 auto：worktree 内 `kiro-cli settings --workspace chat.defaultModel auto`；`.kiro/settings/` 已加入 `.git/info/exclude`。
4. 新开：`orca orchestration worker-start --spec-file <md> --task-title "<标题>" --worktree "id:bb1c2ec0-15e2-4fe2-9da4-3e030fbd0567::<路径>" --agent kiro --keep-open --json`。spec 写到 /tmp，用完删除。
5. 复用：`orca orchestration send --to dispatch:<最新 dispatch> --subject ... --body "$(cat /tmp/x.md)"`。回执只有 `messageId` 也表示已送达，**不要重发**。
6. 收到 worker_done：`git merge --no-ff <分支>` 到 feature；`_progress.md` 几乎每次都有相邻行冲突（SV-06），按"各取本侧行"解决。代码阶段在主工作区自己复跑：backend `uv sync --frozen`、compileall、pytest、ruff；frontend `npm ci`、lint、test、build。
7. spec 固定包含：先 `git merge --no-ff feature`；只改本 Workbench 在 `_progress.md` 的行与一行贡献记录；不 amend、不 push（仓库无远端，SV-07）；发现缺口用 ask，不自行扩展；停在 skill 规定的门控。
9. 多个 worker 共用 `/tmp`，同名临时脚本会互相覆盖（backend 第 2 批报告 `/tmp/mark.py` 被覆盖）：spec 要求 worker 用 `mktemp -d` 的私有目录；主 agent 自己的 spec 文件名也带前缀。
8. 主 agent 自己的教训：脚本修改与 `git commit` 不要用 `;` 串在一起（断言失败仍会提交）；不对自己的提交 `--amend`。

## 三、v2 当前进度与下一步

| 重跑清单项 | 状态 |
|---|---|
| 1 PRD、2 HLD（含 v2.1）、3a/3b 影响分析、4 跨 Workbench 审视、5 需求汇总、5q QA 用例（86 条） | ✅ |
| 6a backend Schema + OpenAPI 0.2.0（冻结）、6b frontend 接口消费规范 v0.3 | ✅ |
| 7a backend 技术设计（`design.md` v0.4，8368919） | ✅ DL 确认 |
| 7b frontend 技术设计（`design.md` v2.0，34ff8f7） | ✅ DL 确认 |
| 8a/8b 任务拆分 + `AGENTS.md` 更新 | ✅ DL 确认（tasks.md v2.0；AGENTS.md 已确认；同意删除 backend `tests/selftest/`） |
| 9a/9b 编码 | 🔄 第 3 批（阶段 3）已合并（daf882d），审查中 `ctx_300e190ecf86`（review-batch1，backend+frontend 一并）；第 2 批两侧均 ✅（backend 25bbe7b、frontend 772ffc1）。第 1 批（阶段 1）✅ 审查通过（be3f7be）；第 2 批（阶段 2，含第一批 9 条 SUGGEST）进行中：backend 已审查通过（a5ec07e，25bbe7b）；frontend 已合并（8c43072，主工作区复验 lint 0、vitest 611 通过 1 todo、build 通过），审查中 `ctx_7eb1a67cf4fe`（review-batch1）。每阶段一批审查，共 ≤ 3 批 |
| 10 审查（每批）→ 11a/11b 自测 → 11q QA 执行（AT/E2E/UAT）→ 12 DL 最终 Review | 未开始 |

## 四、DL 的长期决定（易忘）

- **授权采纳建议**：需澄清的问题只要不特殊，一律按 AI 建议采纳并注明"DL 授权采纳建议"；特殊 = 红线、推翻已确认决策、扩大范围。人类门控（审批、确认、签署）仍逐个提交 DL。
- **严格按 skill 推进**：v2 的目的之一是验证这套 skill，问题登记在 `.kiro/docs/skill-validation/HR_PR-1-v2-skill问题登记.md`（SV-01..13，登记"会影响流程"的问题，不登记措辞）。
- **票号**：v2 维持在 HR_PR-1（DL 已实测 v1 功能正常，变更源于体验），不另开 HR_PR-2。
- **QA**：v1 不补做；v2 由 role=qa 的独立 worker 生成用例；11q 只执行 AT/E2E/UAT（建议：AT/E2E 由 QA worker 用 Orca 浏览器 + 接口调用执行，模型桩为准、真实模型抽查 2 条；UAT 5 条由 DL 亲自执行，待 11q 时确认），报告按 `doc-templates/10_qa_test_report_template.md` 写到 `qa/qa_test_report.md`。
- **模板同步**：开发 worker 在下一批 spec 第 0 步 `merge feature` 时带上新模板，不在任务执行中途同步。
- **防止发散**：只做 requirements v2 已有的能力；测试深度按风险分配。
- **不要扩散，安全第一（DL 2026-11-11 再次强调）**：每批 spec 必须带"不扩散 + 红线清单（B-01..B-05、会话归属、F-01..F-03）"；进度与安全冲突时以安全为准并请示 DL。
- **编排同步所需的本地提交已授权**（不推送）。

## 五、关键事实与约束

- DeepSeek：只用 `deepseek-flash`，外发地址只允许 `https://api.deepseek.com`；PDF 本地转换。凭证在 `feature-backend/codes/hr-collection-agent-backend/.env`，主工作区同路径另有一份副本（600、gitignore，用于本地试用）。建议 POC 后轮换。
- 契约：OpenAPI **0.2.0 已冻结**（`backend-docs/HR_PR-1/03_api/openapi.yaml`），改动须经 cross-workbench-review。校验：`uv run --with openapi-spec-validator==0.7.1 python -c ...`（临时环境，不改项目依赖）。
- 依赖：公共源安装、锁定精确版本（项目例外）；新增依赖须 DL 同意。
- 本机部署：后端只监听 127.0.0.1:8000（ADR-009 的访问边界），前端 dev proxy 指向 `http://127.0.0.1:8000`。
- 裁决位置：`cross-workbench-review.md`（v1：C/D/O/G/F/CR；v2：X-01..X-10a、Y-01/02、O2-01..05、G2-02..04）；`requirements_plan.md`（TQ-v2-*）；ADR-001..009（project-memory）。

## 六、上下文控制（DL 2026-11-11：尽量不关 worker，但要控制 token 成本）

- worker：**不关闭、继续复用**；每次交付后、worker 空闲时，主 agent 向其终端发送 `/compact`（`orca terminal send --terminal <h> --text "/compact" --enter`），压缩后会话摘要会显示在屏幕上（`orca terminal read --terminal <h> --screen`）。只在 worker 空闲（state=succeeded）时发，不在执行中发。
- worker_done 控制在 10 行内：提交哈希、产出、门控所需结论、需澄清点。
- 主 agent：不整篇读设计文档，复核用抽查；会话过长时由 DL 执行 `/compact`，或新开会话读本文件接手。
