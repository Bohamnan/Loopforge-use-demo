# 进度模板与变更路由补入 qa-test-case

| 项 | 内容 |
|---|---|
| 日期 | 2026-11-11 |
| 类型 | config |
| 模块 | 文档模板 `doc-templates/00_progress_template.md`、Skill `requirement-change-router`（本项目与 Copilot 适配包） |
| 触发原因 | SV-11：qa-test-case 在 HR_PR-1 v1 漏执行。进度模板的流程表、门控表和 router 的重跑清单模板都没有 QA 用例，流程只靠模板驱动，缺行就没人触发 |

## 变更内容

- `00_progress_template.md`：流程进度在“需求汇总”后新增“QA 测试用例”行（产出 `01-requirements/{TICKET-ID}/qa/qa_test_cases.md`）；人类门控新增“QA 用例设计确认”“QA UAT 场景确认”；路径说明注明可与开发并行。
- `requirement-change-router/SKILL.md`：重跑清单模板新增 3a 行 qa-test-case。
- 追加（同日，DL 确认）：框架里 qa-test-case 只生成用例，没有环节规定谁执行。`00_progress_template.md` 再加“QA 用例执行”行（开发自测通过后、交付 Review 前；产出 `qa/qa_test_report.md`）、门控“QA 执行结果确认”和执行说明：QA/Dev Lead 手工逐条执行，失败项交 `bug-fixer` 修复并回归，再重跑。未新增 Skill。
- 追加（同日，DL 确认）：`requirements-analyst/SKILL.md` 在“需求汇总”完成后的提示里，增加提示 QA 或 Dev Lead（role 为 qa 或 dev-lead）新开会话执行 `/qa-test-case`，可与架构设计、开发并行；不执行时在 `_progress.md` 备注原因。此前没有任何 Skill 提示触发 qa-test-case。

## 对在途票据的提示（给工作台使用者）

- **模板只影响新建票据**。已存在的 `_progress.md` 不会自动变化，需要手工补行；HR_PR-1 已补流程行和重跑清单 5q，**尚未补两个 QA 门控行**，执行 5q 时一并补到“人类门控状态”表。
- QA 用例的实际输出路径是 `01-requirements/HR_PR-1/qa/qa_test_cases.md`（Skill 定义），HR_PR-1 `_progress.md` 里写的 `01-requirements/HR_PR-1/qa_test_cases.md` 少了 `qa/` 一层，执行 5q 时按 Skill 输出登记并更正。
- HR_PR-1 `_progress.md` 还需手工补“QA 用例执行”行和“QA 执行结果确认”门控；是否在本 POC 执行 QA 用例，由 DL 决定。
- 后续再有需求变更，router 生成的重跑清单会自带 qa-test-case 行，不用再手工加。

## 涉及文件

- 本项目：`doc-templates/00_progress_template.md`、`.github/skills/requirement-change-router/SKILL.md`、`.github/skills/requirements-analyst/SKILL.md`
- 适配包（非 git 仓库，登记见 `启动前准备/Copilot适配包/修改记录.md`）：`doc-templates/00_progress_template.md`、`{skills,.github/skills}/requirement-change-router/SKILL.md`

## 数据库变更

无
