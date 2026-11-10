# 变更记录 — 简历信息收集（Backend，HR_PR-1）

> 每个任务完成后追加（append 语义）。修改文件清单只记在这里。

## Task-1.1：工程初始化（uv、pytest、ruff、.gitignore、测试基座）

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/pyproject.toml | 新增 | uv 工程清单，依赖 == 精确版本，requires-python >=3.11,<3.12，pytest/ruff 配置 |
| codes/hr-collection-agent-backend/uv.lock | 新增 | uv lock 生成（公共 PyPI，无私有索引） |
| codes/hr-collection-agent-backend/.gitignore | 新增 | data/、file/、.env、.venv/、__pycache__/、.pytest_cache/ 等 |
| codes/hr-collection-agent-backend/.env.example | 新增 | 仅占位符 |
| codes/hr-collection-agent-backend/src/app/**/__init__.py | 新增 | api、services、repositories、clients、schemas、core 包骨架 |
| codes/hr-collection-agent-backend/tests/conftest.py | 新增 | 禁网 autouse 夹具、data_dir/file_dir 夹具 |
| codes/hr-collection-agent-backend/tests/helpers.py | 新增 | 合成 PDF/JPEG/PNG 魔数字节 |
| codes/hr-collection-agent-backend/tests/test_scaffold.py | 新增 | 7 个基座冒烟用例 |

### 偏差说明
AGENTS.md 要求安装用 uv 默认索引；.gitignore 放在 codes/hr-collection-agent-backend/ 内（后端代码目录）。pyyaml、pytest-cov 已按 DL 采纳加入开发依赖。按 uv 惯例 [tool.uv] package=false，以 pytest pythonpath=src 导入 app。安全评估：新依赖均为主流维护中的包；uvx pip-audit 对锁定版本报告 No known vulnerabilities found。

### 遗留风险
FakeClock、FakeParserClient 按任务计划分别在 1.2、1.8 补入。

---

## Task-1.2：core：配置、时钟、ID 与令牌工具

**完成时间**：2026-11-10
**实现者**：Yin Yang（backend）

### 变更文件
| 文件路径 | 操作 | 说明 |
|---------|------|------|
| codes/hr-collection-agent-backend/src/app/core/config.py | 新增 | Settings（pydantic-settings，SecretStr 密钥，目录解析，正数校验） |
| codes/hr-collection-agent-backend/src/app/core/clock.py | 新增 | Clock 协议、SystemClock、format_utc/parse_utc（YYYY-MM-DDTHH:MM:SSZ） |
| codes/hr-collection-agent-backend/src/app/core/ids.py | 新增 | IdGenerator、UuidGenerator、generate_token、hash_token |
| codes/hr-collection-agent-backend/tests/fakes.py | 新增 | FakeClock、SequentialIdGenerator |
| codes/hr-collection-agent-backend/tests/core/test_config.py | 新增 | 配置默认值/覆盖/密钥不泄露/非法值 |
| codes/hr-collection-agent-backend/tests/core/test_clock_ids.py | 新增 | 时钟、ID、令牌与哈希（含 SHA-256 已知向量） |

### 偏差说明
按设计实现。补充：deepseek_base_url 默认值取 DeepSeek 公开地址 https://api.deepseek.com（非密钥，可由环境变量覆盖），design 未指定默认值；FakeClock 放在 tests/fakes.py 而非 conftest.py（便于导入）。

### 遗留风险
base_url 默认值与实际接入地址需在任务 1.8 spike 时核实。

---

