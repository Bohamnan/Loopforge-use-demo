# frontend Workbench — 测试数据脚本参考

> 本文件由 test-data-script-generator 在 role=frontend 时加载，回答"本 Workbench 各数据源怎么造数/验证/清数"。

---

## 0. Workbench 画像

- 本 Workbench 无数据存储职责（`has_storage` 为 false），没有自主造数能力。
- 测试数据来源：接口 mock 与公开样例数据。
- 数据源清单：消费的 backend 接口（以 backend OpenAPI 契约为准，测试中 mock）。
- 触发分支：无。
- 样例数据一律使用明显的虚构占位，不得使用真实简历等个人信息。

---

## 1. 造数语法 + 各数据源前缀格式（对应 SKILL.md Step 2 与「数据前缀规则」）

不适用：前端无数据存储职责

---

## 2. 验证查询（对应 SKILL.md Step 3）

不适用：前端无数据存储职责

---

## 3. 清数语法（对应 SKILL.md Step 4，幂等、反序）

不适用：前端无数据存储职责
