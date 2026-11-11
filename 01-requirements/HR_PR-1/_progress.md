# HR_PR-1 进度日志

> 由 Skill 自动维护，勿手动修改核心字段。如需备注可在“备注”列追加。

---

## 当前状态

| 字段 | 内容 |
|------|------|
| **PRD** | `01-requirements/HR_PR-1/prd.md` |
| **当前 Skill** | requirement-change-router（v2，Type C） |
| **当前阶段** | 🔄 需求变更 v2 已路由（DL 2026-11-11 确认）：新增对话修改与问答、历史会话、已归档简历查看。v1 产物中受影响阶段已标 ⚠️，按下方「重跑清单（v2）」从 PRD 开始增量重跑。v1 的开发自测与造数脚本收尾不再单独推进，并入 v2 自测 |
| **状态** | 🔄 v2 重跑中（PRD、HLD、影响分析、跨 Workbench review、需求汇总已完成；下一步：5q QA 用例 与 6a backend Schema+接口 并行）；执行深度按 L2，红线功能点按 L3 深度验证（见 `.kiro/decisions/design/2026-11-11-HR_PR-1需求变更v2.md`） |
| **最后更新** | 2026-11-11 |

**状态图例**：`🔄 进行中` / `⏸️ 等待人类确认` / `✅ 已完成` / `❌ 阻断`

---

## Workbench 分析分配

| Workbench | 负责人 | 状态 | 产出文件 | 待澄清问题数 | 完成时间 |
|---|-------|------|---------|:-----------:|---------|
| backend | Yin Yang | ✅ v2 影响分析完成（924a75b；v1 同为 ✅） | `backend-docs/HR_PR-1/00_impact_analysis.md` | 6（v2：Q-backend-01..06） | 2026-11-11 |
| frontend | Yin Yang | ✅ v2 影响分析完成（delta 覆盖版，1476ce6） | `frontend-docs/HR_PR-1/00_impact_analysis.md`（v1 另有 `frontend-docs/HR_PR-1/01_requirements/requirements_plan.md`） | 10（v2，Q-frontend-v2-01..10；v1 的 9 条已裁决） | 2026-11-11 |

**阻断条件**：
- `requirements-analyst（汇总）`：所有参与 Workbench 状态必须为 ✅。

---

## 目标仓库状态

| Workbench | 目标仓库状态（新项目／已有代码） | 仓库约定 AGENTS.md 状态（无／草稿／已确认／待复核） | 判定人 | 判定时间 |
|---|---|---|---|---|
| backend | 新项目（初始路径不存在） | 已确认 | Dev Lead | 2026-11-10 |
| frontend | 新项目（初始路径不存在） | 已确认 | Dev Lead | 2026-11-10 |

---

## 流程进度

| 阶段 | Skill | 执行者 | 状态 | 完成时间 | 产出文件路径 |
|------|-------|-------|------|---------|------------|
| 需求启动（Workbench 检测+业务澄清+派活） | requirement-kickoff | Dev Lead | ✅ | 2026-11-10 | `01-requirements/HR_PR-1/` |
| 解决方案设计 HLD（大型新需求） | solution-designer | Dev Lead | ✅ v2 已批准（门控 1、门控 2；ADR-007/008/009） | 2026-11-11 | `01-requirements/HR_PR-1/solution-design.md` |
| 仓库约定初稿与确认（仅新项目 Workbench） | solution-designer（Step 7） | Dev Lead | ✅ 已确认；未推送（代码目录尚未初始化 Git） | 2026-11-10 | backend、frontend 仓库 `AGENTS.md` |
| Workbench 影响分析（各 Workbench 并行） | impact-analyzer | 各 Workbench 工程师 | ✅ v2 DL review 通过（2026-11-11）：backend 924a75b（6 条待澄清）；frontend 0ee2330 + 1476ce6（10 条待澄清） | 2026-11-11 | `backend-docs/HR_PR-1/00_impact_analysis.md`；`frontend-docs/HR_PR-1/00_impact_analysis.md` |
| 跨 Workbench 一致性 review（仅跨 Workbench 需求） | cross-workbench-reviewer | Dev Lead | ✅ v2/v2.1 已裁决（X-01..X-10a、Y-01、Y-02）；v1 裁决中 C-03、C-06、C-07、C-11、D-01、D-04、D-05、O-01、O-03、O-12 被替代 | 2026-11-11 | `01-requirements/HR_PR-1/cross-workbench-review.md` |
| 需求汇总（第二轮技术 Q&A + requirements.md） | requirements-analyst | Dev Lead/BA | ✅ v2：质量关卡 1 通过（23 条全部填空型）；两侧 requirements.md 增量更新并经 DL 确认（v1 快照 `_history/requirements.v1.md`）；glossary 已按 X-10a 写入 | 2026-11-11 | `backend-docs/HR_PR-1/01_requirements/requirements.md`；`frontend-docs/HR_PR-1/01_requirements/requirements.md` |
| 架构设计（Schema+接口） | architecture-advisor | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：backend（OpenAPI 0.1.0 冻结，0.1.1 待修订 G-01/G-02）/ frontend（Step 2.2 评审通过） | 2026-11-10 | `backend-docs/HR_PR-1/02_schema/`、`03_api/`；`frontend-docs/HR_PR-1/03_api/interface_spec_resume.md` |
| 技术设计 | architecture-advisor | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：backend ✅ / frontend ✅（ADR-006 将被替代） | 2026-11-10 | `backend-docs/HR_PR-1/04_design/design.md`；`frontend-docs/HR_PR-1/04_design/design.md` |
| 任务拆分 | architecture-advisor | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：backend（20 任务 / 91h）/ frontend（15 任务 / 79h） | 2026-11-10 | `backend-docs/HR_PR-1/05_task/tasks.md`；`frontend-docs/HR_PR-1/05_task/tasks.md` |
| 仓库约定补全与复核（仅新项目 Workbench） | architecture-advisor（Step 5） | 各 Workbench 工程师/Dev Lead | ⚠️ 待重审（v2）；v1：backend / frontend 已确认 | 2026-11-10 | backend、frontend 仓库 `AGENTS.md` |
| 代码实现 | feature-developer | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：backend 21/21（含 2.3a，pytest 1001、覆盖率 99%、CRAP 最大 9.0）/ ✅ frontend 15/15（vitest 650、lint 0、build 通过） | — | `codes/hr-collection-agent-backend/`、`codes/hr-collection-agent-frontend/` |
| 代码审查 | code-reviewer | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：backend 第一至第十批 ✅（含 2.4/2.5 HIGH_RISK）；frontend 第一至第十一批 ✅（0 BLOCK） | — | `backend-docs/HR_PR-1/10_review/code_review.md`；`frontend-docs/HR_PR-1/10_review/code_review.md` |
| QA 测试用例（需求确认后，可与开发并行） | qa-test-case | QA（role=qa 的独立 worker） | ✅ v2 用例 86 条（v2 AC 67/67），两个 QA 门控 DL 确认；v1 不补做（DL 2026-11-11）；接口类用例路径待 OpenAPI 0.2.0 冻结后补 | 2026-11-11 | `01-requirements/HR_PR-1/qa/qa_test_cases.md`；`01-requirements/HR_PR-1/qa/qa_data_requirements.md` |
| 开发自测用例 | dev-self-test | 各 Workbench 工程师 | ⚠️ 待重审（v2）；v1：DL 2026-11-11 实测确认功能正常（变更源于体验与预期不符，非缺陷）：backend 123 条全通过（AC 37/37）；frontend 108 条 0 失败 0 未执行（实测 51 + 引用单测 52 + 静态/构建 5，AC 33/33） | 2026-11-10 | `backend-docs/HR_PR-1/06_test/dev_self_test_resume.md`；`frontend-docs/HR_PR-1/06_test/dev_self_test_resume.md` |
| QA 用例执行（开发自测通过后、交付 Review 前） | qa-test-case 产出的用例，手工执行 | QA/Dev Lead | ☐ v2 执行，见重跑清单 11q | — | `01-requirements/HR_PR-1/qa/qa_test_report.md` |
| 造数脚本 | test-data-script-generator | 各 Workbench 工程师/QA | — | — | — |

