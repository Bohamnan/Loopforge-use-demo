---
name: project-setup-brief
description: 读取 project-brief.yaml，一次确认后批量实例化 dev-harness 工作台；替代基础版 project-setup 的逐问逐答（第 1、2 阶段），第 3 阶段复用基础版
---

# Project Setup（Brief 模式）

把基础版 `project-setup` 需要反复提问才能收集的信息，提前写进一个总览文件 `project-brief.yaml`；本 Skill 读取它，让用户**一次确认**，再批量完成落盘。

---

## 与基础版的关系

- 基础版 `skills/project-setup/` 保持不变，仍可单独使用。
- 本 Skill 只取代基础版的**第 1 阶段（项目信息）和第 2 阶段（逐 Workbench 技术栈采集）**，产出与基础版第 2 阶段完全相同的文件，所以基础版第 3 阶段的入口校验可以直接通过。
- 第 3 阶段（生成 AGENTS.md、本地化全部 Skill、整理 memory、复制模板、建目录）**原样复用基础版**，不在这里重复。
- 第 4 阶段（适配到 AI Agent 工具）同基础版，可选；若目标工作区使用 VS Code Copilot，技能应写入 `.github/skills/`，使其可被自动发现。

## 执行前提

- 在 dev-harness framework 仓库（或其副本）根目录运行，与基础版一致：需要其中的 `skills/`、`rules/templates/`、`project-memory/templates/`、`project-config.yaml.template`、`doc-templates/`、`global-info/`。
- 有一份 `project-brief.yaml`。默认读取运行目录根；不在则询问路径。
- 全程只读写 Markdown 与 YAML，不执行脚本，不联网。

## 输出

与基础版相同，另加一份 `{target}/project-brief.confirmed.yaml`：确认后的 brief 副本，记录每条事实最终的取值、状态、确认人和日期，是这次初始化的追溯依据。

---

## Guardrails

| 规则 | 触发条件 | 执行动作 |
|------|---------|---------|
| brief 缺失或无法解析 | 找不到文件，或 YAML 解析失败 | BLOCK：指出位置，提示使用适配包里的 `project-brief.yaml` 重新准备 |
| brief 含疑似密钥 | 出现 API Key、token、密码、内网地址等 | BLOCK：不得继续，也不得回显其值，只说明所在位置，要求用户改为环境变量引用后再运行 |
| 未确认即落盘 | 确认单未获用户答复 | BLOCK：禁止写任何文件到目标路径 |
| 必答项未答 | `blocking: true` 的项仍是 `【待填写】` | BLOCK：只追问这些项，一次列全 |
| 未填写识别 | 取值为 `【待填写】`、null、空串，或含“待定”“TBD”“TODO” | 一律按未填写处理，**不论状态写的是什么**；状态与取值不一致时，在确认单里提示“brief 状态有误” |
| Skill 覆盖缺口 | 某个 Skill 的槽找不到来源字段，或来源字段未填 | 必须按 Skill 逐个列在确认单里，不得自行补写后默默落盘 |
| 框架与对照表不一致 | 框架里有对照表没列到的 Skill 或槽 | WARN：列在确认单“覆盖缺口”中，问用户是补充 brief 还是同意按推断填写 |
| 目标路径已有内容 | 写第一个文件前 | WARN：列出已有文件，询问覆盖、续跑还是换路径 |
| 无依据内容 | 槽在 brief 里找不到对应字段 | WARN：不得静默选定，标 `⚠️ 推断无文档依据`，并列入确认单第四组（覆盖缺口） |
| 用户选择暂不确认 | 对预设项或非必答的待填写项答复"暂不确认" | 允许：预设项按原值落盘，待填写项写 TODO，槽内标注，完成报告里列出 |
| 背景推断越界 | 对选型项以外的条目（项目名、仓库名、业务约束、数据合规口径等）给出背景推断建议 | BLOCK：这些只能由项目方决定，不给建议，写“无建议，需项目方提供” |
| 背景推断无依据 | 背景推断建议没有写明依据背景里的哪一项，或依据的背景项仍未填写 | BLOCK：不得输出该条建议；背景整体未填写时，选型项只给模板建议，并提示“填写项目背景后可获得针对性建议” |

---

## 流程

### Step 0 探测进度（每次进入先做）

