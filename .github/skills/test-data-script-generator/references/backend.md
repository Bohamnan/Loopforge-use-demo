# backend Workbench — 测试数据脚本参考

> 本文件由 test-data-script-generator 在 role=backend 时加载，回答"本 Workbench 各数据源怎么造数/验证/清数"。

---

## 0. Workbench 画像

- 自主造数能力：有（has_storage=true）。
- 数据源清单：SQLite 本地单文件数据库；原始简历文件目录（项目 file 目录）。
- 触发分支：无。
- 数据要求：只使用脱敏或公开样例与 fixtures；示例数据一律用明显的虚构占位，不得使用真实简历内容。具体表结构在技术设计阶段确定，下文表名、字段名为占位。

---

## 1. 造数语法 + 各数据源前缀格式（对应 SKILL.md Step 2 与「数据前缀规则」）

SQLite 关系库（前缀标识放在审计之外的业务可识别字段中，具体字段在技术设计阶段确定）：

```sql
INSERT INTO {table}(id, {业务字段}, created_at, updated_at)
VALUES ('{前缀}-T001', '{虚构占位}', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
```

- 表名、字段名使用小写下划线；示例值须为明显的虚构占位。
- 前缀格式：`{前缀}-T{序号}`，用于清数时的精确匹配。

原始文件目录：在项目 file 目录下造合成占位文件，文件名以 `{前缀}-` 开头，内容为虚构占位，不得放真实简历；记录中的关联路径指向该文件。

---

## 2. 验证查询（对应 SKILL.md Step 3）

```sql
SELECT * FROM {table} WHERE id LIKE '{前缀}-%' ORDER BY created_at DESC LIMIT 10;
SELECT COUNT(*) FROM {table} WHERE id LIKE '{前缀}-%';  -- 断言记录数与预期一致
```

文件与记录一致性验证：查询记录中的关联路径，并确认 file 目录下对应文件存在（对应 B-05：不得有记录无文件或有文件无记录）。

---

## 3. 清数语法（对应 SKILL.md Step 4，幂等、反序）

SQLite（精确匹配前缀，可重复执行；先子表后主表）：

```sql
DELETE FROM {子表} WHERE id LIKE '{前缀}-%';
DELETE FROM {主表} WHERE id LIKE '{前缀}-%';
```

文件目录：删除 file 目录下以 `{前缀}-` 开头的占位文件，随后复核记录与文件均已清空。
