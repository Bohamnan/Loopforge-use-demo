# HR_PR-1 v2 变更流程中的 Skill 问题登记

| 项 | 内容 |
|---|---|
| 目的 | DL 要求 v2 严格按 `.github/skills/requirement-change-router` 及其路由到的下游 skill 推进，以验证这套 skill；过程中发现的问题逐条登记、处理 |
| 开始日期 | 2026-11-11 |
| 维护者 | 主 agent（Kiro），DL 裁决 |

分类说明：
- **Skill 缺陷**：照 skill 原文执行会卡住、矛盾或产生错误结果，需要改 skill。
- **执行偏离**：skill 写得清楚，但执行者（主 agent 或 worker）没照做，需要纠正执行，不改 skill。

处理状态：待裁决 / 已纠正 / 已修 skill / 不改（附理由）。

| 编号 | 分类 | 涉及 skill | 现象 | 根因 | 处理建议 | 状态 |
|---|---|---|---|---|---|---|
| SV-01 | Skill 缺陷 | requirement-change-router、prd-writer | 重跑清单需要更新 PRD，但 prd-writer 的「票号冲突」Guardrail 规定 PRD 已存在即 BLOCK、不得覆盖，变更场景下无法用 prd-writer；router 的重跑清单模板也没有 PRD 这一行，只在输入里写"如 BA 已更新 PRD"。主 agent 自行加了一行 prd-writer 并直接改了 PRD | 两个 skill 都只考虑了"新建 PRD"，没定义"变更时谁、用什么方式更新 PRD" | 二选一：① prd-writer 增加"变更模式"（已有 PRD 时增量更新 + 履历表头 + 快照，不受票号冲突 BLOCK）；② router 明确 PRD 由 BA 人工更新，并在 Step 1 前置检查"PRD 已更新"，清单模板加第 0.5 行 | 待裁决 |
| SV-02 | 执行偏离 | solution-designer | 主 agent 重跑 HLD 时跳过 Step 5 后的「人类门控 1：需求修订确认」，直接在 §7 写"无需求修订"并进入门控 2 审批；也没有按"一次一问"的问答回路提问，而是批量列问题 | 主 agent 把 router 之后的下游 skill 当成"自己顺手做"，没有逐个按 skill 执行 | 补门控 1：请 DL 确认"v2 无技术约束引起的需求修订"；之后每一项下游重跑都显式按对应 skill 的步骤与门控执行 | 已纠正（2026-11-11 DL 补确认） |
| SV-03 | Skill 缺陷 | prd-writer、requirement-change-router | router 的「文档历史保留约定」要求表头加变更履历表，prd-writer 的模板规定只能有两个顶层章节，两者冲突；PRD 在 router 的文档类别表中也没有归类（核心/一般/delta） | 两个 skill 各自定义文档结构，没有对齐 | router 文档类别表加入 PRD（建议归为核心产物）；prd-writer 模板注明"变更履历表位于标题前，不算章节" | 待裁决 |
| SV-04 | 执行偏离 | requirement-change-router | 主 agent 写的重跑清单把前后端合并成一行（如"impact-analyzer：backend、frontend 工程师"），而 router 模板是每个 Workbench 一行；合并后两个 worker 要勾同一行，无法表达"一侧完成、一侧未完成" | 主 agent 没有照模板写 | 已拆分为 3a/3b、6a/6b、7a/7b、8a/8b、9a/9b、11a/11b | 已纠正 |
| SV-05 | 执行偏离 | impact-analyzer | 主 agent 下发给两个 worker 的任务说明要求"不要修改 `_progress.md`"，与 impact-analyzer Step 4（更新状态、登记待澄清条数、贡献记录、勾掉重跑清单行）冲突 | 主 agent 为避免前后端并行改同一文件产生冲突，擅自改了 skill 规定的步骤 | 待两个 worker 交付影响分析后，发后续任务：先再次同步 feature（含拆分后的 3a/3b 行），再按 Step 4 只改本 Workbench 的行；合并冲突由主 agent 处理 | 已纠正（backend 819db61、frontend be0ead1 按 Step 4 补做） |
| SV-06 | Skill 缺陷 | impact-analyzer（及所有并行 Workbench skill） | 多个 Workbench 并行执行时，都按 skill 要求改同一个 `_progress.md`，合并必然冲突（v1 已发生过一次） | `_progress.md` 是单文件协调信号，skill 没有规定并行写入的规则 | 建议：skill 规定 Workbench worker 只改本 Workbench 所在行和本 Workbench 的清单行，贡献记录只追加；或改为每个 Workbench 一个进度片段文件，由汇总 skill 合并 | 待裁决。**本轮实证**：两侧都只改了本 Workbench 的行，合并仍出现 3 处冲突（分配表、流程表、重跑清单）——Markdown 表格的相邻行会被 git 判为同一冲突块，且流程表"影响分析"是两侧共用的一行。因此"只改本侧行"不足以避免冲突，建议改为每个 Workbench 独立的进度片段文件（或流程表按 Workbench 拆行 + 行间空隔不可行），由主 agent / 汇总 skill 合并 |
| SV-07 | Skill 缺陷 | impact-analyzer | Step 4 要求 `git push`，但本工作台仓库没有配置远端，无法执行 | skill 默认有远端 | skill 增加"无远端时在 `_progress.md` 备注未推送原因"（与 solution-designer Step 7 的处理一致） | 待裁决 |
| SV-08 | 执行偏离 | 全局 delivery.md 第七节 | 需求变更路由要求把重跑清单登记到本次变更的 changelog 条目，主 agent 起初漏做 | 全局规则与 router 各有记录位置，主 agent 只照了 router | 已补 `.kiro/changelog/2026/11/feat/2026-11-11-HR_PR-1需求变更v2.md`，指向 `_progress.md` 重跑清单为唯一权威 | 已纠正 |
| SV-09 | 执行偏离 | 全局 git 规则 | 主 agent 在用户未明确要求时做了本地提交 `76fa43e`（为让 worker 同步文档） | 编排需要同步，但没先征得同意 | 向 DL 说明；后续需要提交前先说明并征得同意，或由 DL 一次性授权"编排同步所需的本地提交" | 已裁决：DL 2026-11-11 一次性授权编排同步所需的本地提交（不推送） |
| SV-10 | 执行偏离 | impact-analyzer | frontend 影响分析（0ee2330）的“修改”项大多只写文件名、未引用 `文件:行号`（全文仅 5 处），不满足验证回路“来源检查”的硬性要求 | worker 未执行验证回路自检；skill 没有要求在交付前输出自检结果 | 已发后续任务补行号并附验证回路 6 项自检结论；建议 skill 在 Step 3 末尾增加“验证回路自检表”作为必填输出 | 纠正中 |
| SV-11 | Skill 缺陷 | `doc-templates/00_progress_template.md`、requirement-change-router | qa-test-case 在 v1 从未执行。它的前置条件（两侧 requirements.md ✅）在 2026-11-10 就已满足，但进度模板的流程表没有 QA 用例这一行，router 的重跑清单模板也没有；qa-test-case 自己要求"完成后更新 QA 用例阶段状态"，模板里却没有这个阶段可更新 | 进度模板与 qa-test-case 没有对齐；流程只靠模板驱动，模板缺行就没人触发 | 进度模板在"需求汇总"之后加一行"QA 测试用例 \| qa-test-case \| QA/Dev Lead"，并在人类门控表加"QA 用例评审"；router 清单模板加对应行 | 待裁决（本轮已手工补入 `_progress.md` 与重跑清单 5q） |