---

## 人类门控状态

| 门控点 | Skill | 状态 | 等待项 | 完成时间 |
|-------|-------|------|-------|---------|
| 第一轮业务 Q&A 补充完成 | requirement-kickoff | ✅ | BA/业务方确认所有问题已回答 | 2026-11-10 |
| 业务澄清双签 | requirement-kickoff | ✅ | BA/业务方及 Dev Lead 技术侧确认 | 2026-11-10 |
| 术语写入 Memory | requirement-kickoff | ✅ | 无新增业务术语候选 | 2026-11-10 |
| HLD 必要性评估 | requirement-kickoff | ✅ | 两个目标仓库为新项目，必须走 HLD | 2026-11-10 |
| 整体 HLD 审批 | solution-designer | ✅ | HLD 与 ADR-001..003 已批准/接受 | 2026-11-10 |
| 仓库约定确认（仅新项目） | solution-designer | ✅ | backend/frontend `AGENTS.md` 已批准；未推送，代码目录未初始化 Git | 2026-11-10 |
| 所有 Workbench 影响分析完成 | impact-analyzer | ✅ | backend、frontend 均已 ✅ | 2026-11-10 |
| 跨 Workbench 一致性确认 | cross-workbench-reviewer | ✅ | Dev Lead 已完成全部裁决 | 2026-11-10 |
| 第二轮技术 Q&A 裁决 | requirements-analyst | ✅ | DL 确认全部为填空型、无范围变更 | 2026-11-10 |
| v2 需求变更分类确认 | requirement-change-router | ✅ | DL 确认 Type C 及受影响产物 | 2026-11-11 |
| v2 需求修订确认（门控 1） | solution-designer | ✅ | v2 无技术约束引起的需求修订（补确认，SV-02） | 2026-11-11 |
| v2 HLD 整体审批（门控 2） | solution-designer | ✅ | HLD v2、ADR-007/008/009 批准 | 2026-11-11 |
| QA 用例设计确认 | qa-test-case | ✅ | DL 确认：86 条，v2 AC 覆盖 67/67，可直接执行 | 2026-11-11 |
| QA UAT 场景确认 | qa-test-case | ✅ | DL 确认 UAT 5 条业务语言准确 | 2026-11-11 |
| QA 执行结果确认 | QA 用例执行 | ☐ | QA/Dev Lead 确认 qa_test_report.md：用例全部通过，或失败项已修复并回归 | — |
| v2 跨 Workbench 一致性确认 | cross-workbench-reviewer | ✅ | X-01..X-10a、Y-01、Y-02 全部裁决，无待填写 | 2026-11-11 |
| v2 第二轮技术 Q&A 裁决（质量关卡 1） | requirements-analyst | ✅ | 23 条全部为填空型，7 条待答 DL 采纳建议 | 2026-11-11 |
| v2 requirements.md 确认 | requirements-analyst | ✅ | 两侧 requirements.md DL 确认 | 2026-11-11 |
| v2.1 需求修订确认 + HLD 审批 | solution-designer | ✅ | v2.1 无技术约束引起的需求修订；HLD v2.1、ADR-004 修订批准 | 2026-11-11 |
| v2 影响分析 review | impact-analyzer | ✅ | backend 924a75b、frontend 0ee2330 + 1476ce6，DL 认可 | 2026-11-11 |

---

## 贡献记录

