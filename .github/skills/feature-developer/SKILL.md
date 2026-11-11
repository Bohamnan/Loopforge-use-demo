---
name: feature-developer
description: |
  功能实现专家。基于技术设计文档（design.md + tasks.md），按 Gather-Act-Verify 循环实现代码变更：
  先收集上下文、再实现、再验证，最多两次失败后上报人类。按当前 Workbench（local_profile.yaml 的 role）
  加载对应开发参考，遵循架构约束、先写测试再写实现，支持按 tasks.md 完成标记断点续跑。

  当用户表达"开始写代码"、"实现这个功能"、"按设计写"、"按 tasks.md 做"、"开始开发"、
  "继续上次的任务"、"接着写"、"implement feature"、"写代码"时触发此 Skill。
---

# Feature Developer

基于设计文档，按 Gather-Act-Verify 循环实现功能代码。

> **本 Skill 的分层**：下文为**各 Workbench 通用**的循环、纪律与门控。凡涉及"本 Workbench 具体怎么定位/实现/验证"
> （find/grep 命令、实现顺序、分层职责、构建测试命令、Workbench 红线），一律见运行时加载的
> `references/{role}.md`。SKILL.md 不内联任何单个 Workbench 技术内容。

---

## Memory 契约

### 始终加载（每次执行前必读）
- `01-requirements/{ticket-id}/_progress.md` — 票级进度日志（查看本 Workbench「代码实现」状态，如是否有待确认的 HIGH_RISK 任务）
- `references/{role}.md` — **本 Workbench 开发参考**（role 来自 local_profile.yaml；只加载本 Workbench 那一份）
- `{code_roots.{role}}/AGENTS.md` — 服务结构、模块划分、分层约定（**权威性高于 rules 工程规范和 Workbench 参考**）
- `project-memory/project_glossary.md` — 业务术语，确保代码命名与业务语义一致
- `project-memory/architectural_constraints.md` — 架构约束，实现时必须遵守

> **三层知识的优先级**：`AGENTS.md`（仓库级最细，运行时读）＞ `references/{role}.md`（Workbench 级 SKILL 参考）＞ `rules/{role}/`（团队工程规范）。冲突时以更细者为准。

### 按需加载
- `rules/{role}/coding.md`（及该 Workbench 存在的 `api.md` / `database.md`）— 团队工程规范。**按需自主加载（非强制）**：规范可能较大，不无条件全文载入；当本次实现涉及命名/分层/接口/库设计等其覆盖维度时，再加载相关文件的相关章节。文件不存在则跳过。
- `project-memory/adr_index.md` — 遇到架构选择时检查是否有相关 ADR
- `project-memory/adrs/{ADR-xxx}.md` — 需要完整决策内容时加载全文

### 执行后写入
- `{module_root}/05_task/tasks.md` — 每个任务完成后标记完成（任务级进度只记在这里，见 Step 4）
- `01-requirements/{ticket-id}/_progress.md` — 只维护本 Workbench 的「代码实现（{role}）」一行状态（见 Step 4）
  - **变更重跑场景**：若本次由 requirement-change-router 路由触发，全部任务完成后勾掉 `_progress.md` 重跑清单中本 Skill 对应行（☐→☑）
- `{module_root}/05_task/changelog.md` — 每个任务完成后追加变更记录（修改文件清单只记在这里）

> **变更重跑时的写入规范**：当本 Skill 因需求变更被重跑（由 requirement-change-router 路由），按「文档历史保留约定」**增量实现**——对照更新后的设计 delta，**只改受变更影响的代码**（增/改/删），保留与本次变更无关的既有实现，**不重写整个模块**。代码本身由代码仓库 git 追溯，无需 `_history/` 快照。`changelog.md` 维持 **append 语义**（它是历史账本，追加本次变更记录，不覆盖旧条目）。

---

## 输入

| 输入 | 必填 | 说明 |
|------|------|------|
| **tasks.md 路径** | **是** | 开发任务清单（architecture-advisor 产物） |
| **design.md 路径** | **是** | 技术设计文档 |
| 任务编号 | 否 | 从指定任务开始（默认从 tasks.md 中第一个未完成的任务开始） |

---

## 输出

直接修改 `{code_roots.{role}}` 目录下的源码文件；同时在文档仓库产出：

```
{module_root}/05_task/
└── changelog.md    # 变更日志（每个任务完成后追加）
```

---