1. 读取 brief；`target_path` 为空时，向用户询问目标路径。
2. 探测目标路径，规则同基础版"断点续跑协议"：
   - 没有 `project-config.yaml` 且没有 `project-brief.confirmed.yaml` → 全新开始，进入 Step 1。
   - 已有 `project-brief.confirmed.yaml` → 确认已完成，跳过 Step 1 到 Step 3，从 Step 4 检查哪些文件缺失，只补缺失的。
   - 已有 `project-config.yaml` 但没有 confirmed 文件 → 属于基础版逐问逐答产生的实例，询问用户是覆盖、续跑还是换路径。
3. 用一句话汇报探测结论后继续。

### Step 1 校验 brief 并主动识别缺口

1. 解析 brief，统计 confirmed、assumed、待填写三种情况的条数，按 Workbench 分别统计。
2. **未填写扫描**：全文查找 `【待填写】`、null、空串、含“待定”“TBD”“TODO”的取值，记为未填写项。状态与取值不一致的（状态写 confirmed 或 assumed 但取值未填；或状态写 tbd 但已有真实取值），以取值为准重新归类，并记下来在确认单里提示。
3. 检查是否具备 `background` 块，以及每个 Workbench 是否具备：identity、tech、commands、layering、conventions、constraints、design_profile。缺块的，转为确认单里的必答项，不得补编。`background` 各项可以“暂不确认”，不阻断初始化。
4. 检查是否含疑似密钥（见 Guardrails）。
5. **逐 Skill 覆盖检查**（必做，不得省略）：读取 framework `skills/` 下每个含 `references/_reference.template.md` 的 Skill，加上 dev-self-test 的 base 模板和 `rules/templates/`，列出它们的全部技术专属槽（模板里成对的 HTML 注释区块：起始注释以 `<!-- TECH` 开头，结束注释以 `<!-- /TECH` 开头）。每个槽对照下文“槽与 brief 字段的对应”，分成五类：
   - 有据：来源字段已确定。
   - 待确认：来源字段是预设值，尚未确认。
   - 待填写：来源字段未填写。
   - 无对应字段：brief 里没有可用来源。
   - 不在对照表：框架里的槽或 Skill 在对照表中没有列到。
   按 Skill 汇总，得到每个 Skill 的覆盖情况，供 Step 2 使用。
6. **结合项目背景给选型建议**（`background` 至少填了一项时执行）：
   - **范围**：只针对各 Workbench `tech` 块里的条目（语言、框架、数据库、关键依赖、组件库、状态管理等），即技术选型。项目名、仓库名、业务约束、跨 Workbench 约定、数据合规口径不在范围内。
   - **依据**：只用 `background` 中已填写的项，加上 brief 里已确认的技术事实（如已定的语言、框架、约束）。通用技术知识只能用来把依据落到具体选型上，不能单独作为依据。
   - **对待填写的选型项**：给出“背景推断建议”，写明建议取值、理由，以及依据的背景项原文（如“依据 background.inputs_outputs：需要接收扫描件”）。模板已有 `suggest` 的，先判断它与背景是否一致：一致则保留模板建议，并在理由里补一句背景依据；不一致则给出调整后的建议，并写明冲突点。
   - **对已有预设值的选型项**：逐条检查是否与背景冲突（如背景写明是手机端应用，前端预设却是浏览器页面框架；背景写明数据量大、并发高，后端预设却是单文件数据库）。只列出有冲突的，给出调整建议和依据；没有冲突的不打扰。
   - **深度**：建议只到选型这一层（用什么、为什么），不做模块划分、数据流设计等架构设计，那是 solution-designer 的工作。
   - 结果供 Step 2 第二组、第三组使用。

### Step 2 一次性确认单

向用户输出**一条**消息，包含四组，然后等待答复。不要逐条提问。

**每一条要用户填写或确认的内容，都必须写明它的含义和影响**，让用户知道自己确认的是什么：含义和影响取自 brief 的 `field_guide`（约束条目用 `constraints` 的说明加该条原文），用业务语言写，不能只列键名。`field_guide` 里没有的键，用一句话说明它决定什么，并在第四组末尾列出“字段说明缺失”。

**第一组 已确认**：只给数量和分组摘要（项目、项目背景、跨 Workbench、各 Workbench 各几条）。用户要求时再展开。