| 时间 | 操作者（角色） | Skill | 操作 |
|------|-------------|-------|------|
| 2026-11-10 | Yin Yang（Dev Lead） | requirement-kickoff | 完成 Workbench 检测、业务澄清双签、需求映射及 HLD 必要性评估 |
| 2026-11-10 | Yin Yang（Dev Lead） | solution-designer | 确认模型、图像处理路径、并发、上传格式与大小、草稿生命周期及正式数据留存方向 |
| 2026-11-10 | Yin Yang（Dev Lead） | solution-designer | 批准 HLD 与 ADR-001..003；生成 backend/frontend 仓库约定初稿，等待复核 |
| 2026-11-10 | Yin Yang（Dev Lead） | solution-designer | 复核并批准 backend/frontend AGENTS.md；代码目录未初始化 Git，未推送 |
| 2026-11-10 | Yin Yang（backend） | impact-analyzer | 完成 backend 影响分析（新项目，全部为新增），登记待澄清问题 10 条；Dev Lead 答复 Q01/Q05，项目定位 local POC，剩余 8 条 |
| 2026-11-10 | Yin Yang（frontend） | impact-analyzer | 完成 frontend 影响分析（新项目，全部为新增）；登记 9 条待澄清问题 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 feature-backend、feature-frontend 到 feature，解决 `_progress.md` 冲突，两 Workbench 影响分析均 ✅ |
| 2026-11-10 | Yin Yang（Dev Lead） | cross-workbench-reviewer | 完成五维比对与待核实问题合并（C-01..C-15）；DL 裁决：PDF 已实测支持维持 ADR-001；幂等键=姓名+手机号+邮箱；其余采纳建议 |
| 2026-11-11 | Yin Yang（Dev Lead） | prd-writer | PRD v2 确认：#3 补对话修改，新增 #5 问答、#6 历史会话、#7 已归档简历 |
| 2026-11-11 | Yin Yang（Dev Lead） | solution-designer | HLD v2 批准；ADR-007/008/009 ACCEPTED；ADR-003/006 修订确认；v1 旧草稿不迁移；后续沿用 Orca worker 分派前后端 |
| 2026-11-11 | Yin Yang（Dev Lead） | solution-designer | 补门控 1：DL 确认 v2 无技术约束引起的需求修订；DL 授权编排同步所需的本地提交（不推送） |
| 2026-11-11 | Yin Yang（backend） | impact-analyzer | 完成 backend v2 影响分析（delta 覆盖，924a75b）：新增 11 / 修改 22 / 不变 15，待澄清 6 条；仓库无远端，未推送（SV-07） |
| 2026-11-11 | Yin Yang（Dev Lead） | impact-analyzer | DL review 通过两侧 v2 影响分析；DL 决定加入 qa-test-case（v1 漏执行，SV-11），登记为重跑清单 5q |
| 2026-11-11 | Yin Yang（Dev Lead） | qa-test-case | 合并 QA 用例更新（7ea92b3，86 条，AC 67/67）；DL 确认"QA 用例设计确认""QA UAT 场景确认"两个门控 |
| 2026-11-11 | Yin Yang（Dev Lead） | qa-test-case | 合并 QA 用例（0f0cb71、0b05114，85 条，v2 AC 66/66）。QA 待澄清 6 条按 DL 长期授权采纳建议：①对话类用例以模型桩判定，11q 另用真实模型做语义抽查；②超 2000 字符前端阻止输入、后端拒绝（业务码 6a 定）；③下载用不含姓名的通用文件名；④REQ-FE-04 AC 顺序修正并补 AC10（frontend requirements v2.0.1 澄清）；⑤接口类用例的路径清单在 OpenAPI 0.2.0 冻结后提供；⑥11q 执行 AT/E2E/UAT，NEG/PERM/REG 只生成不执行 |
| 2026-11-11 | Yin Yang（Dev Lead） | requirements-analyst | DL 确认两侧 requirements.md，需求汇总 ✅；票号复议后维持 HR_PR-1（见关键决策）；v1 开发自测按 DL 实测确认；下一步 5q（QA worker）与 6a（backend Schema+接口）并行 |
| 2026-11-11 | Yin Yang（Dev Lead） | requirements-analyst | 质量关卡 1：7 条待答 DL 采纳建议；Step 2：两侧 requirements.md 增量更新（backend 新增 REQ-BE-07..09、frontend 新增 REQ-FE-07..09），ADR-005 补 v2.1 修订；Step 3：glossary 按 X-10a 修订 2 条、新增 5 条。DL 长期授权：需澄清的问题只要不特殊，一律采纳建议 |
| 2026-11-11 | Yin Yang（Dev Lead） | requirements-analyst | Step 1：两侧 requirements_plan.md 追加 v2 第二轮技术 Q&A（backend TQ-v2-01..10、frontend TQ-v2-F01..F14），等待质量关卡 1 |
| 2026-11-11 | Yin Yang（Dev Lead） | cross-workbench-reviewer | v2.1 比对 Y-01（对话流内快捷回复"按本次内容更新"，不经模型）、Y-02（前端逐字段比较，清空字段列为差异）采纳建议；签署 v2 确认，跨 Workbench review ✅；下一步 requirements-analyst |
| 2026-11-11 | Yin Yang（Dev Lead） | 主 agent | 按 SV-11 修订后的模板补齐 QA：流程表加 QA 用例执行行、门控表加 3 行、QA 产出路径改为 `qa/`、5q 改为只生成用例、新增 11q 手工执行；DL：v1 已完成部分不补做 QA，v2 变更走新流程，QA 由 role=qa 的独立 worker 执行 |
| 2026-11-11 | Yin Yang（Dev Lead） | solution-designer | v2.1 门控 1、门控 2 确认；派两端补 v2.1 影响分析小节（3a'/3b'） |
| 2026-11-11 | Yin Yang（Dev Lead） | cross-workbench-reviewer | v2 审视 11 项裁决：10 项采纳建议；X-06 选 B 并追加"再次确认后更新已有记录"，登记为 v2.1（方案 A） |
| 2026-11-11 | Yin Yang（Dev Lead） | requirement-change-router | DL 试用后提出需求变更 v2（Type C，DL 确认）：对话修改与问答、历史会话、已归档简历查看；受影响阶段标 ⚠️，登记重跑清单（v2） |
| 2026-11-11 | Yin Yang（frontend） | impact-analyzer | 完成 frontend v2 影响分析（delta 覆盖，提交 1476ce6，含行号引用与验证回路自检）；登记 10 条待澄清问题；Step 4 补做；仓库无远端，未推送（SV-07） |
| 2026-11-11 | Yin Yang（backend） | impact-analyzer | 追加 backend v2.1 影响分析小节（4f02d13，第十一节）：新增待澄清 Q-backend-07..10；仓库无远端，未推送（SV-07） |
| 2026-11-11 | Yin Yang（frontend） | impact-analyzer | 完成 frontend v2.1 影响分析小节（提交 5582374）：已保存过视图、差异与确认更新卡片、F-03；新增待澄清 4 条；仓库无远端，未推送（SV-07） |
| 2026-11-11 | Yin Yang（QA） | qa-test-case | 生成 v2/v2.1 QA 用例 85 条（AT 54 / E2E 5 / NEG 9 / PERM 4 / REG 8 / UAT 5），v2 AC 覆盖 66/66，数据需求 21 项（需开发配合 9 项）；只生成不执行；仓库无远端，未推送 |
| 2026-11-11 | Yin Yang（QA） | qa-test-case | 按 5q 待澄清答复（DL 授权采纳建议）更新用例：对话类以模型桩为准、AT-20/NEG-04/AT-41/AT-46 调整、新增 AT-55，共 86 条；补 11q 执行范围；仓库无远端，未推送 |

