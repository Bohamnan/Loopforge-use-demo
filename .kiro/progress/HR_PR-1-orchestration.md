# HR_PR-1 主 agent 编排接续文件

| 项 | 内容 |
|---|---|
| 当前级别 | L3（新项目、跨前后端、外部模型对接） |
| 状态 | ▶ 已恢复（2026-11-10）：DL 新增全局规则“防止过度”（delivery.md 第八节），HR_PR-1 后续按 L2；frontend worker 正执行剩余 31 条自测 + 修集成测试超时；/tmp/hr_sample 已重建（结束后删） |
| 最后更新 | 2026-11-10，feature `505d02d` |
| 权威进度 | `01-requirements/HR_PR-1/_progress.md`（流程表、贡献记录、末尾「暂停恢复清单」） |

> 本文件只记录**编排的接续上下文**。业务结论以 `_progress.md` 和各审查报告为准，本文件不重复。

---

## 一、编排结构

- **主 agent（协调者）**：Kiro，工作区 `/Users/yanyin/Desktop/Projects/格兰富/workspce-coding`，分支 `feature`，role `dev-lead`。只做合并、复验、审视、记录，不写业务代码。
- **Orca**：repo id `bb1c2ec0-15e2-4fe2-9da4-3e030fbd0567`；Run `run_2dde01eb480f`。
- **worker**（kiro-cli，受监督，`--keep-open`，**当前全部已关闭**）：

| worktree | 分支 | 路径 | local_profile role | 暂停时 HEAD |
|---|---|---|---|---|
| backend | feature-backend | `/Users/yanyin/orca/workspaces/workspce-coding/feature-backend` | backend | `89ea69f`（已合并） |
| frontend | feature-frontend | `/Users/yanyin/orca/workspaces/workspce-coding/feature-frontend` | frontend | `d306368`（**4 个提交未合并**） |
| 审查 agent | review-batch1 | `/Users/yanyin/orca/workspaces/workspce-coding/review-batch1` | dev-lead（只读审查） | `b7ce9f8` |

## 二、启动 / 恢复 worker 的做法（已踩过的坑）

0. **worker 管理（DL 要求）**：还可能复用的 agent 不要关闭；只关闭重复、多余的。同一 worktree 已有空闲 agent 时用 `send --to dispatch:<id>` 复用，不要再 `worker-start` 新开。

1. kiro 的 trust-all 确认已全局关闭（`chat.disableTrustAllConfirmation = true`），不会再拦截启动。
2. **新 worktree** 第一次启动 kiro 会卡在"Trust this workspace?"：先用 `orca terminal create --worktree <id> --command "kiro-cli chat --tui --trust-all-tools"` 打开，回车选 Trust，`/quit` 后关闭这个终端，再执行 `worker-start`。上面三个 worktree 都已信任过。
3. 模型用 auto：在 worktree 里执行 `kiro-cli settings --workspace chat.defaultModel auto`（已设置）。生成的 `.kiro/settings/` 已加入 `.git/info/exclude`。
4. 启动：`orca orchestration worker-start --spec-file <md> --task-title "<标题>" --worktree "id:bb1c2ec0-15e2-4fe2-9da4-3e030fbd0567::<路径>" --agent kiro --keep-open --json`。spec 写到 /tmp，用完删除。
5. 下发后续任务：`orca orchestration send --to dispatch:<最新 dispatch> --subject ... --body "$(cat /tmp/x.md)"`。回复 worker 的提问：`orca orchestration reply --id <msg>`。
6. 收到 worker_done 后先 `git merge --no-ff <分支>` 到 feature，再在主工作区**自己复跑**验证：
   - backend：`uv sync --frozen`、compileall、pytest、ruff。
   - frontend：`npm ci --registry=https://registry.npmjs.org`、lint、test、build。
7. 常见问题：
   - worker 偶尔没发 worker_done 就结束本轮，Orca 会发 escalation。处理：send 让它补发，或者推它继续。
   - worker_done 有时挂到旧的 dispatch 上，导致新 dispatch 没关闭：让 worker 在正确的 dispatch 上补发。
8. 任务说明（spec）固定包含：同步 feature、测试先行、真实验证要附用例数、每个任务单独提交、不 push 不 amend、只 add 具体路径、不改 `_progress.md`、遇到停止条件用 ask。HIGH_RISK 任务完成后**不标 ✅**，先审查，再由 DL 确认。

## 三、当前进度（暂停时）

| Workbench | 已完成（tasks.md ✅） | 下一步 |
|---|---|---|
| backend（20 个任务） | 1.1–1.10、2.1–2.3 | 第六批审查（存储加固 + 2.1–2.3，合并 `cfb87b3`）**被中断，需重新下发**；审查通过后做 2.4（HIGH_RISK：确认保存 / 幂等 ADR-004 / B-05 补偿 ADR-005）→ 2.5（HIGH_RISK：启动对账）→ 2.6 清理 → 2.7 lifespan → 3.1–3.3 |
| frontend（15 个任务） | 1.1–1.6、2.1–2.8 | 跟踪项清理已提交 `c47bc02`、`18363a6`、`0f07f40`、`d306368`（未合并）；任务 3.1 做到一半，未提交文件 `src/test/FakeBackend.ts` 已保留 |
| 联调 | — | backend 2.x 完成后，本机同时启动前后端，用合成简历走完整流程，并做窄屏实机验证 |

