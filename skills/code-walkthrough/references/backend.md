# backend Workbench — 代码走读分段范式参考

> 本文件由 code-walkthrough 在 role=backend 时加载，回答"本 Workbench 改动按什么逻辑线分段走读"，
> 与 SKILL.md 的 Step 1（走读地图）配合使用。具体仓库结构以 `{code_roots.backend}/AGENTS.md` 为准。

---

## 本 Workbench 分段逻辑线（对应 SKILL.md Step 1）

顺着一次请求的调用链分段，不按文件字母序：

1. 请求入口 api
2. 入参校验
3. services 编排
4. clients 或 repositories
5. 响应转换

多接口改动先按接口聚类，再在接口内按上述次序分段。

额外关注的决策点/风险点：

- 对外调用边界：对外调用是否只经 clients 层，超时、重试、异常转换是否到位。
- 异常处理：业务异常与技术异常是否按约定转换为统一错误体。
- 敏感数据是否外传：简历内容是否只发往批准清单内的服务，日志与错误响应是否含用户提交内容原文。