---

## 关键决策记录

| 时间 | Skill | 决策内容 |
|------|-------|---------|
| 2026-11-10 | requirement-kickoff | 本需求跨 backend、frontend，输出目录分别为 `backend-docs/HR_PR-1/`、`frontend-docs/HR_PR-1/`。 |
| 2026-11-10 | requirement-kickoff | HR 简历模型以 `global-info/简历模板.md` 为准；姓名、手机号和邮箱三项均为保存前必须信息，其他字段可为空。 |
| 2026-11-10 | requirement-kickoff | 仅支持 PDF 和照片类简历；用户明确确认后才保存，并保持原始文件与结构化记录关联一致。 |
| 2026-11-10 | requirement-kickoff | 两个目标代码仓库路径均不存在，判定为新项目，必须运行 solution-designer HLD。 |
| 2026-11-10 | solution-designer | Dev Lead 确认 DeepSeek Flash（模型标识 `deepseek-flash`）获批并支持 PDF/图像能力；不允许 OCR/其他模型回退，服务商不得训练。 |
| 2026-11-10 | solution-designer | 首期同步解析；最多约 5 人并发，单文件 10 MB，支持 PDF/JPG/JPEG/PNG。 |
| 2026-11-10 | solution-designer | 未确认草稿可同浏览器恢复，服务端本地暂存 7 天无活动后清理；使用 7 天安全 HttpOnly Cookie 令牌；磁盘加密由受控主机保障。 |
| 2026-11-10 | solution-designer | 已确认简历正式归档无自动过期删除；用户删除功能不在本次范围，清理由后续运维流程定义。 |
| 2026-11-10 | solution-designer | Dev Lead 批准 HLD 并接受 ADR-001、ADR-002、ADR-003。 |
| 2026-11-11 | 主 agent | **票号复议**：DL 质疑 v2 写入 HR_PR-1 的依据；主 agent 承认原依据不足（未检索 ADR-004"另立需求"跟进项），曾提出拆为 HR_PR-2，后 DL 说明 v1 已实测功能正常、变更源于体验与预期不符，决定**仍在 HR_PR-1 按 requirement-change-router 推进**；ADR-004 补注 DL 显式裁决。拆票的工作区改动已全部撤回，未提交。 |
| 2026-11-11 | 主 agent | **DL 长期授权**：后续各 skill 中需要澄清的问题，只要不是特殊情况，一律按 AI 建议采纳并注明"DL 授权采纳建议"；人类门控（审批、确认、签署）仍逐个提交 DL。特殊情况指：涉及红线（数据丢失、安全、密钥、合规）、推翻已确认决策、扩大范围。 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend/frontend 按裁决修订的影响分析；第二轮新增 D-01..D-06 已裁决（采纳建议） |
| 2026-11-10 | Yin Yang（Dev Lead） | requirements-analyst | Step 1：汇总第二轮技术 Q&A 到两份 requirements_plan.md，等待质量关卡 1 |
| 2026-11-10 | Yin Yang（Dev Lead） | requirements-analyst | 质量关卡 1 通过；Step 2 生成两侧 requirements.md 及可追溯性矩阵，PRD 覆盖 4/4 |
| 2026-11-10 | Yin Yang（Dev Lead） | requirements-analyst | 确认 requirements.md；写入新术语 5 条并按 C-14 修订"简历模型"定义 |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | 主 agent 下发：backend 执行 Step 2.1+2.2 并停在评审关卡；frontend 做前置检查，待 OpenAPI 冻结 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend Schema 与接口设计草稿（d17d920） |
| 2026-11-10 | Yin Yang（Dev Lead） | cross-workbench-reviewer | OpenAPI 草稿契约审视 O-01..O-13，DL 采纳建议；backend Schema+接口评审通过 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 OpenAPI 0.1.0 冻结修订（4f504b8），复核校验通过；REQ-BE-01.6 按 O-02/O-03 补充 |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | DL 确认 backend 进入 Step 3（与 frontend Step 2.2 并行）；新 ADR 从 ADR-004 起编号 |
| 2026-11-10 | Yin Yang（Dev Lead） | cross-workbench-reviewer | 合并 frontend 接口消费设计（500d69d）；第二轮契约审视 G-01/G-02、F-01..F-05 采纳建议；frontend Step 2.2 评审通过 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | 原型 global-info/prototype 入库并完成对照评审 P-01..P-11（采纳建议，P-01 选 A） |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend 技术设计与 ADR-004/005 草稿（cc3f99f），OpenAPI 未改动 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | 关闭手动 kiro 会话，改为 Orca 受监督 worker：frontend ctx_6d9d1d647358（Step 3）、backend ctx_88edd28ffd62（就绪待命），Run run_2dde01eb480f |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | backend 技术设计确认：ADR-004/005 ACCEPTED；双 SQLite 不另立 ADR（ADR-003 覆盖）；CR-01 采纳并入 OpenAPI 0.1.1；DeepSeek 失败映射、读超时近似、单进程采纳；新依赖须锁定精确版本并经私有 Nexus 安装；REQ-FE-03.1 按 P-04 澄清 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 OpenAPI 0.1.1（4ba4d15）与 backend 任务拆分（2b72d29），复核校验通过；发现 CR-01a 差异待裁决 |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | backend 任务清单确认：CR-01a 采纳 OpenAPI 现值；新增 pyyaml、pytest-cov 开发依赖（锁定版本）；Nexus 地址与 DeepSeek 凭证留到实施阶段由 DL 经环境变量提供，无凭证时 spike 标“待核实” |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | DL 决定：不使用私有 Nexus，依赖用 uv 默认索引本地直接安装，仍以 uv lock 锁定精确版本（全局规范的项目例外）；替代上一条中“经私有 Nexus 安装”的要求 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend Step 5（94992e3 任务1.1改本地依赖、8da9595 AGENTS.md v1），状态“待复核（设计有更新）” |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | backend AGENTS.md v1 复核通过（运行命令、Nexus 例外措辞采纳），状态改回“已确认” |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | frontend 技术设计确认：ADR-006 ACCEPTED；Q-DL-01..06 采纳（输入区无文本框、纯逻辑放 hooks/model、保存卡保留三项摘要、新对话后刷新恢复旧草稿可接受、兼容/无障碍范围、用户信息与历史会话去掉）；REQ-FE-04.4 澄清 v1.2 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | DL 决定（简单方式）：业务代码直接放在本仓库 codes/ 下随工作台分支管理，不另建独立代码仓库；根 AGENTS.md/CLAUDE.md 同步说明 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | DL 决定：backend 与 frontend 一起进入 feature-developer——待 frontend 任务清单确认（及其 Step 5 仓库约定复核）后同时开工；backend 首批为任务 1.1–1.7 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 frontend 设计对齐 0.1.1（020ca8b）与任务拆分（81ebf62） |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | frontend 任务清单确认：T-DL-01 默认 registry 例外写入 AGENTS.md；T-DL-02 任务 2.6 仅依赖 2.4、集成以 2.5 为准；T-DL-03 工时不含 Step 5 与审查（知悉） |
| 2026-11-10 | Yin Yang（Dev Lead） | architecture-advisor | frontend AGENTS.md v1 复核通过，状态改回“已确认”；Node engines >=24；dev proxy 目标统一改为 http://127.0.0.1:8000（避免 localhost 解析到 ::1）|
| 2026-11-10 | Yin Yang（Dev Lead） | feature-developer | 前后端同时开工：backend 任务 1.1–1.7，frontend 任务 1.1–1.6 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 frontend 1.1–1.6（4238907..4dfed73）；主工作区复跑：npm ci、lint 0 告警、Vitest 15 文件 226 用例通过、tsc + vite build 1399 modules |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend 1.1–1.7（f13ae9d..b3a1391）；主工作区复跑：uv sync --frozen、compileall 27 文件、pytest 213 passed、ruff check/format 通过 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | DL 提供 DeepSeek 凭证，已仅写入 backend worktree 本地 .env（600，已 gitignore，未入库）；建议 POC 后轮换该 key |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | 按 DL 要求启用独立 kiro 审查 agent（ctx_da4723a4f74e，worktree review-batch1，role dev-lead 只读）审查第一批代码 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | 合并第一批审查报告（98c84ec、cec6bbb）：backend BLOCKED（BLOCK-1 手机号 Unicode \d，主 agent 已复现）、frontend NEEDS_DECISION；DL 裁决见两份 code_review.md 末尾“Dev Lead 裁决”；frontend 第一批通过 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | backend BLOCK-1 修复（d5afabf、538a131）经主 agent 复验（223 passed）与审查 agent 复审（5797229）关闭，结论 PASS_WITH_SUGGESTIONS；第一批通过 |
| 2026-11-10 | Yin Yang（Dev Lead） | feature-developer | 1.8 spike：deepseek-flash 实测不接受 PDF（PNG 可用，200/约 3s）。DL 裁决：只用 deepseek-flash，PDF 本地转换（pypdfium2：文本层优先、渲染 PNG 兜底、最多 5 页，记录 token 用量）；ADR-001 追加修订 1，C-01 补充；提醒 worker 不得再向 v4-pro 等未获批模型发送内容 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend 1.8（c8b1f10，pypdfium2==5.15.2）：复跑 pytest 295 passed、ruff 通过、仓库内无密钥；合并 frontend 2.1–2.5（f9d8ba5..7c08e83）：复跑 38 文件 405 例通过、lint 0、build 1431 modules；交审查 agent 做第二批审查 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | 合并第二批审查报告（de8176b、8e8ac29）：backend 1.8 BLOCKED（模型名未锁定，主 agent 已核实）、frontend 2.1–2.5 PASS_WITH_SUGGESTIONS；DL 裁决：锁定 deepseek_model 与 base_url（https + api.deepseek.com），PDF 超时与提示词分隔随修；frontend 通过，2.6 一并修复拖拽离开页面 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | backend 1.8 修复（8e5f9f5）经主 agent 独立验证（模型名与地址锁定、361 passed）和审查 agent 复审（cf49419）：0 BLOCK / 0 QUESTION，建议标 ✅ |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 frontend 2.6（2bdd002）：复跑 42 文件 453 例通过、lint 0、build 1435 modules；交审查 agent 做 HIGH_RISK 审查 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | frontend 2.6 HIGH_RISK 审查（b3d4a9b）：PASS_WITH_SUGGESTIONS（0/0/5），F-03 唯一入口已核实；第④点证实 worker 理解有误、实现正确（重试得 draft_not_found → 可能已保存），建议标 ✅ |
| 2026-11-10 | Yin Yang（Dev Lead） | feature-developer | DL 确认 HIGH_RISK：backend 1.8、frontend 2.6 标 ✅；下发 backend 1.9–1.10（含 httpx trust_env=False），frontend 先修 2.6 审查 SUGGEST-2（保存响应形状校验）/SUGGEST-1，再做 2.7–2.8 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend 1.8 标 ✅（e380c09）、1.9（de985a7）、1.10（3f74106）、阶段1完成（2d138ff）：复跑 pytest 449 passed、ruff 通过；交审查 agent 做第四批审查 |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | backend 1.9–1.10 审查（fc9d224）PASS_WITH_SUGGESTIONS；DL：本机部署，选占用最小方案，继续用内置 SQLite（3.50.4，要求 ≥3.35 并加启动检查）；stage 自清理接受；S1/S3 在 2.4 前修复 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 frontend 2.6 标 ✅（a8f4020）、SUGGEST-2/1（5be3727、bdb7316）、2.7（8966bb0）、2.8（a012693）：复跑 50 文件 577 例通过、lint 0、build 1439 modules |
| 2026-11-10 | Yin Yang（Dev Lead） | code-reviewer | frontend 第五批审查（6ab7ad8）：PASS_WITH_SUGGESTIONS（0/0/4），F-03 误报路径关闭、2.7/2.8 符合 P-08/C-07/TD-13；两个 DL 确认点建议接受 |
| 2026-11-10 | Yin Yang（Dev Lead） | feature-developer | DL 确认 frontend 2.7、2.8 标 ✅，两个确认点接受；下发 frontend 3.1 及跟踪项清理 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent 合并 | 合并 backend 存储加固（6295fe5）与 2.1–2.3（fb1210f、bac0405、71785cc）：复跑 pytest 721 passed、ruff 通过、无密钥；交审查 agent 做第六批审查 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | DL 要求暂停：worker-stop 停止 frontend（ctx_1e6c6f4f8173）与审查 agent（ctx_7a4bf2974859），进程已关闭，已提交工作不受影响；backend worker 空闲未动。恢复清单见下方「暂停恢复清单」 |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | 按 DL 指出补关 backend worker（worker-release ctx_215fa78784b1）；核对三个 worktree 均无运行中的 agent、无终端，worker-list 无 live |
| 2026-11-10 | Yin Yang（Dev Lead） | 主 agent | 恢复编排：第六批审查 PASS_WITH_SUGGESTIONS（0e92cb4），DL 接受 4 个偏差（本地运行，大小前置限制登记跟踪项）；合并 frontend 跟踪项与 3.1（195ba1d），复跑 643 例通过、lint 0、build 通过；DL 指出 LLM 请求体上限 1 MB，批准新增 Pillow，新增 Task 2.3a（图像预处理 + SUGGEST-1/2），下发 backend worker ctx_6cac87d0c5c6 |
| 2026-11-10 | Yin Yang（Dev Lead） | dev-self-test | DL 要求流程完整执行并用真实样品自动化测试。backend 自测完成并合并（1141 passed）；frontend 自测部分完成并合并；DL 要求本轮结束，暂停 |

