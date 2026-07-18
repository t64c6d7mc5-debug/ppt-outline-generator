import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readPublicFile(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("public onboarding defaults to deterministic fallback until a model is configured", async () => {
  const [environment, chineseReadme, englishReadme, quickStart, localModelSetup] = await Promise.all([
    readPublicFile(".env.example"),
    readPublicFile("README.md"),
    readPublicFile("README_EN.md"),
    readPublicFile("docs/QUICK_START.md"),
    readPublicFile("docs/LOCAL_MODEL_SETUP.md")
  ]);

  assert.match(environment, /^LOCAL_MODEL_ENABLED=false$/m);
  for (const document of [chineseReadme, englishReadme, quickStart, localModelSetup]) {
    assert.match(document, /LOCAL_MODEL_ENABLED=false/);
    assert.match(document, /LOCAL_MODEL_ENABLED=true/);
    assert.match(document, /fallback/i);
  }
});

test("public clone instructions, examples, templates, and npm metadata are publishable", async () => {
  const [chineseReadme, englishReadme, quickStart, packageJson] = await Promise.all([
    readPublicFile("README.md"),
    readPublicFile("README_EN.md"),
    readPublicFile("docs/QUICK_START.md"),
    readPublicFile("package.json")
  ]);
  const publicUrl = "https://github.com/t64c6d7mc5-debug/ppt-outline-generator.git";
  for (const document of [chineseReadme, englishReadme, quickStart]) {
    assert.match(document, new RegExp(publicUrl.replaceAll(".", "\\.")));
    assert.match(document, /cd ppt-outline-generator/);
    assert.doesNotMatch(document, /<repository-url>|local-llm-ppt-script-generator/);
  }

  const metadata = JSON.parse(packageJson);
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.repository?.url, `git+${publicUrl}`);
  assert.equal(metadata.homepage, "https://github.com/t64c6d7mc5-debug/ppt-outline-generator#readme");
  assert.match(metadata.scripts.check, /if \[ -d 真实回归\/tools \]/);

  for (const relativePath of [
    "examples/simple-mode-input.json",
    "examples/professional-mode-input.json",
    "examples/customer-version-example.md",
    "examples/production-version-example.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md"
  ]) {
    const content = await readPublicFile(relativePath);
    assert.ok(content.length > 0, `${relativePath} must be non-empty`);
  }
});

test("public test suite keeps private controlled-evidence tools optional", async () => {
  const privateToolConsumers = await Promise.all([
    readPublicFile("test/v2315-regression-harness.test.js"),
    readPublicFile("test/runtime-version-contract.test.js")
  ]);
  for (const testSource of privateToolConsumers) {
    assert.match(testSource, /existsSync/);
    assert.match(testSource, /test\.skip/);
    assert.doesNotMatch(testSource, /from "\.\.\/真实回归\/tools/);
  }
});
