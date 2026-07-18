# Local Model Setup / 本地模型配置

## 中文

本项目通过 `LOCAL_MODEL_*` 调用任何兼容 OpenAI Chat Completions 的本地服务。模型服务由用户自行安装、加载和维护；本仓库不下载模型权重、不修改模型服务配置，也不附带账号或密钥。

1. 复制配置模板：

   ```bash
   cp .env.example .env
   ```

2. 模板默认 `LOCAL_MODEL_ENABLED=false`，所以不配置模型也能使用 deterministic fallback。配置好本机实际地址、模型 ID 和必要凭据后，再将其改为 `LOCAL_MODEL_ENABLED=true`。`LOCAL_MODEL_API_KEY` 仅在服务要求鉴权时填写；否则保持空白。本地模型不是强制依赖；启用后可获得更丰富、更贴合需求的生成内容。

3. 运行检查：

   ```bash
   ./scripts/check-environment.sh
   ```

环境检查不会发送生成请求。端点不可用、模型 ID 未填或 `.env` 不存在时，它会提示 fallback 仍可用，而不是改写你的配置。

| 服务 | 常见基础地址示例 | 说明 |
| --- | --- | --- |
| OpenWebUI | `http://127.0.0.1:8080/api` | 可使用服务暴露的模型别名。 |
| Ollama | `http://127.0.0.1:11434/v1` | 启用 OpenAI-compatible API 后填入实际模型名。 |
| LM Studio | `http://127.0.0.1:1234/v1` | 先加载模型并启动 Local Server。 |
| MLX server | `http://127.0.0.1:8000/v1` | 端口以启动参数为准。 |
| llama.cpp server | `http://127.0.0.1:8080/v1` | 避免与其他服务冲突。 |
| vLLM | `http://127.0.0.1:8000/v1` | 模型 ID 应等于 served model name。 |

这些地址仅为示例。Qwen 是经过测试的示例模型，不是必需条件，也不会触发业务专用分支。

## English

The project calls any OpenAI Chat Completions-compatible local service through `LOCAL_MODEL_*`. You install, load, and operate the model service yourself. This repository does not download weights, modify provider configuration, or bundle accounts or credentials.

1. Copy the template:

   ```bash
   cp .env.example .env
   ```

2. The template defaults to `LOCAL_MODEL_ENABLED=false`, so deterministic fallback remains available before a model is configured. After setting a real local endpoint, model ID, and any required credential, change it to `LOCAL_MODEL_ENABLED=true`. A local model is optional, but it produces richer content that is more closely tailored to the request. Leave `LOCAL_MODEL_API_KEY` blank unless the service requires authentication.

3. Run the non-generating check:

   ```bash
   ./scripts/check-environment.sh
   ```

The check does not send a completion request. A missing endpoint, model ID, or `.env` only reports that fallback remains available; it never rewrites your configuration.

The provider table above applies equally to OpenWebUI, Ollama, LM Studio, MLX server, llama.cpp server, vLLM, and other compatible Chat Completions services. URLs are examples, not product defaults. Qwen is a tested example, not a required dependency or a model-specific product branch.
