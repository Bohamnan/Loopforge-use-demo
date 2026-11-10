# hr-collection-agent — AGENTS.md

| 项 | 内容 |
|---|---|
| 状态 | 已确认 |
| 版本 | v0（HLD 后生成） |
| 来源 | [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md)（HR_PR-1）；工作台 backend 规范与架构参考 |
| 最后更新 | 2026-11-10 |

## 项目定位

HR 人力信息收集后端服务：接收简历文件、调用获批模型解析、支持对话校对，并在用户确认后归档结构化简历及原始文件。对应 backend Workbench。

## 技术栈

| 类别 | 选型 | 依据 |
|---|---|---|
| 语言与版本 | Python 3.11 | 工作台项目上下文与 backend 架构参考 |
| 框架 | FastAPI、Pydantic v2 | 工作台项目上下文与 backend 架构参考 |
| 数据存储 | SQLite；原始简历存放在项目 `file` 目录；未确认草稿存于正式数据库之外的本地临时存储 | HLD §2；backend `database.md`；ADR-003 |
| 其他关键依赖 | 获批的 DeepSeek Flash（模型标识：`deepseek-flash`），仅由 `clients` 层调用；供应商不得用简历输入训练 | HLD §2；ADR-001 |

## 目录结构

```text
src/app/
├── api/             # 路由、入参校验、响应转换
├── services/        # 业务流程编排
├── repositories/    # SQLite 存储读写
├── clients/         # DeepSeek 等外部调用
├── schemas/         # 请求、响应及领域模型
└── core/            # 应用公共配置与基础能力
tests/               # 与 src 同构的测试
file/                # 已确认简历原始文件归档（具体部署路径待确认）
```

临时草稿目录、SQLite 文件路径及部署目录边界为【待确认：技术设计/部署阶段由 Dev Lead 确认】。

## 分层与职责

- `api`：路由、入参校验、响应转换；不得包含业务判断、直接访问存储或外部服务。
- `services`：编排业务流程；不得拼接存储语句或直接依赖模型服务 SDK。
- `repositories`：存储读写；不得承载业务判断。
- `clients`：第三方 API 与模型服务调用唯一出口，负责超时、重试和脱敏日志；不得承载业务判断。
- `schemas`：贯穿各层，承载 Pydantic v2 请求、响应和领域模型。
- 依赖方向：`api → services → repositories / clients`。

## 命名与编码约定

- 遵循 PEP 8：模块/函数使用 `snake_case`，类使用 `PascalCase`，常量使用 `UPPER_SNAKE_CASE`。
- Pydantic 模型以 `Request`、`Response` 或 `Dto` 结尾。
- 注释与 docstring 使用英文。
- 详细规范见工作台 [coding.md](../../rules/backend/coding.md)。

## 接口与数据约定

- 对外接口采用 REST over HTTP/JSON，路径前缀 `/api/v1`，契约由 backend 维护并使用 OpenAPI 描述。
- 文件上传使用 `multipart/form-data`；JSON 字段使用 `snake_case`，时间使用 ISO 8601 UTC。
- 统一错误体为 `{code, message, request_id}`；错误信息不得包含简历原文、敏感个人信息或内部细节。
- 前后端简历上传、草稿恢复/更新、确认保存的高层契约见工作台 [solution-design.md](../../01-requirements/HR_PR-1/solution-design.md) §4；字段类型、路径细节由后续技术设计确定。
- SQLite 表名及字段名使用 `snake_case`；持久化实体含 `id`、`created_at`、`updated_at`；SQL 使用参数绑定。

## 构建、运行与测试

| 动作 | 命令 |
|---|---|
| 安装依赖 | 【待确认：依赖管理器及安装命令，Dev Lead 在技术设计阶段确认】 |
| 运行 | 【待确认：本地启动命令，Dev Lead 在技术设计阶段确认】 |
| 编译检查 | `python -m compileall -q src` |
| 测试 | `pytest -q` |
| 静态检查 | `ruff check .` |
| 格式检查 | `ruff format --check .` |

## 红线

- B-01：密钥、凭证只放环境变量或配置中心，不得进入代码、日志、仓库或测试夹具。
- B-02：简历数据只能发往批准清单内的模型服务；所有外部调用经 `clients` 层。
- B-03：日志和错误响应不得包含用户提交原文或敏感个人信息。
- B-04：用户明确确认且姓名、手机号、邮箱均齐全前，不得将简历写入正式数据库；未识别/不确定信息不得猜测补全。
- B-05：已归档的每条简历记录必须关联原始文件；保存失败不得留下孤立文件或记录。
- B-06：简历属于敏感个人信息；供应商不得用于模型训练；测试只用合成或脱敏数据。
- 未确认草稿与正式简历数据库分离，服务端本地暂存，7 天无活动后清理；不在浏览器持久化简历内容。
- 正式记录和原始文件无自动到期清理；用户删除功能不属于 HR_PR-1。
- 禁止裸 `except` 或吞异常；模型客户端技术异常须显式转换为应用错误并脱敏。

## 待确认清单

| 序号 | 内容 | 确认人 | 在哪一步确认 |
|---|---|---|---|
| 1 | 依赖管理器、安装及本地启动命令 | Dev Lead/backend 工程师 | 技术设计 |
| 2 | SQLite 文件、临时草稿目录及归档目录的部署位置、权限与清理故障处理 | Dev Lead/部署负责人 | 技术设计与部署设计 |
| 3 | 模型 API 超时、重试、单请求响应时限及约 5 人并发下的实际处理能力 | Dev Lead/backend 工程师 | 技术设计与验证 |
| 4 | DeepSeek 实际环境的文件输入、供应商留存配置与授权证明 | Dev Lead | 集成前核验 |
| 5 | 跨文件系统归档和 SQLite 写入失败时的恢复/补偿细节 | Backend 工程师 | Schema/技术设计 |