---

## 需求变更记录

| 版本 | 日期 | 类型 | 变更描述摘要 | 影响 Workbench |
|-----|------|------|------------|-------|
| v1.0 | 2026-11-10 | — | 初始版本 | backend、frontend |
| v2 | 2026-11-11 | Type C | DL 试用后提出：① 对话中通过自由文本修改简历字段、并对简历内容和填写流程提问回答；② 历史会话（浏览器 Cookie 标识，内容存服务端）；③ 已归档简历的全局列表、详情与原始文件下载。推翻 ADR-006、C-03、P-01、P-02、Q-DL-01、Q-DL-06；OpenAPI 0.1.1 需新增接口 | backend、frontend |

### v2 变更内容（DL 2026-11-11 确认）

| # | 决策点 | DL 结论 |
|---|---|---|
| 1 | 对话修改的生效方式 | 保留现有分区就地编辑，在此基础上**增加对话**：用户用自然语言提出修改，模型给出结构化修改建议，经现有字段校验后，以卡片展示"将 X 改为 Y"，用户点"应用"后才生效（守 B-04，不猜测补全） |
| 2 | 已确认会话的保留 | 一直保存（本地项目，不考虑存储成本）；已确认会话在历史中只读查看 |
| 3 | 归档列表可见范围 | 全局可见，不做权限控制（无账号体系，展示能力为目标）；作为已知风险登记 |
| 4 | 归档页搜索 | 不做；简单列表 + 详情 + 原始文件下载 |
| 5 | 对话输出方式 | 同步接口，不流式；前端显示"思考中" |
| — | 历史会话的实现边界 | Cookie 只存随机浏览器标识（HttpOnly），会话与对话内容存服务端；浏览器不存简历内容，F-02 保持有效 |
| — | 问答范围 | 只回答与本份简历内容、填写流程相关的问题；简历评价、岗位匹配等范围外请求礼貌拒绝（business-brief 范围外） |
| — | 执行深度 | 整体 L2（POC，防止过度第八节）；红线功能点按 L3 深度验证：对话内容不进日志（B-03）、模型修改建议不能绕过字段校验、不以模型猜测值补全三项必填（B-04）、对话仍只发往 deepseek-flash（B-02） |
| 6 | 会话清理方式 | DL 2026-11-11 确认：**不自动清理任何会话**（含未确认草稿，取消 7 天 TTL）；清理改为用户在历史会话中**手动删除**。ADR-003 补修订，清理调度停用。删除已确认会话只删对话记录，不删已归档简历与原始文件（归档删除仍不在范围内） |

