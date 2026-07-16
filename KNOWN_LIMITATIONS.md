# Known Limitations

`v2.3.15-rc2` is a local release candidate for human-reviewed PPT script work.

- The result-first policy is designed to return an editable result for a normal request with a recognizable topic and purpose. It does not promise equal quality from every local model.
- Model instruction-following, JSON stability, vocabulary, coverage, and reasoning quality vary by model, quantization, context size, runtime, and configuration.
- `production_ready` is still a machine classification. Human review remains recommended for every result.
- `review_required` is a complete, editable result with quality warnings; it is not a generation failure.
- `fallback` is built deterministically from user-provided requirements. It is not model-generated and may use conservative placeholders such as "to be confirmed."
- A request is `blocked` only when a safe, non-empty, structurally valid result cannot be recovered from either the model candidate or deterministic fallback.
- The application produces PPT scripts and production guidance, not a rendered `.pptx` or final visual slide deck.
- It does not provide cloud deployment, accounts, multi-user collaboration, or automatic model downloads.
- Structured-output repair is bounded to zero or one attempt. The application does not retry indefinitely or call the model once per atomic requirement.
- OpenWebUI, Ollama, LM Studio, MLX server, llama.cpp server, vLLM, and other compatible runtimes can expose different API details. Verify the endpoint, model ID, authentication, and JSON Schema support in your own runtime.
- Unsupported facts, numbers, people, technical specifications, commercial relationships, and claimed outcomes are removed or marked for confirmation when possible. If residual safety, forbidden-content, secret, or private-data leakage cannot be removed, the request remains blocked.
- Local-first processing does not automatically guarantee privacy. Runtime logs, browser extensions, operating-system accounts, and local service configuration remain the user's responsibility.
- Public screenshots and demo assets must be sanitized before publication.
