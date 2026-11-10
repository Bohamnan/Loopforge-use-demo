# hr-info-collection 工作台使用指南

这是 HR人力信息收集系统（用户上传简历，大模型解析，对话校对，确认后归档）的交付工作台，用 VS Code 里的 GitHub Copilot（Agent 模式）驱动。本仓库只放文档、规则和 Skill，不放代码。项目背景见 `global-info/business-brief.md`，工作台全局上下文见 `AGENTS.md`。

## 开始之前（每位工程师做一次）

1. 把 `skills/` 复制为 `.github/skills/`（Copilot 只从 `.github/skills/` 发现 Skill，`skills/` 继续保留）。
2. 用 VS Code 打开本目录，新开聊天并切到 Agent 模式。命令面板运行 Chat: Open Customizations，确认 Skills 页能看到全部 Skill；输入 `/` 也应能看到。
3. 复制 `local_profile.yaml.example` 为 `local_profile.yaml`，填写角色（backend、frontend、dev-lead、ba、qa 之一）和自己负责的代码仓库路径。该文件不提交 git；缺失时所有 Skill 会拒绝执行。
4. 代码仓库建议放在本目录下的 `code/`（已被 `.gitignore` 排除），这样 Copilot 的工作范围能覆盖到代码。
5. 首位工程师运行 `/dev-onboarding` 完成接入确认。

## 代码仓库

- backend：`hr-collection-agent`，Python 3.11 + FastAPI + SQLite。
- frontend：`hr-collection-agent-web`，TypeScript + React 18 + Vite + Ant Design。
- 两个都是新项目，代码目录里的 `AGENTS.md` 不要手工新建：先跑 `/solution-designer`，设计获批后由它生成初稿，技术负责人评审后再放行后续 Skill。

## 跑一个需求

需求票号形如 `HR_PR-1`，文档放在 `01-requirements/HR_PR-1/`。按下面的顺序触发 Skill：

| 步骤 | Skill | 做什么 | 谁来做 |
|---|---|---|---|
| 1 | `/prd-writer` | 需求描述写成 PRD | 产品 |
| 2 | `/requirement-kickoff` | 识别涉及的 Workbench，第一轮业务澄清，评估是否需要高层设计 | 技术负责人、BA |
| 3 | `/solution-designer` | 高层设计（新项目必须先做，小改动可跳过） | 技术负责人 |
| 4 | `/impact-analyzer` | 各 Workbench 分析自己要改什么 | backend、frontend |
| 5 | `/cross-workbench-reviewer` | 对比前后端接口契约和责任边界（仅跨 Workbench 需求） | 技术负责人 |
| 6 | `/requirements-analyst` | 第二轮技术澄清，汇总成带验收条件的需求文档 | 汇总者 |
| 7 | `/architecture-advisor` | 数据表、接口、技术设计和任务拆分 | backend、frontend |
| 8 | `/feature-developer` | 按设计和任务清单写代码 | backend、frontend |
| 9 | `/code-walkthrough` | 讲解本次改动，逐段确认 | backend、frontend |
| 10 | `/code-reviewer` | 结构化审查 | backend、frontend |
| 11 | `/dev-self-test`、`/test-data-script-generator` | 白盒自测用例，造数与清数 | backend、frontend |

黑盒测试用例 `/qa-test-case` 不依赖实现文档，需求确认后就可以和开发并行。

其他常用 Skill：`/bug-fixer`（测试报 Bug 后修复）、`/requirement-change-router`（需求变更后列出要重跑的步骤）、`/module-explorer`（无票号时探索模块）、`/memory-curator`（知识库审计，手动触发，约两周一次）。

## 必须遵守的约束

完整清单在 `project-memory/architectural_constraints.md`，最常碰到的几条：

- 解析结果必须经用户在对话中确认后才能入库；识别不到的字段要请用户补充，不得猜测（B-04）。
- 每条简历记录必须关联原始文件，记录与文件保持一致（B-05）。
- 简历是个人敏感信息：只发给批准清单内的模型服务，测试只用合成或脱敏简历，日志不写简历原文（B-02、B-03、B-06）。
- 前端只经后端 HTTP 接口取数，不存密钥；用户确认前界面不得提示“已保存”（F-01、F-03）。
- 密钥只放环境变量或配置中心。

## 目录说明

| 目录或文件 | 内容 |
|---|---|
| `AGENTS.md`、`CLAUDE.md` | 工作台全局上下文，内容相同 |
| `project-config.yaml` | Workbench 索引、票号格式、角色 |
| `project-brief.confirmed.yaml` | 初始化时确认的全部取值，技术栈变化时先改它 |
| `project-memory/` | 术语表、架构约束、决策目录，均为草稿，需人工确认 |
| `rules/backend/`、`rules/frontend/` | 各 Workbench 的编码、接口、数据库规范 |
| `skills/` | 所有 Skill；各 Workbench 的技术知识在 `references/{backend,frontend}.md` |
| `doc-templates/` | 需求、设计、任务等文档模板 |
| `global-info/` | 项目业务概述等静态事实，需要时用 `@` 主动引用 |
| `01-requirements/`、`00-analysis/`、`backend-docs/`、`frontend-docs/` | 需求文档、模块探索产物、各 Workbench 文档产物 |

## 待办与风险

- 成功标准还没填：补到 `global-info/business-brief.md`，同时改 `project-brief.confirmed.yaml`。
- 照片文字识别方式未定：核实 DeepSeek flash 是否支持图像输入，不支持则需要独立 OCR；`rules/backend/coding.md` 等四处留了 TODO。
- DeepSeek 是否在客户批准清单内，需要环境负责人确认；未确认前不要用真实简历测试。
- 数据库按 SQLite 理解，原始文件放项目 file 目录；如实际指的是别的存储，先改 `project-brief.confirmed.yaml` 再重跑 `/project-setup-brief`。
- 带 `⚠` 的内容（目前是 code-reviewer 的测试覆盖门槛）是推断，评审后再定。

## 维护

- 技术栈、命令或约束变化：先改 `project-brief.confirmed.yaml`，再重跑 `/project-setup-brief`，它只补齐受影响的文件。
- 新增 Workbench：在 brief 的 `workbenches` 下追加一块，重跑。
- AI 写入 `project-memory/` 的内容都是草稿，人工确认后才生效。