## Guardrails

| 规则 | 触发条件 | 执行动作 |
|------|---------|---------|
| **无设计文档禁止开始** | tasks.md 或 design.md 不存在 | BLOCK：提示需先运行 architecture-advisor |
| **架构约束违规** | 实现代码违反 architectural_constraints.md | BLOCK：说明违反的具体约束，要求用户决策 |
| **大文件禁止全量加载** | 文件超过 300 行 | 先用 `grep -n` 定位目标方法的行号，再用 Agent 的读文件工具按行号范围读取，不整份读取（整份加载会挤占上下文、引入无关代码噪声，降低定位与改动精度） |
| **测试覆盖率下降** | 修改后现有测试失败且未新增对应测试 | BLOCK：必须先修复测试再继续 |
| **超出测试预算** | 本 Workbench 测试代码与业务代码的行数比例超过 tasks.md「测试预算」上限 | BLOCK：停止新增测试，向人类报告当前比例与原因，等待决定（精简、放宽上限或继续） |
| **连续失败超限** | 同一错误（同一个失败测试或同一处编译错误）修复 2 次仍失败；或单个任务验证超过 5 轮仍未全部通过 | BLOCK：停止尝试，将错误信息和已尝试方案告知用户，等待人类决策 |
| **高风险修改** | 修改涉及高风险逻辑（如金额计算、状态机核心、权限/租户路由等，具体清单见 `references/{role}.md` Workbench 红线） | WARN：标注 HIGH_RISK，完成后等待人类审查再继续 |
| **ADR 违规** | 实现方案与 ACCEPTED 状态 ADR 冲突 | BLOCK：说明冲突的 ADR 编号，要求决策 |
| **Workbench 模式混用** | 对目标服务使用了不属于本 Workbench 的开发/构建模式（语言、构建工具、分层范式不匹配） | BLOCK：本 Workbench 开发模式以 `references/{role}.md` 和目标仓库 AGENTS.md 为准，告知用户并要求确认后再继续 |

---

## 执行流程

### 前置条件检查

> 本节用 a/b/c… 编号，与下文 GATHER/ACT/VERIFY 的 Step 编号空间分离，避免混淆。

a. 读取 `local_profile.yaml`：
    - **不存在** → BLOCK：必须先创建并显式声明 role
    - role 为 `dev-lead` → 由用户在本次调用中显式指定目标 Workbench（须为 `project-config.yaml` 中的 Workbench key），未指定则询问，不得推断；本 Skill 中凡以 `{role}` 指代 Workbench 处（如 `references/{role}.md`、`code_roots.{role}`、`_progress.md`「代码实现（{role}）」行）均以该 Workbench 代入
    - 获取 `name`、`role`、`code_roots`；`code_roots.{role}` 必须配置且目录存在 → 否则 BLOCK
    - 代码操作路径全部使用 `{code_roots.{role}}`，不使用硬编码路径
    - **加载 `references/{role}.md`**（本 Workbench 开发参考）
b. 读取 `01-requirements/{ticket-id}/_progress.md`（若存在）：查看本 Workbench「代码实现」行；为 ⏸️ 时先请用户确认待审查的 HIGH_RISK 任务
c. 读取 `{code_roots.{role}}/AGENTS.md`（服务结构、模块划分、分层模式；多子服务时读与 tasks.md 对应服务的 AGENTS.md）。**优先级 1=AGENTS.md；缺失则回退读同路径 `CLAUDE.md`（优先级 2）；两者皆无或为空文件 → BLOCK**。区分两种情况：新项目（`code_roots.{role}` 为空仓库）→ 提示先运行 `/solution-designer` 的 Step 7 生成仓库约定初稿并经 Dev Lead 确认，或拉取已推送的代码仓库，不要手工新建；已有代码 → 提示先在该仓库补充 agent 文档后重跑。不得凭空写代码。若 `AGENTS.md` 文件头状态为 `草稿（待 Dev Lead 确认）` 或 `待复核（设计有更新）`，BLOCK：写代码前须 Dev Lead 确认为 `已确认`。新项目的 `AGENTS.md` 没有状态头（手工建的），同样 BLOCK，提示由 Dev Lead 运行 Step 7 合并并确认。
d. **按需自主加载** `rules/{role}/coding.md`（及按 Workbench 存在的 `api.md`/`database.md`）——涉及命名/分层/实现规范时才加载，规范较大时只取相关章节，不强制全文；与 AGENTS.md 冲突时以 AGENTS.md 为准
e. 读取 `project-memory/architectural_constraints.md`
f. 读取 tasks.md（任务列表）和 design.md（设计意图与组件结构）
g. 确认从哪个任务开始：用户指定任务编号时以用户为准，否则从 tasks.md 中第一个未完成（标题未标 ✅）的任务开始

