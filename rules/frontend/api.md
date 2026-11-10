---
name: frontend Workbench 接口规范
description: frontend Workbench 接口契约约定（命名/参数/响应/错误码/版本）。SKILL 按需自主加载（设计或消费接口时）。
scope: frontend
type: rules
---

# frontend Workbench — 接口/API 规范

> **加载方式**：各 SKILL **按需自主加载**（非强制）。仅当本次任务涉及接口设计/消费/契约比对时加载。

---

## 1. 接口命名与风格

frontend 是接口消费方，遵循 backend 的接口风格与契约，自身不另立约定。

- 调用 backend 的 REST 接口（HTTP/JSON）。参考 backend 约定：路径前缀 `/api/v1`，资源名用复数名词，动作用 HTTP 方法表达。
- 所有调用经统一的 api 封装层（基于 fetch），组件内不直接发请求。
- 前端只通过 backend 提供的 HTTP 接口取数，不直连外部服务、不直连存储。
- 接口契约由 backend 维护（OpenAPI）；契约变更须经 cross-workbench-reviewer 审视。

## 2. 请求 / 响应契约

- 请求与响应格式以 backend 的 OpenAPI 为准，类型与契约保持一致。
- 参考 backend 约定：JSON 字段 snake_case，时间用 ISO 8601 UTC；文件上传用 multipart/form-data。
- 每个调用方处理加载态、空态、错误态。

## 3. 错误码 / 异常约定

- 按 backend 统一错误体 `{code, message, request_id}` 解析，业务码为字符串，HTTP 状态码表达错误类别。
- 错误体可选带 `details: [{field, reason}]`（字段级校验失败，HR_PR-1 D-06）：只含字段名与原因代码，不含用户填写的值；前端不得假设 `details` 一定存在，按 `field` 就地展示、按 `reason` 映射前端文案。
- 响应不是上述错误体时（如代理层的非 JSON 失败），api 封装层使用通用错误，不展示原始响应体。
- api 封装层把错误转换为界面可展示的错误；页面必须处理错误态。
- 不在控制台输出用户提交内容和敏感数据。

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|-------|
| 2026-11-10 | 统一错误体增加可选字段 `details: [{field, reason}]`，补充非 JSON 错误响应的处理（HR_PR-1 裁决 D-06；与 `rules/backend/api.md` 同步） | Yin Yang |
