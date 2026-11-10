---
name: backend Workbench 编码规范
description: backend Workbench 代码风格、命名、分层、禁止事项。SKILL 按需自主加载（涉及命名/分层/实现规范时）。
scope: backend
type: rules
---

# backend Workbench — 编码规范

> **加载方式**：本文件由各 SKILL **按需自主加载**（非强制）。规范可能较大，SKILL 应先看本段 description，
> 仅当本次任务涉及命名/分层/接口约定/实现习惯等覆盖维度时再加载相关章节。
> 通用语言规范（如 PEP8、Google Java Style、Airbnb React Style）不在此重复，以语言官方规范为准。

---

## 1. 分层 / 结构约定

分层：api → services → repositories / clients；schemas 贯穿各层。
目录：`src/app/{api,services,repositories,clients,schemas,core}`；`tests/` 与 src 同构。

- api：职责为路由、入参校验、响应转换。禁止业务判断、直接访问存储或外部服务。
- services：职责为编排业务流程。禁止拼接存储语句、直接依赖具体外部服务的 SDK。
- repositories：职责为存储读写。禁止业务判断。
- clients：对外调用的唯一出口（第三方 API、模型服务等），负责超时、重试、脱敏日志。禁止业务判断。

## 2. 命名约定

遵循 PEP 8：

- 模块与函数：snake_case
- 类：PascalCase
- 常量：UPPER_SNAKE
- Pydantic 模型：以 Request、Response、Dto 结尾

## 3. 禁止事项 / 红线

- B-01（BLOCK）：密钥、凭证只放环境变量或配置中心，不进代码、日志、仓库、测试夹具。
- B-02（BLOCK）：数据不得发往批准清单之外的外部服务；对外调用只经 clients 层。
- B-03（BLOCK）：日志与错误响应不得包含用户提交内容原文或敏感个人信息。
- B-04（BLOCK）：解析结果必须经用户在对话中确认后才能写入数据库；识别不到或不确定的字段必须请用户补充，不得猜测补全。
- B-05（BLOCK）：每条简历记录必须关联其原始文件（文件存放于项目 file 目录），保存记录与保存文件须保持一致，不得出现有记录无文件或有文件无记录。
- B-06（BLOCK）：简历属个人敏感信息，仅允许发送给批准清单内的模型服务；测试与样例只用合成或脱敏简历，不得提交真实简历。
- 分层红线：禁止越层调用（见"分层 / 结构约定"各层禁止事项）。
- 禁止裸 except 与吞异常。
- TODO: 照片文字识别方式待核实（brief:backend.key_dependencies）

## 4. 通用约定（注释 / 日志 / 错误处理）

- 注释：代码注释与 docstring 使用英文。
- 日志：结构化日志；不输出用户提交内容原文和敏感个人信息；每条请求带 request_id。
- 错误处理：业务异常继承统一的 AppError，技术异常在 clients 层捕获并转换；禁止裸 except 与吞异常。
- 公共基类：无（新项目不预设公共基类）。
- 查询过滤：无特殊过滤约定。

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|-------|
| （初始为空，由团队在代码审查中增量维护） | — | — |
