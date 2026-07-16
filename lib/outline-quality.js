const CONTENT_THRESHOLD = 0.72;
const PROMPT_THRESHOLD = 0.8;

export function textSimilarity(left, right) {
  const a = bigrams(normalize(left));
  const b = bigrams(normalize(right));
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter(item => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function analyzeOutlineQuality(slides) {
  const issues = [];
  for (let index = 1; index < slides.length; index += 1) {
    const previous = slides[index - 1];
    const current = slides[index];
    if (normalize(previous.title) === normalize(current.title)) {
      issues.push({ type: "duplicate-title", index: current.index });
    }
    if (textSimilarity(previous.content, current.content) > CONTENT_THRESHOLD) {
      issues.push({ type: "similar-content", index: current.index });
    }
    if (sharedSentences(previous.content, current.content).length) {
      issues.push({ type: "duplicate-sentence", index: current.index });
    }
    if (
      (previous._visualKind && current._visualKind && previous._visualKind === current._visualKind)
      || normalize(previous.visual_suggestion) === normalize(current.visual_suggestion)
    ) {
      issues.push({ type: "duplicate-visual", index: current.index });
    }
    if (textSimilarity(previous.image_prompt, current.image_prompt) > PROMPT_THRESHOLD) {
      issues.push({ type: "similar-prompt", index: current.index });
    }
  }
  return issues;
}

export function analyzeTitleQuality(presentationTitle, coverTitle) {
  const issues = [];
  const parts = String(presentationTitle || "").split(/[｜|]/).map(item => item.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const left = normalizeTitlePart(parts[0]);
    const right = normalizeTitlePart(parts.at(-1));
    if (left === right || textSimilarity(left, right) > 0.65) {
      issues.push({ type: "repetitive-presentation-title" });
    }
  }
  if (/通用方案|客户画像分析\s*[：:]\s*客户画像分析/.test(`${presentationTitle} ${coverTitle}`)) {
    issues.push({ type: "low-quality-title" });
  }
  const coverParts = String(coverTitle || "").split(/[：:｜|]/).map(item => normalizeTitlePart(item)).filter(Boolean);
  if (coverParts.length >= 2 && (
    coverParts[0] === coverParts.at(-1)
    || textSimilarity(coverParts[0], coverParts.at(-1)) > 0.7
  )) {
    issues.push({ type: "repetitive-cover-title" });
  }
  return issues;
}

export function applyQualityGuard(drafts, buildVisualPair) {
  const repaired = drafts.map(slide => ({ ...slide }));

  for (let index = 1; index < repaired.length; index += 1) {
    const previous = repaired[index - 1];
    const current = repaired[index];

    if (normalize(previous.title) === normalize(current.title)) {
      current.title = current._alternateTitle || `${current.title}：专项分析`;
    }

    if (
      textSimilarity(previous.content, current.content) > CONTENT_THRESHOLD
      || sharedSentences(previous.content, current.content).length
    ) {
      current.content = current._alternateContent;
    }

    if (
      previous._visualKind === current._visualKind
      || normalize(previous.visual_suggestion) === normalize(current.visual_suggestion)
      || textSimilarity(previous.image_prompt, current.image_prompt) > PROMPT_THRESHOLD
    ) {
      const alternative = current._visualAlternatives.find(item => item.kind !== previous._visualKind);
      if (alternative) {
        Object.assign(current, buildVisualPair(alternative, current));
        current._visualKind = alternative.kind;
      }
    }
  }

  return repaired.map(stripInternalFields);
}

export function assertOutlineQuality(slides) {
  const issues = analyzeOutlineQuality(slides);
  if (issues.length) {
    const summary = issues.map(issue => `${issue.type}@${issue.index}`).join(", ");
    throw new Error(`生成结果重复度检查失败：${summary}`);
  }
}

function sharedSentences(left, right) {
  const a = new Set(splitSentences(left));
  return splitSentences(right).filter(sentence => sentence.length >= 10 && a.has(sentence));
}

function splitSentences(value) {
  return String(value || "")
    .split(/[\n。！？；]+/)
    .map(normalize)
    .filter(Boolean);
}

function bigrams(value) {
  const output = new Set();
  if (value.length < 2) {
    if (value) output.add(value);
    return output;
  }
  for (let index = 0; index < value.length - 1; index += 1) {
    output.add(value.slice(index, index + 2));
  }
  return output;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

function normalizeTitlePart(value) {
  return normalize(value)
    .replace(/ppt|演示|方案|分析|汇报|报告/g, "")
    .trim();
}

function stripInternalFields(slide) {
  return {
    index: slide.index,
    title: slide.title,
    content: slide.content,
    visual_suggestion: slide.visual_suggestion,
    image_prompt: slide.image_prompt
  };
}
