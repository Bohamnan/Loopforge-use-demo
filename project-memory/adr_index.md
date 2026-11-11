---
name: ADR 目录
description: 架构决策记录目录。按需加载；architecture-advisor、cross-workbench-reviewer 执行时读取。
type: reference
---

# ADR 目录

> 架构决策记录（Architecture Decision Records）。
> 每条重要的技术/架构选型都应有对应的 ADR，供后续开发者理解"为什么这样设计"。

---

## ADR 状态说明

| 状态 | 含义 |
|------|------|
| PROPOSED | 已提出，待评审 |
| ACCEPTED | 已接受，当前有效 |
| DEPRECATED | 已废弃（附说明被哪条 ADR 替代） |
| SUPERSEDED | 被新决策替代 |

---

## ADR 列表

<!-- 由 Dev Lead 在 architecture-advisor 执行中维护 -->
<!-- 示例格式：

| ADR | 标题 | 状态 | 日期 | 摘要 |
|-----|------|:----:|------|------|
| [ADR-001](adrs/ADR-001.md) | 微服务间通信方式选择 | ACCEPTED | 2024-01-15 | 选择 REST over gRPC，原因：团队熟悉度和调试便利性 |
| [ADR-002](adrs/ADR-002.md) | 数据缓存策略 | ACCEPTED | 2024-02-01 | Redis 作为分布式缓存，TTL 策略按业务 Workbench 分别配置 |

-->

| ADR | 标题 | 状态 | 日期 | 摘要 |
|-----|------|:----:|------|------|
| [ADR-001](adrs/ADR-001-approved-deepseek-vision.md) | 获批 DeepSeek Flash 直接理解简历 | ACCEPTED | 2026-11-10 | 仅使用获批模型直接解析；能力不满足时阻断，不切换 OCR/其他模型。 |
| [ADR-002](adrs/ADR-002-synchronous-resume-processing.md) | 首期采用同步简历解析 | ACCEPTED | 2026-11-10 | 首期约 5 人并发，采用同步 REST；时延和超时由测试验证。 |
| [ADR-003](adrs/ADR-003-local-draft-retention.md) | 未确认草稿本地暂存与过期清理 | ACCEPTED | 2026-11-10 | 服务端临时本地存储 7 天、HttpOnly Cookie 恢复，确认后再归档。**v2：7 天清理与单草稿令牌被 ADR-008 替代，其余有效。** |
| [ADR-004](adrs/ADR-004-identity-key-idempotent-confirmation.md) | 以规范化“姓名+手机号+邮箱”作为幂等键，确认保存幂等并返回 already_saved | ACCEPTED | 2026-11-10 | 正式库联合唯一约束 + 先查后写 + 冲突回查；201 新增 / 200 already_saved；不覆盖已有记录。**v2.1：already_saved 后经用户再次确认可覆盖更新（id、幂等键不变）。** |
| [ADR-005](adrs/ADR-005-archive-save-order-and-reconciliation.md) | 简历归档的保存顺序、文件命名与启动对账 | ACCEPTED | 2026-11-10 | 复制 tmp → 事务写库 → 原子重命名；文件名 {resume_id}{ext}；启动对账 roll-forward/清除。**v2.1：更新已有记录改用唯一版本名、先提升后提交，对账加"陈旧旧版文件"规则；首次保存不变。** |
| [ADR-006](adrs/ADR-006-structured-section-review.md) | 简历校对采用结构化分区就地编辑，不解析自由文本 | ACCEPTED | 2026-11-10 | 11 个分区整区核对、整区一次 PATCH；输入区仅上传与快捷指令，不设文本框（P-01 选 A、P-04）。**v2：不设文本框/不解析自由文本被 ADR-007 替代，分区编辑保留。** |
| [ADR-007](adrs/ADR-007-conversational-edit-and-qa.md) | 对话修改与问答由获批模型理解，修改以"建议 + 用户应用"生效 | ACCEPTED | 2026-11-11 | 模型返回回复 + 结构化修改建议；backend 确定性校验（字段白名单、字段规则、三项必填须出现在用户消息中）；用户点"应用"后写入。 |
| [ADR-008](adrs/ADR-008-browser-sessions-persistence.md) | 历史会话以浏览器标识 Cookie 归属、服务端永久保存，只允许手动删除 | ACCEPTED | 2026-11-11 | HttpOnly 浏览器标识关联多会话；不自动清理；删除校对中会话连同草稿，删除已保存会话只删对话。 |
| [ADR-009](adrs/ADR-009-global-archive-view.md) | 已归档简历全局只读查看，不做权限控制 | ACCEPTED | 2026-11-11 | 只读列表/详情/原始文件下载；仅监听 127.0.0.1 作为访问边界；对外部署前须补访问控制。 |

---

## ADR 模板

新建 ADR 时，在 `adrs/` 目录下创建 `ADR-{NNN}.md`，使用以下模板：

```markdown
# ADR-{NNN}：{标题}

**状态**：PROPOSED / ACCEPTED / DEPRECATED / SUPERSEDED
**日期**：{YYYY-MM-DD}
**决策者**：{姓名}

## 背景

{为什么需要做这个决策？面临的约束是什么？}

## 决策

{选择了什么方案？}

## 后果

**正面影响**：
- {优点1}

**负面影响 / 取舍**：
- {缺点或风险1}

## 备选方案（已评估但未采用）

| 方案 | 放弃理由 |
|------|---------|
| {方案A} | {理由} |
```