### 重跑清单（v2，Type C）

| 优先级 | Skill | 执行者 | 前置条件 | 操作说明 | 完成 |
|--------|-------|-------|---------|---------|:---:|
| 0 | requirement-kickoff | — | — | 不重跑：Workbench 仍为 backend、frontend，无新增派活 | — |
| 1 | （人工）BA/Dev Lead 更新 PRD | Dev Lead | 无 | `prd.md` 增量新增用户故事 #5–#7、补充 #3/#4，表头加变更履历。**说明**：原登记为 prd-writer，但 prd-writer 的「票号冲突」Guardrail 禁止覆盖已有 PRD，不适用于变更；router 输入表亦约定 PRD 由 BA 更新。已登记 skill 问题 SV-01 | ✅ 2026-11-11 DL 确认（v1 快照 `_history/prd.v1.md`） |
| 2 | solution-designer | Dev Lead | PRD ✅ | `solution-design.md` 增量更新（先快照 `_history/solution-design.v1.md`）；新增 ADR-007（对话修改与问答，替代 ADR-006 的"不解析自由文本"部分，ADR-006 标 SUPERSEDED/部分保留分区编辑）、ADR-008（会话持久化与浏览器标识）；ADR-003 补修订 | ✅ 门控 1（需求修订确认）2026-11-11 DL 补确认：v2 无技术约束引起的需求修订（SV-02）；门控 2：2026-11-11 DL 批准 HLD v2；ADR-007/008/009 ACCEPTED；ADR-003/006 修订确认；v1 旧草稿不迁移 |
| 3a | impact-analyzer | backend 工程师 | HLD ✅ | `backend-docs/HR_PR-1/00_impact_analysis.md` 覆盖重写（delta 文档）+ 履历表头 | ☑ 924a75b（2026-11-11） |
| 3b | impact-analyzer | frontend 工程师 | HLD ✅ | `frontend-docs/HR_PR-1/00_impact_analysis.md` 覆盖重写（delta 文档）+ 履历表头 | ☑ 2026-11-11（1476ce6；待澄清 10 条） |
| 4 | cross-workbench-reviewer | Dev Lead | 影响分析 ✅ | 在 `cross-workbench-review.md` 追加 v2 节：新接口契约、会话/浏览器标识 Cookie、修改建议结构、错误码；C-03、P-01、P-02 标注被 v2 替代 || ☑ 2026-11-11（a408e07、4d2be8f；DL 签署） |
| 5 | requirements-analyst | Dev Lead/BA | 跨 Workbench Review ✅ | 两侧 `requirements.md` 增量更新（先快照 `_history/`），追溯矩阵覆盖新用户故事 || ☑ 2026-11-11（9f2b4e0、1043564；DL 确认） |
| 5q | qa-test-case | QA（新建 Orca worktree，`local_profile.yaml` role=qa） | 5 requirements ✅ | **只生成用例，不执行**。范围：v2/v2.1 变更（PRD #3、#4 的 v2/v2.1 条目、#5、#6、#7）的 AT/E2E/NEG/PERM/REG/UAT；v1 已完成部分不补做（DL 2026-11-11），只在 REG 中覆盖 v2 影响分析"修改"类模块对 v1 行为的回归。产出 `01-requirements/HR_PR-1/qa/qa_test_cases.md`；与 6a–9b 并行 | ☑ 2026-11-11（0f0cb71） |
| 6a | architecture-advisor（Schema+接口） | backend 工程师 | requirements ✅ | `sql_ddl_resume.md` 新增会话/消息/浏览器标识存储并调整确认后草稿处理；`openapi.yaml` 0.1.1 → 0.2.0（会话、消息、建议应用、归档查看） | ☐ |
| 6b | architecture-advisor（接口消费） | frontend 工程师 | 6a OpenAPI 冻结 ✅ | `interface_spec_resume.md` 同步 0.2.0 | ☐ |
| 7a | architecture-advisor（技术设计） | backend 工程师 | 接口冻结 ✅ | `backend-docs/HR_PR-1/04_design/design.md` 增量更新（先快照 `_history/`）：对话提示词与输出结构、注入防护、日志白名单、会话与删除 | ☐ |
| 7b | architecture-advisor（技术设计） | frontend 工程师 | 接口冻结 ✅ | `frontend-docs/HR_PR-1/04_design/design.md` 增量更新（先快照 `_history/`）：输入框、对话流与修改卡片、会话栏、归档页 | ☐ |
| 8a | architecture-advisor（任务拆分 + Step 5） | backend 工程师/Dev Lead | 7a ✅ | backend `tasks.md` 追加 v2 任务（测试预算 POC ≈ 1:1）；backend `AGENTS.md` 更新红线、日志字段、运行说明（取消 TTL 配置） | ☐ |
| 8b | architecture-advisor（任务拆分 + Step 5） | frontend 工程师/Dev Lead | 7b ✅ | frontend `tasks.md` 追加 v2 任务（测试预算 POC ≈ 1:1）；frontend `AGENTS.md` 更新 | ☐ |
| 9a | feature-developer | backend 工程师 | 8a ✅ | 在现有代码上增量实现 | ☐ |
| 9b | feature-developer | frontend 工程师 | 8b ✅ | 在现有代码上增量实现 | ☐ |
| 10 | code-reviewer | 审查 agent | 代码 ✅ | 只审 v2 变更面；红线点重点审 | ☐ |
| 11a | dev-self-test | backend 工程师 | 10 ✅ | v2 新增用例 + v1 自测回归映射（复用已有，不重写）；含真实 DeepSeek 演练 | ☐ |
| 11b | dev-self-test | frontend 工程师 | 10 ✅ | v2 新增用例 + v1 自测回归映射（复用已有，不重写）；浏览器实测 | ☐ |
| 11q | QA 用例执行（手工） | QA/Dev Lead | 11a、11b ✅ | 按 `qa/qa_test_cases.md` 逐条手工执行，结果（通过/失败/阻塞，附 TC_ID）记入 `qa/qa_test_report.md`；失败项交对应 Workbench 用 `bug-fixer` 修复并回归后重跑。执行范围待 DL 确认（主 agent 建议 AT/E2E/UAT 执行，NEG/PERM/REG 只生成） | ☐ |
| 12 | DL 最终 Review | Dev Lead | 自测 ✅ | 浏览器实际体验验证三项能力 | ☐ |


