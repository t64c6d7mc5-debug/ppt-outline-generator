import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";

test("v2.3.15 launcher exits promptly when another launcher owns the lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-launcher-lock-"));
  const launcher = path.join(root, "launch-fixture.zsh");
  const lockDir = path.join(root, "lock");
  await writeFile(launcher, [
    "#!/bin/zsh",
    "set -euo pipefail",
    "LOCK_DIR=\"${LOCK_DIR_OVERRIDE:?LOCK_DIR_OVERRIDE is required}\"",
    "if ! mkdir \"$LOCK_DIR\" 2>/dev/null; then",
    "  echo '已有启动实例正在执行，当前实例退出，不再等待。' >&2",
    "  exit 1",
    "fi",
    "trap 'rmdir \"$LOCK_DIR\" 2>/dev/null || true' EXIT",
    "exit 0",
    ""
  ].join("\n"), "utf8");
  await mkdir(lockDir);
  await writeFile(path.join(lockDir, "pid"), `${process.pid}\n`, "utf8");
  const started = Date.now();
  try {
    const result = spawnSync("/bin/zsh", [launcher], {
      env: {
        ...process.env,
        LOCK_DIR_OVERRIDE: lockDir,
        LOCK_WAIT_SECONDS_OVERRIDE: "120",
        OPEN_CMD_OVERRIDE: "/usr/bin/true",
        PPT_PORT_OVERRIDE: "3199",
        PPT_URL_OVERRIDE: "http://127.0.0.1:3199"
      },
      encoding: "utf8",
      timeout: 2000
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1500, `launcher waited ${elapsed}ms for an active lock`);
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.match(`${result.stdout}${result.stderr}`, /当前实例退出，不再等待/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v2.3.15 launcher rejects a branded HTTP 200 service with the legacy runtime contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-launcher-runtime-"));
  const lockDir = path.join(root, "lock");
  const launcher = path.join(os.homedir(), "Library/Application Support/PPT脚本生成器/launch-v2.3.15.zsh");
  const fake = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        app_version: "v2.3.15-rc2",
        pipeline: "legacy",
        response_contract_version: 1
      }));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("PPT Outline Generator v2.3.15");
  });
  await new Promise(resolve => fake.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${fake.address().port}`;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("/bin/zsh", [launcher], {
        env: {
          ...process.env,
          LOCK_DIR_OVERRIDE: lockDir,
          OPEN_CMD_OVERRIDE: "/usr/bin/true",
          PPT_PORT_OVERRIDE: String(fake.address().port),
          PPT_URL_OVERRIDE: url,
          MODEL_HEALTH_URL_OVERRIDE: `${url}/model-health`,
          OPENWEBUI_URL_OVERRIDE: `${url}/openwebui-health`
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { output += chunk; });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("launcher did not reject legacy runtime promptly"));
      }, 5000);
      child.on("exit", status => {
        clearTimeout(timer);
        resolve({ status, output });
      });
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /result-first|运行时版本|响应契约/);
  } finally {
    await new Promise(resolve => fake.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
