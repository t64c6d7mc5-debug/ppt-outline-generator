#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
This repository does not download or start a model automatically.

Start an OpenAI-compatible local model server using your chosen runtime, then
configure LOCAL_MODEL_BASE_URL and LOCAL_MODEL_ID in .env. OpenWebUI, Ollama,
LM Studio, MLX server, llama.cpp server, and vLLM are all supported examples.

See docs/QUICK_START.md for the supported local configuration contract.
EOF
