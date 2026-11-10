# hr-info-collection — 项目全局上下文

---

## 项目概览

**项目**：hr-info-collection（HR人力信息收集系统）
**架构模式**：前后端分离；backend 提供 REST/JSON 接口并保存数据，frontend 为 Web 对话界面（由 `/solution-designer` 高层设计确认）

**背景**：HR人力信息收集系统：用户在 Web 对话中上传简历文件（PDF、照片等），由大模型（DeepSeek flash）解析内容，再与用户逐项对话校对，确认后将结构化简历信息和原始文件一并保存到本地。
**不做**：只做简历信息的识别、收集、归档，其他一律不做（如简历筛选与岗位匹配、招聘流程管理、对接其他 HR 系统）。详见 `global-info/business-brief.md`。

---

## 仓库结构

```
hr-info-collection-doc-workspace/
├── CLAUDE.md / AGENTS.md                       # 内容一致，两份均写出
├── project-config.yaml
├── project-brief.confirmed.yaml                # 初始化确认记录
├── project-memory/
│   ├── MEMORY.md
│   ├── project_glossary.md
│   ├── architectural_constraints.md
│   └── adr_index.md
├── .github/skills/                             # Copilot 工作区技能
├── doc-templates/
├── rules/{Workbench}/{coding,api,database}.md  # 团队工程规范，按 Workbench
├── global-info/                                # 项目级静态事实，需主动 @ 引用
├── 01-requirements/                            # 需求文档，按 HR_PR-xxxx 组织
├── backend-docs/                               # backend 文档产物（01_function/）
├── frontend-docs/                              # frontend 文档产物（01_function/）
├── 00-analysis/                                # 模块探索产物
├── local_profile.yaml
└── local_profile.yaml.example
```

> **重要**：本仓库不包含任何代码。代码仓库由每位工程师在本地独立管理，路径通过 `local_profile.yaml` 声明。

---

## 技术栈

（权威记录见 `project-config.yaml`；Workbench 技术知识见各 Skill 的 `references/{Workbench}.md`）

- **backend**：Python 3.11，FastAPI + Pydantic v2，SQLite（原始简历文件存放在项目 file 目录，记录中保存关联路径）；大模型 DeepSeek flash 经 clients 层调用；分层 api → services → repositories / clients。
- **frontend**：TypeScript，React 18 + Vite，Ant Design（React 版），状态用 React 自带 useState / useReducer；经统一 api 封装层调用 backend。

---

## 角色与访问控制

### 工程师本地配置

`local_profile.yaml`（每位工程师的本地角色配置，声明 role 与代码路径）：

```yaml
role: backend   # backend | frontend | dev-lead | ba | qa
name: 姓名

code_roots:
  backend: /path/to/backend-repo
  frontend: /path/to/frontend-repo
```

**Skill 行为规则**：
- `local_profile.yaml` **不存在** → 所有 Skill **BLOCK**，要求先创建并声明 role
- `role: dev-lead` → 允许全域访问（必须显式声明）
- 其他 role → 只能访问本人域的代码目录和文档目录

### 代码仓库导航规则

Skill 访问代码时，从 `local_profile.yaml` 读取 `code_roots`，禁止硬编码路径。

获得路径后，**进入任何代码阅读/探索/分析步骤之前，必须先读取该路径下的 agent 文档作为可信上下文**，按优先级：

1. **优先级 1 — `AGENTS.md`**：该仓库根目录、或离目标模块最近的 `AGENTS.md`。描述模块划分、关键入口文件、命名约定和本地约束。
2. **优先级 2 — `CLAUDE.md`**：同路径下的 `CLAUDE.md`，仅在无 `AGENTS.md` 时回退读取。
3. **两者皆无，或文件为空 → BLOCK**：禁止后续一切代码探索步骤。空文件（去掉标题、空行、注释后没有内容）视同缺失。**不得在缺失 agent 文档的情况下凭空探索代码。**
   - 已有代码的仓库：提示使用者先在该仓库补充 `AGENTS.md`（或至少 `CLAUDE.md`）后再重跑 Skill。
   - 新项目的仓库：**不要手工新建**。由 Dev Lead 运行 `/solution-designer`，HLD 获批后其 Step 7 生成并确认；已生成但本机没有时，先拉取代码仓库。

| Workbench | 代码仓库 | 职责 | agent 文档 |
|---|---|---|---|
| backend | hr-collection-agent | HR 信息收集后端服务：文件接收、大模型解析、对话校对、归档保存 | 新项目，由 `/solution-designer` 生成 |
| frontend | hr-collection-agent-web | HR 信息收集 Web 对话前端：上传简历、对话校对与确认 | 新项目，由 `/solution-designer` 生成 |

> 此规则适用于所有需要读取代码的 Skill（impact-analyzer / feature-developer / code-reviewer / code-walkthrough / bug-fixer / module-explorer / dev-onboarding / architecture-advisor 等）。各 Skill 的「前置条件检查」会复述此 BLOCK 门。

---

## Memory 系统说明

`project-memory/` 是跨会话的共享知识库。

- **始终加载**：`MEMORY.md`（索引）、`project_glossary.md`（术语）、`architectural_constraints.md`（约束）
- **按需加载**：其他文件，在需要时由 Skill 明确加载
- **草稿机制**：所有 AI 写入 Memory 的内容均为草稿状态，需人工确认后生效