**第二组 必答项（`【待填写】`）**：表格，列为 编号、Workbench、事项、含义与影响、建议取值、建议来源、建议理由与依据、需核实、要填什么（取自 `hint`）、可选项（取自 `alt`）、是否阻断。
- 建议来源只有两种：**模板建议**（取自 brief 中该项的 `suggest`、`why`、`check`）和**背景推断**（Step 1 第 6 步得出，理由里必须引用依据的背景项原文）。两种都有时以背景推断为准，并注明模板建议是什么、为什么调整。
- 选型项以外的条目不给建议；没有任何建议的项，建议栏写“无建议，需项目方提供”。不得给出没有来源的建议。

**第三组 预设值（需确认）**：表格，列为 编号、Workbench、事项、含义与影响、当前取值、依据。编号由本 Skill 现场按出现顺序编，仅在本次答复中使用。Step 1 第 6 步发现与背景冲突的预设值，排在本组最前面，另加“与背景冲突”“调整建议与依据”两列。

**第四组 覆盖缺口（按 Skill）**：Step 1 第 5 步得到的逐 Skill 覆盖情况。先给汇总表，列为 Skill、槽总数、有据、待确认、待填写、无对应字段、不在对照表；全部有据的 Skill 只写“全部有据”。然后对**无对应字段**和**不在对照表**的槽，逐个写出槽名、这个槽在生成的文件里起什么作用（一句话）、拟填写的内容（一句话），并说明依据是什么。每个有缺口的 Skill 都要明确问用户两选一：
- 同意按拟填内容推断，槽内会标 `⚠️ 推断无文档依据`；
- 先补充 brief 再运行，由用户指出要补哪个字段。

若发现状态与取值不一致的条目，在第四组末尾单列“brief 状态有误”，写明条目和建议的状态。

结尾给出答复方式：

> 请一次性答复：「第三组全部同意」，或「第三组第 N 条改为……」，或「第三组第 N 条按调整建议」，或「第三组第 N 条暂不确认」；第二组每项选「采纳建议」「先按建议用，待负责人确认」「自己填写取值」或「暂不确认」（没有建议的项只能选后两种）；第四组对每个有缺口的 Skill 选“按推断”或“先补 brief”。

如果答复里缺少阻断项，只再追问这些阻断项，一次列全，不再重复其他内容。

### Step 3 回写确认结果

在目标路径写入 `project-brief.confirmed.yaml`（复制 brief，不修改原文件）：

- 用户同意或修改过的条目：`v` 更新（原为 `【待填写】` 的替换为所填内容，并删除 `hint`），`s` 改为 `confirmed`，补 `by`（用户本人，或用户指明的确认人）与 `on`（今天的日期）。
- 第二组选「采纳建议」的条目：`v` 取所采纳建议的值，`s` 改为 `confirmed`，`basis` 写“采纳模板建议：”加理由，或“采纳背景推断建议：”加理由和依据的背景项（如 `background.inputs_outputs`），补 `by` 与 `on`，删除 `hint`。选「先按建议用，待负责人确认」的：`v` 取所采纳建议的值，`s` 改为 `assumed`，`basis` 同上，保留 `check`，删除 `hint`；落盘时按预设值规则在槽内加 `⚠️ 待确认`。这样生成的文件里不会出现 TODO 空洞，负责人确认后只需改这一条。
- 第三组选「按调整建议」的条目：`v` 改为调整后的取值，`s` 改为 `confirmed`，`basis` 写“按背景调整：”加冲突点和依据的背景项，补 `by` 与 `on`。
- 暂不确认的条目：保持原 `s` 与原取值（待填写项仍保留 `【待填写】`），增加 `deferred: true`。
- 第四组：用户选“按推断”的槽，记入文件末尾的 `inferences_accepted` 列表；选“先补 brief”的，在补完前不落盘该 Skill 对应的 references，并在完成报告里列出。

### Step 4 落盘（确认单通过后一次完成）

按以下顺序写入。每个 Workbench 的各类文件在同一轮写完；写完后向用户报告一句"已落盘 {Workbench}：N 份 references、N 份 rules"。

1. **`{target}/project-config.yaml`**：以 `project-config.yaml.template` 为底，填 `project.*`、`dirs.*`、`roles`；每个 Workbench 只写索引字段 `key`、`name`、`doc_root`、`repositories`。技术栈、命令、约定一律不进 config。
2. **`{target}/.github/skills/{skill}/references/{Workbench}.md`**：对每个含 `_reference.template.md` 的 Skill，读模板，按下文规则填满全部槽。
3. **`{target}/.github/skills/dev-self-test/templates/{Workbench}_dev_test_template.md`**：同理，用 base 模板填槽。
4. **`{target}/rules/{Workbench}/`**：
   - `coding.md`：所有 Workbench 都生成。
   - `api.md`：`interface_form` 有取值就生成（提供方写提供规则，消费方写消费规则）。
   - `database.md`：`has_storage` 为 true 就生成；介质仍未填写的部分写 `TODO`。
