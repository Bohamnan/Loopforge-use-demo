# 代码仓库 AGENTS.md 初稿模板（新项目专用）

> 本文件是 solution-designer **Step 7** 的产出骨架，写入 `{code_roots.{Workbench}}/AGENTS.md`，每个新项目 Workbench 一份。
> 它是 impact-analyzer、architecture-advisor、feature-developer、code-reviewer 读取"仓库约定"的唯一入口，各节必须有实质内容。

## 填写规则

- 内容只来自已有材料：`solution-design.md`、`project-config.yaml`、`rules/{Workbench}/`、`project-memory/`、该 Workbench 的 `references/{role}.md`（如存在）。
- 材料没有明确给出的内容写 `【待确认】`，并在后面写明由谁、在哪一步确认。**不得猜测补全。**
- 新项目没有存量代码，不写"现有模块"一类描述。
- 文件头状态字段必须保留，取值只有三种：`草稿（待 Dev Lead 确认）`、`已确认`、`待复核（设计有更新）`。

## 骨架

```markdown
# {仓库名} — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 草稿（待 Dev Lead 确认） |
| 版本 | v0（HLD 后生成）／v1（技术设计后补全） |
| 来源 | solution-design.md（{ticket-id}）；{其他来源} |
| 最后更新 | {YYYY-MM-DD} |

## 项目定位
{一两句话：这个仓库做什么，对应哪个 Workbench。来源：project-config.yaml 的仓库说明。}

## 技术栈
| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | | HLD 决策 / ADR 编号 |
| 框架 | | |
| 数据存储 | 【待确认】 | |
| 其他关键依赖 | | |

## 目录结构
{按选型给出目录骨架（顶层目录与职责）。HLD 未定到这一层的写 `【待确认：技术设计阶段确定】`。}

## 分层与职责
{各层名称、职责、允许的依赖方向。来源：该 Workbench 的 references 与 rules。}

## 命名与编码约定
{引用 `rules/{Workbench}/coding.md` 的相关章节；没有的写 `【待确认】`。不复制整份规范。}

## 接口与数据约定
{对外接口风格、错误返回格式、跨 Workbench 契约的位置（引用 solution-design.md 对应章节）。}

## 构建、运行与测试
| 动作 | 命令 |
|---|---|
| 安装依赖 | 【待确认】 |
| 运行 | 【待确认】 |
| 测试 | 【待确认】 |
| 静态检查 | 【待确认】 |

## 红线
{项目红线与本 Workbench 红线，引用不复制：密钥不进代码、数据不外发批准清单之外的服务、字段缺失不得猜测补全等。}

## 待确认清单
| 序号 | 内容 | 确认人 | 在哪一步确认 |
|---|---|---|---|
```
