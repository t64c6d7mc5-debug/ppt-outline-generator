export const COOPERATION_PATH_STEPS = Object.freeze([
  "初步洽谈",
  "场地考察",
  "资料补充",
  "方案评估",
  "合作确认"
]);

/**
 * Finds a complete path only when every step appears in order inside one
 * caller-defined business-content block. It never combines adjacent blocks.
 */
export function findOrderedPathInSingleBlock(blocks = [], steps = COOPERATION_PATH_STEPS) {
  const expectedSteps = Array.isArray(steps) ? steps.map(step => String(step || "")).filter(Boolean) : [];
  for (const candidate of Array.isArray(blocks) ? blocks : []) {
    const block = String(candidate || "");
    let cursor = -1;
    const ordered = expectedSteps.every(step => {
      const next = block.indexOf(step, cursor + 1);
      if (next < 0) return false;
      cursor = next;
      return true;
    });
    if (ordered) return Object.freeze({ matched: true, matched_block: block, matched_steps: Object.freeze([...expectedSteps]) });
  }
  return Object.freeze({ matched: false, matched_block: "", matched_steps: Object.freeze([]) });
}