5. **`{target}/project-memory/architectural_constraints.md`**：把各 Workbench 的 `constraints` 与 `cross_workbench` 追加为条目，按内容归入跨 Workbench 通信、数据层、安全、业务四类，保留 `level`（BLOCK 或 WARN），来源写 brief 里的 id 与依据，整段标注 `<!-- draft -->`。仍为 `【待填写】` 的约束写成一行 `TODO`。
6. **`{target}/project-memory/project_glossary.md`**：把 `glossary_seed` 写成术语表，整段标注 `<!-- draft -->`。**注意**：基础版第 3 阶段会从模板复制该文件，执行时遇到该文件已存在且有内容，必须保留，不得覆盖。
7. **`{target}/global-info/business-brief.md`**：以 framework 的 `global-info/business-brief.template.md` 为底，把 `background` 各项填进对应小节（summary→摘要，problem→要解决的问题，users→目标用户，in_scope→范围内，out_of_scope→范围外，inputs_outputs→主要输入与输出，success_criteria→成功标准），只照录 brief 的取值，不改写、不补编；暂不确认或未填写的项写 `TODO: 待补充（brief:background.{键名}）`。更新记录表加一行“初始化：由 project-brief.yaml 生成”。基础版第 3 阶段遇到该文件已存在时会保留，并用它的摘要生成 `AGENTS.md` 的“项目概览”。

### Step 5 复核并转入基础版第 3 阶段

1. 复核：`project-config.yaml` 各 Workbench 条目无 `# TODO`；每个启用 Workbench 在每个 Skill 的 `references/` 下都有对应文件；目标路径下不再残留未填的技术专属区块，即不再有以 `<!-- TECH` 或 `<!-- /TECH` 开头的注释（`TODO` 与 `⚠️` 标注允许存在）。
2. 读取基础版 `skills/project-setup/SKILL.md` 的"第 3 阶段"，**自主执行 3.1 到 3.9，不再停下等指令**。其中 3.6 按上一步第 6 点保留已有术语表。
3. 第 4 阶段询问用户是否需要，同基础版。

### Step 6 完成报告

在基础版第 3 阶段的完成报告之外，追加：

- 本次一共问了几个问题（应只有 Step 2 那一次，加必要的阻断项补问）。
- 暂不确认和仍为 TODO 的事项清单，每条写明所在文件和 brief 编号。
- 带 `⚠️` 的槽数量，按文件列出。
- 提醒：这份 `project-brief.confirmed.yaml` 要随仓库提交，后续技术栈变化时先改它，再重跑本 Skill 补齐受影响的文件。

---

## 槽填充规则

每个槽先在 brief 里找来源字段（见下表），再按来源字段的最终状态决定怎么写：

| 来源情况 | 写法 |
|---|---|
| 来源字段状态为 confirmed | 直接写，不加标注 |
| 来源字段曾为 assumed，但已确认并改为 confirmed | 直接写，不加标注 |
| 来源字段仍为 assumed（用户暂不确认） | 照原值写，行尾加 `⚠️ 待确认（brief:{编号或键名}）` |
| 来源字段为 `【待填写】`（未填写） | 写 `TODO: 根据实际情况填写（brief:{键名}）`，不得编造 |
| brief 里没有对应字段，靠通用知识补足 | 写出内容，行尾加 `⚠️ 推断无文档依据`，并已在确认单第四组（覆盖缺口）列出 |

**不得**用别的 Workbench 的做法硬套，**不得**在没有来源时静默选定。

## 槽与 brief 字段的对应