## 观察（不一定是缺陷，持续跟踪）

- 主 agent 在影响分析汇报中说"两边 16 条待澄清问题中属于契约的在第 4 项（cross-workbench-reviewer）裁决"，与该 skill 关键原则 2（待澄清问题不归本 skill，由 requirements-analyst 处理）不符；已在 v2 审视节按原则执行，只在造成两侧口径不一致时引用。另：impact-analyzer backend 文档末尾也写了"Q-backend-02、03 需在 cross-workbench-reviewer 中一并裁决"，同样与该原则冲突——两个 skill 对"跨 Workbench 性质的待澄清问题由谁裁"的说法不一致，建议 impact-analyzer 的待澄清模板注明"交 requirements-analyst，跨 Workbench 性质的由其回呈 DL"。
- cross-workbench-reviewer 模板的裁决表没有"AI 建议"列，v1 与 v2 都自行加了该列；skill 禁止代为裁决，但允许给建议与否没写明。

- frontend worker 在 Step 4 中用 `--amend` 合并了自己未推送的提交（be0ead1）。全局 git 规则要求优先新提交、amend 需明确要求。影响小（未推送、仅本分支），下发任务时补一句"不要 amend"。

- router 的重跑清单模板没有 solution-designer 一行，Type C"推翻架构决策"时需要执行者自己补；建议模板加一行"solution-designer（仅推翻架构决策/ADR 时）"。
- router 的 Step 2.2 只把已 ✅ 的阶段标 ⚠️；"开发自测"在 v1 是"待 DL 确认"（非 ✅），本次也一并标了 ⚠️。模板对"未完成阶段遇到变更"如何处理没有说明。
