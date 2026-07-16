import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createAppServer } from "../server.js";

const EXPECTED_RUNTIME = {
  status: "ok",
  app_version: "v2.3.15-rc2",
  pipeline: "result-first",
  response_contract_version: 2
};

test("runtime health endpoint identifies the result-first response contract", async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), EXPECTED_RUNTIME);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("the HTML pins main.js to response contract v2 while static responses remain no-store", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /js\/main\.js\?v=2\.3\.15-rc2-result-first-2/);

  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/js/main.js?v=2.3.15-rc2-result-first-2`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test("controlled runner verifies the same runtime contract before its single outline request", async () => {
  const source = await readFile(new URL("../真实回归/tools/v2315-controlled-single-request.mjs", import.meta.url), "utf8");
  assert.match(source, /\/api\/health/);
  assert.match(source, /pipeline\s*!==\s*["']result-first["']/);
  assert.match(source, /response_contract_version\s*!==\s*2/);
});