| 槽（所在文件） | 来源字段 |
|---|---|
| Workbench 设计画像、Workbench 画像（architecture-advisor、test-data-script-generator） | `design_profile.has_storage`、`design_profile.interface_form` |
| Schema 设计规范、Schema 产出骨架 | `has_storage`、`schema_dimensions`、`conventions.audit_fields`、`tech.database`；`has_storage` 为 false 时写"本 Workbench 无数据存储职责" |
| 接口/管道设计规范 | `interface_form`、`interface_dimensions`、`request_response_contract`、`error_contract` |
| 技术设计逐 Workbench 章节 | `layering.*`、`tech.*`、`test_dimensions` |
| 任务切片划分 | `slice_shape` |
| Workbench 设计红线、Workbench 红线与边界检查 | `constraints` 中 BLOCK 级条目，加 `layering` 各层的禁止事项 |
| 代码定位命令、代码定位命令与入口策略、模块入口定位命令、GATHER 定位命令与收集清单、探索策略 | `design_profile.locate_cmd`、`layering.dirs`、`layering.pattern` |
| 回归验证命令、VERIFY 命令 | `commands.test`、`test_one`、`lint`、`build` |
| ACT 实现顺序与分层职责、架构/分层合规检查项 | `layering.*` |
| 业务逻辑高风险模式 | `constraints` 中业务类条目 |
| 编码规范重点 | `conventions.*` |
| 安全检查项 | `constraints` 中安全类条目、`cross_workbench.secrets_rule` |
| 测试覆盖门槛 | `design_profile.test_dimensions`、`constraints` 中关于准确率与测试的条目 |
| 本 Workbench 分段范式（code-walkthrough） | `design_profile.walkthrough_path` |
| 识别信号（requirement-kickoff） | `design_profile.kickoff_signals` |
| 造数语法与前缀、验证查询、清数语法 | `design_profile.test_data`、`tech.database`；介质未填写时写 TODO |
| dev-self-test：本 Workbench 验证方式一句话说明、本 Workbench 设计文档名、本 Workbench 数据源类型表、本 Workbench 测试维度集 | `interface_form`、`tech.*`、`commands.test`、`test_dimensions` |
| dev-self-test：被测单元头部字段、输入字段名、输出字段名、本 Workbench 验证查询代码块、本 Workbench 附加追溯维度 | `design_profile.self_test_unit_header`、`self_test_io`（输入与输出两个槽）、`self_test_verify`、`self_test_trace_dims` |
| rules coding：分层约定、命名约定、编码红线、通用代码约定 | `layering.*`、`conventions.naming`、`constraints`、`conventions.comment_language / error_handling / logging` |
| rules api：接口风格、请求响应契约、错误码约定 | `api_style`、`request_response_contract`、`error_contract` |
| rules database：库表命名、字段类型约定、存储设计 | `tech.database`、`conventions.audit_fields`、`schema_dimensions`；介质未填写时写 TODO |

对照表没有列到的新槽：按槽标题找最接近的字段；找不到就归入第四组（覆盖缺口）。

---

## 偏离基础版之处（须让评审者知晓）

| 基础版做法 | 本 Skill 做法 | 保留了什么 |
|---|---|---|
| 第 1 阶段逐问逐答，再做摘要确认 | 信息来自 brief，合并进一次确认单 | 未确认不落盘 |
| 每个 Workbench 单独采集并确认一次 | 所有 Workbench 的待确认项在同一张确认单里 | 每个事实仍有状态和依据 |
| 无据的槽逐条回呈 | 先按 Skill 做覆盖检查，把缺口按 Skill 集中回呈，每个有缺口的 Skill 问“按推断”或“先补 brief”，槽内同时标注 | 不静默选定、不编造、TODO 优于空白 |
| 不预先准备采集答案 | 预先准备 brief，所有 assumed 项写明依据 | 不以假设充当事实：assumed 必须经项目负责人确认 |
| 技术栈逐项问用户 | 结合 brief 的项目背景，对技术选型项给出建议，并检查预设值是否与背景冲突 | 建议只限选型项、必须注明依据的背景项、由用户决定采纳与否 |

## 变更与维护

- **本文件不得写出模板标记的完整字样。** 本 Skill 会被本地化进工作台，而工作台的残留扫描按该字样查找；写出完整字样会让扫描把本 Skill 误判为未填写。需要指代时，用“以 `<!-- TECH` 开头的注释”这类写法。

- 技术栈或约束变化时，先改 `project-brief.confirmed.yaml`，再重跑本 Skill；探测到已有 confirmed 文件时，只补缺失或被改动影响的文件。
- 新增 Workbench：在 brief 的 `workbenches` 里追加一块，重跑本 Skill。
- 基础版框架升级后，需复核"槽与 brief 字段的对应"表是否仍覆盖全部槽。