### v2.1 变更（2026-11-11，DL 确认）

| 版本 | 日期 | 类型 | 变更描述摘要 | 影响 Workbench |
|-----|------|------|------------|-------|
| v2.1 | 2026-11-11 | Type B（命中跨 Workbench 契约，DL 门控） | 跨 Workbench 审视 X-06 选 B（已保存过的会话展示已有记录内容，D-04 被替代）；DL 追加：用户在对话中要求按本次内容更新时，再次确认后覆盖已有记录（方案 A：id 与幂等键不变、不留旧版本、文件替换沿用 ADR-005）。改动 PRD #4/#6/#7、ADR-004 修订、HLD §3/§4/§5 | backend、frontend |

| 优先级 | Skill | 执行者 | 前置条件 | 操作说明 | 完成 |
|--------|-------|-------|---------|---------|:---:|
| 1' | （人工）DL 更新 PRD | Dev Lead | 无 | PRD 履历 v2.1；#4 补 3 条、#6 补 1 条、#7 补注 | ✅ 2026-11-11 DL 选定方案 A |
| 2' | solution-designer | Dev Lead | 1' ✅ | HLD 履历 v2.1；§3 第 5 步、§4 新增契约行、§5 Backend；ADR-004 修订 | ✅ 2026-11-11 门控 1（无技术约束引起的需求修订）、门控 2（HLD v2.1、ADR-004 修订）DL 确认 |
| 3a' | impact-analyzer | backend 工程师 | 2' ✅ | 在 v2 影响分析中追加 v2.1 小节（只写更新路径：确认更新、文件替换与补偿、对账影响、受影响测试），不重写全文 | ☑ 4f02d13（2026-11-11） |
| 3b' | impact-analyzer | frontend 工程师 | 2' ✅ | 在 v2 影响分析中追加 v2.1 小节（只写差异展示与"确认更新"卡片、已保存过视图），不重写全文 | ☑ 2026-11-11（5582374；新增待澄清 4 条 Q-frontend-v2-11..14） |
| 4' | cross-workbench-reviewer | Dev Lead | 3a'/3b' ✅ | v2 审视节追加 v2.1 比对；之后签署 v2 确认 || ☑ 2026-11-11（8ad6abe；Y-01、Y-02 采纳建议） |

