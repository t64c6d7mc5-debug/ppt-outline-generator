# Result Status / 结果状态

## 中文

Result-First Pipeline 会先尽力构建安全、可编辑的脚本，再对其质量分级。质量问题不会单独隐藏已经可展示的结果。

| 状态 | HTTP | 含义 | UI 行为 |
| --- | --- | --- | --- |
| `production_ready` | 200 | 模型候选安全、完整，达到生产分级。 | 展示客户版与制作版，可直接进入制作或最终人工复核。 |
| `review_required` | 200 | 结果安全、完整，但存在标题、覆盖、相关性、表达或模型保留等复核项。 | 展示双版本与脱敏复核提醒。 |
| `fallback` | 200 | 模型不可用、超时、空响应、非法输出或候选无法安全采用；系统根据表单生成确定性安全脚本。 | 展示双版本，明确标记为安全兜底版本。它不是模型生成。 |
| `blocked` | 422 | 请求不可识别，或模型与 fallback 都无法形成无泄漏、无禁止内容、非空且结构完整的结果。 | 只显示简洁安全错误。 |

`score`、普通语义覆盖不足、标题清洁、planner 被拒绝、provenance/lineage/retention 不完整、`model_used=false` 或 `fallback_used=true` 都不能单独导致阻断。

`source_summary` 如实说明模型是否尝试、是否实际采用、模型内容是否进入最终脚本、是否使用确定性补齐以及是否为 fallback。确定性内容不会伪装为模型内容。

## English

The Result-First Pipeline tries to construct a safe, editable script before classifying quality. A quality concern does not independently hide an otherwise displayable result.

| Status | HTTP | Meaning | UI behavior |
| --- | --- | --- | --- |
| `production_ready` | 200 | The model candidate is safe, complete, and meets the production classification. | Both versions are shown and can proceed to production or final human review. |
| `review_required` | 200 | The result is safe and complete but has title, coverage, relevance, wording, or model-retention review items. | Both versions and redacted review guidance remain visible. |
| `fallback` | 200 | The model is unavailable, timed out, empty, invalid, or unusable; a deterministic safe script was built from the form. | Both versions are shown and clearly labeled as fallback, not model-generated content. |
| `blocked` | 422 | The request is unrecoverable, or neither the model nor fallback can produce non-empty, structurally valid output without residual leaks or forbidden content. | Only a concise safe error is shown. |

`score`, ordinary semantic misses, title cleanup, planner rejection, incomplete provenance/lineage/retention, `model_used=false`, and `fallback_used=true` never independently block a safe result.

`source_summary` truthfully distinguishes a model attempt, model use, retained model content, deterministic completion, and fallback. Deterministic content is never labeled as model content.
