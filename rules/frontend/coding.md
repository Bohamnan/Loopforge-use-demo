---
name: frontend Workbench 编码规范
description: frontend Workbench 代码风格、命名、分层、禁止事项。SKILL 按需自主加载（涉及命名/分层/实现规范时）。
scope: frontend
type: rules
---

# frontend Workbench — 编码规范

> **加载方式**：本文件由各 SKILL **按需自主加载**（非强制）。规范可能较大，SKILL 应先看本段 description，
> 仅当本次任务涉及命名/分层/接口约定/实现习惯等覆盖维度时再加载相关章节。
> 通用语言规范（如 PEP8、Google Java Style、Airbnb React Style）不在此重复，以语言官方规范为准。

---

## 1. 分层 / 结构约定

分层模式：pages → components → hooks → api 封装层。目录结构：`src/{pages,components,hooks,api,types}`。

| 层 | 职责 | 禁止事项 |
|----|------|---------|
| pages | 页面编排与路由 | 直接请求接口 |
| components | 展示与交互 | 直接请求接口、持有业务规则 |
| hooks | 状态与副作用，调用 api 层 | 操作 DOM 样式 |
| api | 封装对 backend 接口的调用与错误转换，是前端访问后端的唯一出口 | — |

## 2. 命名约定

- 组件与文件：PascalCase。
- hooks：以 `use` 开头。
- 类型：以接口契约命名。

## 3. 禁止事项 / 红线

BLOCK：

- F-01：前端不得保存任何密钥或凭证，不得直连外部服务或存储。
- F-03：对话界面必须清楚展示待校对的解析结果，用户明确确认前不得提示"已保存"。
- 页面、组件内不得直接请求接口，所有调用经 api 封装层。
- 密钥、凭证只放环境变量或配置中心，不得写入代码、日志、仓库。

WARN：

- F-02：不在浏览器本地存储敏感数据。

## 4. 通用约定（注释 / 日志 / 错误处理）

- 注释：代码注释使用英文。
- 日志：不在控制台输出用户提交内容和敏感数据。
- 错误处理：api 层统一转换错误；页面必须处理加载态、空态、错误态。
- 状态管理：不引入状态管理库，用 React 自带的 useState、useReducer；业务数据以后端为准。
- 组件库：Ant Design（React 版）。
- 命令：安装 `npm ci`；构建 `npm run build`；测试 `npm test`；静态检查 `npm run lint`（格式检查随 lint，不单设格式化命令）。

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|-------|
| （初始为空，由团队在代码审查中增量维护） | — | — |