---

### 核心模式：Gather-Act-Verify 循环

每个任务执行一次完整循环：

```
┌─────────────────────────────┐
│  GATHER：收集上下文           │
│  按 design.md 路径定位代码，  │
│  大文件按行号范围读取          │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  ACT：实现变更               │
│  先写/更新测试，再写实现       │
│  遵循目标服务的分层约定        │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  VERIFY：验证结果            │
│  运行测试 → linter → 边界检查 │
│  同一错误最多修 2 次          │
└─────────────────────────────┘
```

---

### Step 1：GATHER — 收集上下文

**目标**：精确定位需要修改/新建的代码，不加载无关文件。

1. **先用设计产物定位**：从当前任务的「关联」章节和 `design.md §3` 代码结构变更表，取得本任务涉及的代码单元、路径和操作：
   - 修改：按路径核实文件和目标方法/函数，先读懂原有逻辑再动手
   - 新增：先确认路径上还没有该文件（已存在则按修改处理，如上次中断留下的文件），再找一个同类已有文件参照命名与写法
2. **按需搜索**：设计中没有路径，或按路径找不到文件、方法时，按 `references/{role}.md` 的「GATHER 策略」搜索；搜索只列文件名，排除构建产物目录（如 `target/`、`node_modules/`、`dist/`）
3. **搜索后的处理**：
   - 在别处找到 → 按实际位置修改，并在 changelog「偏差说明」记录与设计的差异
   - 设计标为「修改」，但仍找不到文件或方法 → 停下询问用户（设计与代码不一致），不自行新建
   - 设计没标明操作或没列出该单元，且搜索不到 → 按 AGENTS.md 的命名和路径约定新建；没列出的单元记入「偏差说明」
4. 对照 reference 的「收集清单」确认覆盖了本 Workbench 所有关键单元（入口、业务逻辑、数据访问、测试等）

---

### Step 2：ACT — 实现变更

**测试先行（各 Workbench 通用）**：
- 有现有测试文件 → 先更新测试覆盖新功能，再写实现
- 无现有测试文件 → 新建测试，至少覆盖正向路径和主要边界条件

**测试适度（防止过度，与测试先行同等效力）**：
- 上限以 tasks.md「测试预算」为准；缺失时按轻量档（测试代码 ≈ 业务代码 1:1）
- 非 HIGH_RISK 任务：只测正常路径和主要异常路径；不做故障注入、变异验证，不用参数化凑数量
- HIGH_RISK 任务：按「测试预算」的红线清单补齐边界与故障场景
- 已有测试覆盖的行为不重复写；只为本任务新增或改变的行为写测试

**实现规范**：按 `references/{role}.md` 的「ACT 实现顺序与分层职责」执行——遵循本 Workbench 从底层到上层的实现顺序，恪守各层职责边界（不越层放业务逻辑）。实现中持续对照 `architectural_constraints.md` 与本 Workbench 红线。

---

### Step 3：VERIFY — 验证结果

验证分两级：**必须通过**（失败则 BLOCK）和**尽力执行**（失败时区分原因再决策）。
两级各自的具体命令见 `references/{role}.md` 的「VERIFY 命令」（必须通过 = 编译/构建/语法；尽力执行 = 测试/lint）。

**执行约定（各 Workbench 通用）**：
- **测试范围**：每个任务只跑与本任务相关的测试（本任务新增/修改的测试，以及被修改代码单元的既有测试）；tasks.md 最后一个任务完成后，再按 reference 跑一次本 Workbench 范围的全量测试。全量测试中能确认与本票改动无关的失败（失败点不涉及本票改动的代码），只记入 changelog「遗留风险」并告知用户，不修复；无法确认时按测试失败处理
- **输出精简**：完整日志写入构建产物目录或仓库外的临时目录（不写进仓库中未被 git 忽略的位置，以免被当作本票改动），上下文只读取退出码和报错行（如 `[ERROR]`、`FAILED`、`Traceback` 所在行）；信息不够时按行号读取日志的相关片段，不整份读取
- **超时**：构建/测试命令使用 Agent 工具自带的超时设置。首次超时可加大超时重跑一次；再次超时按失败处理并告知用户，不再自动重跑