## 四、待 DL 决定（随第六批审查一起提交）

- backend 2.1–2.3 的偏差：(1) PATCH 一次性合并返回 Pydantic 错误和核心字段的语义错误；(3) 模型给了值却标 missing 时，保留值并降为 uncertain；(4) 标量去首尾空白，手机号保留展示值。
- 上传请求体缺少前置大小限制（Starlette 会先把整个请求落盘），POC 阶段是否接受。

## 五、关键事实与约束（易忘）

- DeepSeek：只用 `deepseek-flash`（Settings 用 Literal 锁定）；外发地址只允许 `https://api.deepseek.com`；PDF 在本地转换（pypdfium2：有文本层就发文本，否则渲染 PNG，最多 5 页），见 ADR-001 修订 1。凭证**只存在** `feature-backend/codes/hr-collection-agent-backend/.env`（600，已 gitignore）。建议 POC 后轮换。
- 契约：OpenAPI **0.1.1 已冻结**（`backend-docs/HR_PR-1/03_api/openapi.yaml`），改动必须经 cross-workbench-review。
- 依赖：不用 Nexus，从公共源安装，锁定精确版本（DL 决定的项目例外）；新增依赖须先申请。
- 代码放在本仓库 `codes/` 下，随工作台分支管理（DL 决定，按简单方式）。
- 本机部署：SQLite 用 Python 自带（3.50.4，要求 ≥3.35）；frontend dev proxy 指向 `http://127.0.0.1:8000`（不用 localhost）。
- 裁决记录位置：`01-requirements/HR_PR-1/cross-workbench-review.md`（C/D/O/G/F/CR 系列）、`prototype-review.md`（P 系列）、`*-docs/HR_PR-1/10_review/code_review.md`（各批审查与「Dev Lead 裁决」）、`project-memory/adrs/`（ADR-001..006）。
- 遗留事项：`project-memory/adr_index.md` 第 32–33 行是模板自带的示例行，ADR 编号重复，待另行清理。

## 六、恢复步骤（DL 唤醒后）

1. `orca orchestration worker-list --json` 核对各 worker 的状态；各 worktree 执行 `git status`。
2. 重新启动审查 agent（Task `task_2e0f759e789f`），重新下发第六批审查。
3. 重新启动 frontend worker（Task `task_83570e762162`），从任务 3.1 继续，先检查 FakeBackend.ts；完成后合并那 4 个跟踪项提交。
4. 第六批审查结论和第四节的待决项一起交给 DL；确认后重新启动 backend worker，下发 2.4。

## 七、本轮结束时的状态与恢复清单（2026-11-10 暂停）

**已完成并合并到 feature**：backend 21/21、frontend 15/15 任务；backend 十批、frontend 十一批审查全部通过；联调与真实样品验证通过；backend 开发自测完成（`backend-docs/HR_PR-1/06_test/dev_self_test_resume.md`，123 条全通过，AC 37/37，1141 passed）；frontend 开发自测设计完成、部分执行（`frontend-docs/HR_PR-1/06_test/dev_self_test_resume.md`）。

**worker**：backend `ctx_06b9a17ca92d`、frontend `ctx_57fceb7f5147`、审查 `ctx_779355a3c1cb` 已释放；backend/frontend 自测 worker 终端保留空闲（按"可能复用的不关"）。服务进程已全部关闭，8000 端口空闲，/tmp/hr_sample 已删（原件仍在 `global-info/简历样品.png`，未入库，已在 .git/info/exclude）。

**恢复步骤**：
1. frontend 补做未执行的 31 条：360/390/768 窄屏与 <44px 按钮定位、SUGGEST-1 实机复测、刷新恢复/重复保存/覆盖确认/新对话/未提交拦截/格式大小错误/后端不可用，以及 005-IA-03 复测（不确定）。注意：frontend 的 worker 两次因模型流超时停止，需缩小范围、分段提交；与 backend 不能同时占用 8000 端口。
2. 处理 frontend 集成测试的偶发超时：`ResumeCollectionPage.integration.test.tsx` 两条用例单个耗时约 5 秒，接近 vitest 默认 5 秒上限，全量运行时偶发失败（单跑 14/14 通过，其余 649 通过）；建议给该文件设置更大的 testTimeout，并在 code 里修复后重跑全量。
3. DL 确认两份自测文档 → test-data-script-generator（造数脚本）→ 复验 → DL 最终 Review。
4. backend 自测遗留风险（见自测文档）：真实模型偶发 502/504（约 50 次调用 2 次 502、1 次 504）；多 file 部件不显式拒绝。
5. 待 DL 决定的识别细节：职位字段带出内部部门标记、技能连接词被改写、"主要客户"无对应字段。
