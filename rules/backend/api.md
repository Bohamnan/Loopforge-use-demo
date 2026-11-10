---
name: backend Workbench 接口规范
description: backend Workbench 接口契约约定（命名/参数/响应/错误码/版本）。SKILL 按需自主加载（设计或消费接口时）。
scope: backend
type: rules
---

# backend Workbench — 接口/API 规范

> **加载方式**：各 SKILL **按需自主加载**（非强制）。仅当本次任务涉及接口设计/消费/契约比对时加载。

---

## 1. 接口命名与风格

- 风格：REST over HTTP/JSON，契约由 OpenAPI 描述；backend 为契约提供方并维护契约。
- 路径前缀 `/api/v1`，资源名用复数名词，动作用 HTTP 方法表达。
- 契约变更须经 cross-workbench-reviewer 审视后才能合入。

## 2. 请求 / 响应契约

- 数据格式：JSON，字段 snake_case，时间用 ISO 8601 UTC。
- 有文件上传时用 multipart/form-data。
- 入参由 Pydantic v2 模型校验。

## 3. 错误码 / 异常约定

- 统一错误体：`{code, message, request_id}`；字段级校验失败时可选附带 `details: [{field, reason}]`（只含字段名与原因代码，不回显用户填写的值）。
- HTTP 状态码表达错误类别，业务码用字符串。
- 错误响应不得包含用户提交内容原文或敏感个人信息，也不暴露系统内部细节。

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|-------|
| 2026-11-10 | 统一错误体增加可选字段 `details: [{field, reason}]`（HR_PR-1 裁决 D-06）；契约变更须经 cross-workbench-reviewer 审视，`rules/frontend/api.md` 需同步 | Yin Yang |
