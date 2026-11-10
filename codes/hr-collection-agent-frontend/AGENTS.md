# hr-collection-agent-web — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 已确认 |
| 版本 | v0（HLD 后生成） |
| 来源 | [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（HR_PR-1）；工作台 frontend 规范与架构参考 |
| 最后更新 | 2026-11-10 |

## 项目定位

HR 人力信息收集 Web 对话前端：支持用户上传简历、查看并校对识别结果、明确确认后接收保存结果。对应 frontend Workbench。

## 技术栈

| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | TypeScript | 工作台项目上下文与 frontend 架构参考 |
| 框架与构建 | React 18、Vite | 工作台项目上下文与 frontend 架构参考 |
| 组件库 | Ant Design（React 版） | 工作台 frontend coding 规范 |
| 状态管理 | React `useState` / `useReducer`；不引入额外状态管理库 | 工作台 frontend coding 规范 |
| API 客户端 | 统一 `api` 封装层（基于 fetch），仅访问 backend | 工作台 frontend API 规范 |

## 目录结构

```text
src/
├── pages/       # 页面编排与路由
├── components/  # 展示与交互组件
├── hooks/       # 状态与副作用，调用 api 层
├── api/         # backend HTTP 调用及错误转换
└── types/       # 与 backend OpenAPI 契约一致的类型
```

## 分层与职责

- `pages`：页面编排与路由，不直接请求接口。
- `components`：展示与交互，不直接请求接口、不持有业务规则。
- `hooks`：状态与副作用，调用 `api` 层；不得操作 DOM 样式。
- `api`：封装 backend 调用与错误转换，是前端访问数据的唯一出口。
- 类型定义与 backend OpenAPI 契约保持一致。

## 命名与编码约定

- 组件与文件使用 `PascalCase`。
- Hooks 以 `use` 开头。
- 类型以接口契约命名。
- 注释使用英文。
- 详细规范见工作台 [coding.md](../../rules/frontend/coding.md)。

## 接口与数据约定

- 仅调用 backend 的 REST/HTTP/JSON API；backend 提供并维护 OpenAPI 契约。
- 简历文件上传使用 backend 契约定义的 `multipart/form-data`；路径、字段和响应以 OpenAPI 为准。
- 所有 API 调用经 `api` 封装层（基于 fetch）；按 `{code, message, request_id}` 统一错误体处理，不在控制台记录简历原文或敏感信息。
- 上传/解析、草稿读取与修订、确认保存的高层契约见工作台 [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md) §4；详细接口以 backend 后续 OpenAPI 设计为准。
- 简历内容只存于前端运行时内存；恢复依靠服务端草稿和安全 HttpOnly Cookie，不把简历或校对内容存入浏览器本地。

## 构建、运行与测试

| 动作 | 命令 |
|---|---|
| 安装依赖 | `npm ci` |
| 构建 | `npm run build` |
| 测试 | `npm test` |
| 静态/格式检查 | `npm run lint` |

## 红线

- F-01：不得保存密钥或凭证，不得直连模型服务、其他外部服务或存储；只通过 backend HTTP API。
- F-02：不得在浏览器本地存储简历或其他敏感个人信息；前端运行时只保留完成交互所需的临时状态。
- F-03：用户明确确认前不得提示“已保存”；仅在 backend 返回保存成功后反馈成功。
- 页面、组件不得直接请求接口；组件不得持有业务规则；Hook 不得操作 DOM 样式。
- 上传限制为 PDF、JPG/JPEG、PNG 且单文件不超过 10 MB；姓名、手机号、邮箱为保存前必需字段，其他字段允许为空。
- 必须清楚展示待校对结果与未识别/不确定字段，并支持用户修正。
- API 契约变更须经过 `cross-workbench-reviewer` 审视。

## 待确认清单

| 序号 | 内容 | 确认人 | 在哪一步确认 |
|---|---|---|---|
| 1 | 用户等待同步解析时的进度呈现与模型超时后的具体交互 | Dev Lead/frontend 工程师 | 技术设计 |
| 2 | Cookie 的 SameSite、Secure、Path、续期及跨域部署配置 | Dev Lead/frontend/backend 工程师 | 接口与部署设计 |
| 3 | backend OpenAPI 的具体路径、字段类型、状态值和错误码 | Backend 工程师 | 接口设计；随后由跨 Workbench Review 确认 |