**完成判定清单**（每次 VERIFY 逐项核对）：
- **构建/测试命令**：按 `references/{role}.md` 「VERIFY 命令」执行两级验证（结果进入下方失败处理）
- **架构约束扫描**：本次改动不违反 `architectural_constraints.md` 任何约束、不冲突 ACCEPTED 状态 ADR
- **编码规范与分层**：命名、分层职责符合目标服务约定（以 AGENTS.md / Workbench 参考为准）
- **测试覆盖**：本次修改的每个核心业务方法都有对应测试
- **边界检查**：对照 `references/{role}.md` 「Workbench 红线/边界检查清单」逐项核对（如类型约束、必备字段、跨服务调用方式、空值/空集合返回约定等）

**失败处理**：

| 失败类型 | 处理方式 |
|---------|---------|
| 编译/构建/语法失败 | BLOCK：修复，最多重试 2 次；超限上报人类 |
| 测试失败（基础设施不可达：数据库/外部服务） | ⚠️ WARN：标注"基础设施限制，测试未验证"，继续执行 |
| 测试失败（代码逻辑错误） | BLOCK：修复，最多重试 2 次；超限上报人类 |
| lint 失败 | 修复后重试，最多 2 次；超限 WARN 并列出问题清单 |

---

### Step 4：任务完成确认

每个任务完成后：
1. 列出修改/新建的文件列表
2. 标注通过/失败的验证项；报告本任务新增的测试数，以及当前「测试代码 : 业务代码」行数比例（对照 tasks.md「测试预算」）
3. 📝 **写入变更日志**：追加到 `{module_root}/05_task/changelog.md`（首次创建参照 `doc-templates/06_changelog_template.md`）；修改文件清单只记在这里
4. 📝 **更新进度**：
   - **tasks.md**（任务级进度只记在这里）：在该任务标题末尾加 ✅，勾选其子任务；该阶段任务全部完成时，勾选任务总览表中的该阶段。HIGH_RISK 任务等人类明确确认后再标记
   - **_progress.md**：只维护流程进度表中本 Workbench 的「代码实现（{role}）」行（首次执行时把「代码实现」行改为此名；该行已被其他 Workbench 使用则新增一行；不改其他 Workbench 的行）。进行中标 🔄；HIGH_RISK 任务等待确认时标 ⏸️，确认后恢复 🔄；tasks.md 全部任务完成后标 ✅ 并填写完成时间。不在 `_progress.md` 记录任务明细或文件清单
5. HIGH_RISK 修改等待人类明确确认后再继续下一任务；正常任务询问"是否继续下一个任务"，💡 并提示用户也可新开会话继续（进度已记录在 tasks.md）；全部任务完成时提示可新开会话执行下一步（`/code-walkthrough`）

**changelog.md 追加格式**：

```markdown
## Task-{N}：{任务标题}

**完成时间**：{YYYY-MM-DD}
**实现者**：{name}（{role}）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| {path} | 新增/修改 | {说明} |

### 偏差说明
{与 design.md / tasks.md 的偏差；若无偏差则写"按设计实现，无偏差"}

### 遗留风险
{已知但未处理的风险；若无则写"无"}
```

---

## 人类门控

| 门控点 | 参与者 | 通过标准 |
|--------|-------|---------|
| HIGH_RISK 修改确认 | 开发/架构师 | 高风险逻辑（金额/状态机/权限路由等）已验证正确 |
| 连续失败上报 | 开发 | 人类提供修复方向或决定跳过 |
| ADR 冲突决策 | 架构师 | 确定修改实现还是更新 ADR |

---

## 关键原则

1. **小步前进**：每次只实现一个任务，验证通过后再进入下一个
2. **定位不加载**：先按设计产物中的路径定位，大文件按行号范围读取，不整份加载 300 行以上的文件
3. **测试先行**：先写测试表达预期，再写实现满足测试
4. **约束优先**：`architectural_constraints.md` 中的约束是硬性边界，不可绕过
5. **上报不猜测**：达到「连续失败超限」立即上报，不靠猜测继续尝试
6. **模式匹配**：按目标服务选择正确的开发/分层模式（以 AGENTS.md 和 Workbench 参考为准），不混用其他 Workbench 模式
