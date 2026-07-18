# Quick Start / 快速开始

## 中文

### 1. 下载和解压

使用 GitHub Release 压缩包、**Code → Download ZIP** 或 Git：

```bash
git clone https://github.com/t64c6d7mc5-debug/ppt-outline-generator.git
cd ppt-outline-generator
```

所有命令都应在项目根目录执行。

### 2. 安装依赖

确认 Node.js 版本不低于 22，然后：

```bash
node --version
npm install
```

### 3. 配置应用与本地模型

```bash
cp .env.example .env
```

模板默认关闭本地模型，保证未配置模型也能启动并使用 deterministic fallback。编辑 `.env` 时不要将它提交到仓库：

```env
PORT=3100
LOCAL_MODEL_ENABLED=false
LOCAL_MODEL_PROVIDER=openai-compatible
LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/api
LOCAL_MODEL_API_KEY=
LOCAL_MODEL_ID=
LOCAL_MODEL_TIMEOUT_MS=120000
LOCAL_MODEL_SUPPORTS_JSON_SCHEMA=true
LOCAL_MODEL_MAX_REPAIR_ATTEMPTS=1
```

`LOCAL_MODEL_BASE_URL` 和端口必须改为你的运行时实际地址。上述地址是 OpenWebUI 示例，不是产品默认绑定；如果运行时不支持 JSON Schema，请将该项设为 `false`。配置好 endpoint、模型 ID 和必要凭据后，再把 `LOCAL_MODEL_ENABLED=true`。本地模型不是强制依赖；启用后可获得更丰富、更贴合需求的生成内容。

### 4. Provider 配置示例

| 运行时 | 基础地址示例 | 需注意 |
| --- | --- | --- |
| OpenWebUI | `http://127.0.0.1:8080/api` | 使用 OpenWebUI 暴露的模型别名和凭据。 |
| Ollama | `http://127.0.0.1:11434/v1` | 配置实际模型名，例如运行时模型列表显示的名称。 |
| LM Studio | `http://127.0.0.1:1234/v1` | 先加载模型并启动 Local Server。 |
| MLX server | `http://127.0.0.1:8000/v1` | 使用启动命令实际选择的端口。 |
| llama.cpp server | `http://127.0.0.1:8080/v1` | 确保端口没有被 OpenWebUI 或其他服务占用。 |
| vLLM | `http://127.0.0.1:8000/v1` | `LOCAL_MODEL_ID` 必须与 served model name 一致。 |

Qwen 只是已测试示例。任何兼容 Chat Completions 的本地模型都可以接入，但输出质量会因模型而异。

### 5. 检查服务并启动

```bash
./scripts/check-environment.sh
./scripts/start.sh
```

打开终端输出的应用地址。示例 `.env` 使用 `http://127.0.0.1:3100`；macOS 可双击 `scripts/start-macos.command`。

### 6. 生成与判读结果

1. 选择简易模式或专业模式。
2. 填写明确的主题、用途、受众、页数和材料边界。
3. 专业模式依次生成追问、需求摘要和最终脚本。
4. 检查结果状态：
   - `production_ready`：达到生产分级，仍建议最终人工核对。
   - `review_required`：已返回完整结果，根据提示复核。
   - `fallback`：已返回安全兜底脚本，不要把它当作模型生成。
   - `blocked`：系统无法形成安全可展示的结果，根据简洁错误修复请求或服务。
5. 复制客户版或制作版，并在制作前复核待确认事实。

### 7. 排障

- 缺少 `.env`：重新从 `.env.example` 复制。
- 连接失败：确认 provider 已启动，检查 base URL 和端口。
- 404 / Model not found：使用本地服务实际显示的模型 ID。
- 401 / 403：核对 API key；无鉴权的本地服务保持空值。
- JSON Schema 报错：将 `LOCAL_MODEL_SUPPORTS_JSON_SCHEMA=false`。
- 超时：确认模型已完全加载，再合理增加 `LOCAL_MODEL_TIMEOUT_MS`。
- 出现 fallback：先使用已返回的脚本；再从 `source_summary` 核对模型是否尝试、是否采用。

### 8. 开源发布前检查

```bash
npm test
npm run check
bash scripts/prepublish-check.sh
```

这些命令需要在实际发布前由维护者执行并审阅完整输出。

---

## English

### 1. Download and extract

Use a GitHub Release archive, **Code → Download ZIP**, or Git:

```bash
git clone https://github.com/t64c6d7mc5-debug/ppt-outline-generator.git
cd ppt-outline-generator
```

Run all remaining commands from the project root.

### 2. Install

```bash
node --version
npm install
```

Node.js 22 or newer is required.

### 3. Configure

```bash
cp .env.example .env
```

The template uses `LOCAL_MODEL_ENABLED=false` by default, so an unconfigured installation can use deterministic fallback. After setting a real endpoint, model ID, and any required credential, change it to `LOCAL_MODEL_ENABLED=true`. A local model is optional but produces richer content that is more closely tailored to the request. Replace the example base URL and model ID with values reported by your own OpenAI-compatible runtime. Leave `LOCAL_MODEL_API_KEY` empty when authentication is not required, and do not commit `.env`.

Common examples are OpenWebUI (`/api`), Ollama (`/v1`), LM Studio (`/v1`), MLX server (`/v1`), llama.cpp server (`/v1`), and vLLM (`/v1`). Ports vary; the table above is illustrative only.

### 4. Check and start

```bash
./scripts/check-environment.sh
./scripts/start.sh
```

Open the address printed by the server. The template uses `http://127.0.0.1:3100`; macOS users can double-click `scripts/start-macos.command`.

### 5. Generate and review

Use Simple mode for a fast editable script or Professional mode for questions, a requirements summary, and the full script. All three successful states return the customer and production versions:

- `production_ready`: meets the production classification.
- `review_required`: complete result with review warnings.
- `fallback`: deterministic safe result; it is not model-generated.

Only `blocked` has no safe displayable result. Human review is recommended for every state.

### 6. Troubleshoot

- Verify the server is running and the base URL is correct.
- Use the exact model ID exposed by the runtime.
- Leave the API key empty unless authentication is enabled.
- Disable JSON Schema support when the runtime rejects `response_format`.
- Increase the timeout only after confirming the model is fully loaded.
- Treat `fallback` as a usable, conservative script and inspect `source_summary` before claiming the model was used.

### 7. Maintainer verification

```bash
npm test
npm run check
bash scripts/prepublish-check.sh
```

Maintainers must run these commands and inspect the full output before publishing.
