# hr-info-collection

HR 人力信息收集系统：用户在 Web 对话中上传简历（PDF、照片），由大模型（DeepSeek `deepseek-flash`）解析，再与用户逐项对话校对，确认后把结构化信息和原始文件保存到本地。

- 后端：`codes/hr-collection-agent-backend/`（Python 3.11、FastAPI、SQLite）
- 前端：`codes/hr-collection-agent-frontend/`（React 18、Vite、Ant Design）
- 文档：`01-requirements/`、`backend-docs/`、`frontend-docs/`；项目约定见 `AGENTS.md`

## 快速开始

先在仓库根目录按 `local_profile.yaml.example` 创建 `local_profile.yaml`（仅 AI 工作流用，不影响运行）。

```bash
# 后端（需要 uv）
cd codes/hr-collection-agent-backend
uv sync --frozen
# 配置 LLM key，见下一节
set -a; . ./.env; set +a
uv run uvicorn --app-dir src app.main:create_app --factory --workers 1 --host 127.0.0.1 --port 8000

# 前端（另开终端，需要 Node 24+）
cd codes/hr-collection-agent-frontend
npm ci
npm run dev
```

后端必须只监听 `127.0.0.1`，并且 `--workers 1`（硬性要求）。前端开发服务器会把请求代理到 `http://127.0.0.1:8000`。

## 配置 LLM 调用 key

简历解析和对话校对依赖 DeepSeek。key 只放在本机环境变量或未入库的 `.env` 文件里，不要写进代码、日志、文档或提交记录。

1. 复制模板：

   ```bash
   cd codes/hr-collection-agent-backend
   cp .env.example .env
   ```

2. 编辑 `.env`，至少填写下面两项：

   ```dotenv
   DEEPSEEK_API_KEY=你的 DeepSeek API key
   DEEPSEEK_BASE_URL=https://api.deepseek.com
   ```

3. 启动前把 `.env` 加载进环境（见上面的启动命令里的 `set -a; . ./.env; set +a`）。后端也会自动读取当前目录下的 `.env`。

配置项说明：

| 变量 | 必填 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API key。不填时服务仍能启动，但解析和对话会返回“模型服务不可用” |
| `DEEPSEEK_BASE_URL` | 是 | 只允许 `https://api.deepseek.com`（可带路径前缀）。填模板里的占位符或其他地址，启动会校验失败 |
| `DEEPSEEK_MODEL` | 否 | 固定为 `deepseek-flash`，填其他值会被拒绝 |
| `MODEL_TIMEOUT_SECONDS` | 否 | 单次模型调用超时，默认 60 秒 |
| `DATA_DIR` / `FILE_DIR` | 否 | SQLite 与原始简历文件的存放目录，默认 `data` / `file`，相对路径按启动目录解析 |
| `COOKIE_SECURE` | 否 | 本机 HTTP 访问保持 `false`；改为 HTTPS 部署时才设为 `true` |

注意事项：

- `.env` 已被 `.gitignore` 忽略，**不要提交，也不要把含 key 的 `.env` 打包给他人**；只分享 `.env.example`。
- 简历内容会发送到 `https://api.deepseek.com` 解析，请只在获得授权的情况下使用真实简历。
- 怀疑 key 泄露时，到 DeepSeek 控制台轮换，再更新本机 `.env`。
- 自动化测试不会调用真实模型（测试期禁网）；只有 `scripts/self_test_live.py` 会用真实 key 做演练，仅限本机、合成数据。

## 测试

```bash
cd codes/hr-collection-agent-backend && uv run pytest && uv run ruff check
cd codes/hr-collection-agent-frontend && npm run lint && npm test -- --run && npm run build
```