深度约束（防止发散）：更新路径属红线（B-05），按 L3 深度验证失败补偿；其余按 L2。v2.1 不新增除"确认更新"以外的任何能力（归档页仍只读、无删除、无版本历史）。

不受此次变更影响（无需重跑）：
- 需求启动：Workbench 与派活不变。
- 上传解析链路（ADR-001、ADR-002）、保存顺序与启动对账（ADR-005）、幂等键（ADR-004）：沿用，只在对应文档引用处做一致性扫描。

---

## 跨 Workbench 信息

| Workbench | 负责人 | 输出目录 |
|----|-------|---------|
| backend | Yin Yang | `backend-docs/HR_PR-1/` |
| frontend | Yin Yang | `frontend-docs/HR_PR-1/` |

---

## 暂停恢复清单（2026-11-10 暂停）

> DL 唤醒后按顺序恢复。恢复前先执行 `orca orchestration worker-list --json` 核对各 worker 的状态。

| # | 对象 | 暂停时的状态 | 恢复动作 |
|---|---|---|---|
| 1 | 审查 agent（worktree `review-batch1`） | 第六批审查（backend 存储加固 + 2.1–2.3，合并 `cfb87b3`）被中断，没有产出 | 重新启动审查 worker（Task `task_2e0f759e789f`），重新下发第六批审查 |
| 2 | frontend（worktree `feature-frontend`） | 跟踪项清理已提交 4 个（c47bc02、18363a6、0f07f40、d306368，尚未合并到 feature）；任务 3.1 未完成；有未提交文件 `codes/hr-collection-agent-frontend/src/test/FakeBackend.ts`（3.1 进行中的产物，已保留） | 重新启动 frontend worker（Task `task_83570e762162`），从"任务 3.1"继续，先检查 FakeBackend.ts |
| 3 | backend（worktree `feature-backend`） | 2.1–2.3 已完成并合并，等待第六批审查；worker 已用 worker-release 关闭（ctx_215fa78784b1），工作区干净 | 第六批审查通过后，重新启动 backend worker，下发 2.4（HIGH_RISK：确认保存、幂等、B-05 补偿）；本地 `.env`（DeepSeek 凭证）仍保留在 feature-backend worktree |
| 4 | 待 DL 确认 | backend 2.1–2.3 的偏差 (1)(3)(4)；上传请求体缺少前置大小限制（POC 是否接受） | 随第六批审查结论一起提交给 DL |

