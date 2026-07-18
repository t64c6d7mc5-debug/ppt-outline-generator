import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portableLauncher = path.join(projectRoot, "test/fixtures/v2315-portable-launcher.zsh");

async function reservePort() {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const { port } = reservation.address();
  await new Promise(resolve => reservation.close(resolve));
  return port;
}

function runLauncher(env, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/zsh", [portableLauncher], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("portable launcher did not exit within the test timeout"));
    }, timeout);
    child.on("exit", status => {
      clearTimeout(timer);
      resolve({ status, output });
    });
  });
}

async function createControlledServer(root, healthBody, extraSource = "") {
  const script = path.join(root, "controlled-server.cjs");
  await writeFile(script, [
    "const http = require('node:http');",
    "const port = Number(process.env.PORT);",
    `const health = ${JSON.stringify(healthBody)};`,
    "http.createServer((request, response) => {",
    "  if (request.url === '/api/health') { response.writeHead(200, {'Content-Type':'application/json'}); response.end(health); return; }",
    "  response.writeHead(404); response.end('not found');",
    `}).listen(port, '127.0.0.1', () => console.error('CONTROLLED_SERVER_READY'));`,
    extraSource
  ].join("\n"), "utf8");
  return script;
}

async function createOpenCommand(root) {
  const marker = path.join(root, "opened-url.txt");
  const command = path.join(root, "open-fixture.zsh");
  await writeFile(command, `#!/bin/zsh\nprintf '%s\\n' "$1" > "${marker}"\n`, "utf8");
  await chmod(command, 0o755);
  return { command, marker };
}

test("portable launcher accepts a matching runtime through the API health endpoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-portable-launcher-ok-"));
  const port = await reservePort();
  const packageInfo = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const serverScript = await createControlledServer(root, JSON.stringify({
    status: "ok",
    app_version: `v${packageInfo.version}`,
    pipeline: "result-first",
    response_contract_version: 2
  }));
  const { command, marker } = await createOpenCommand(root);
  const url = `http://127.0.0.1:${port}`;
  try {
    const result = await runLauncher({
      PPT_PORT_OVERRIDE: String(port),
      PPT_URL_OVERRIDE: url,
      PPT_HEALTH_URL_OVERRIDE: `${url}/api/health`,
      PPT_SERVER_SCRIPT_OVERRIDE: serverScript,
      PPT_EXPECTED_APP_VERSION_OVERRIDE: `v${packageInfo.version}`,
      PPT_LOG_OVERRIDE: path.join(root, "launcher.log"),
      OPEN_CMD_OVERRIDE: command
    });
    assert.equal(result.status, 0, result.output);
    assert.equal((await readFile(marker, "utf8")).trim(), url);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("portable launcher diagnoses a runtime mismatch, tails the log, and preserves external services", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-portable-launcher-mismatch-"));
  const port = await reservePort();
  const dependency = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("{}" );
  });
  await new Promise(resolve => dependency.listen(0, "127.0.0.1", resolve));
  const dependencyUrl = `http://127.0.0.1:${dependency.address().port}`;
  const serverScript = await createControlledServer(root, JSON.stringify({
    status: "ok",
    app_version: "v0.0.0-legacy",
    pipeline: "legacy",
    response_contract_version: 1
  }), "console.error('CONTROLLED_MISMATCH_LOG');");
  const url = `http://127.0.0.1:${port}`;
  try {
    const result = await runLauncher({
      PPT_PORT_OVERRIDE: String(port),
      PPT_URL_OVERRIDE: url,
      PPT_HEALTH_URL_OVERRIDE: `${url}/api/health`,
      PPT_SERVER_SCRIPT_OVERRIDE: serverScript,
      PPT_EXPECTED_APP_VERSION_OVERRIDE: "v0.0.0-current",
      PPT_LOG_OVERRIDE: path.join(root, "launcher.log"),
      PPT_TIMEOUT_SECONDS_OVERRIDE: "2",
      PPT_POLL_INTERVAL_SECONDS_OVERRIDE: "1",
      MODEL_HEALTH_URL_OVERRIDE: `${dependencyUrl}/model-health`,
      OPENWEBUI_URL_OVERRIDE: `${dependencyUrl}/openwebui-health`,
      OPEN_CMD_OVERRIDE: "/usr/bin/true"
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /运行时版本不匹配：期望 v0\.0\.0-current，实际 v0\.0\.0-legacy/);
    assert.match(result.output, /CONTROLLED_MISMATCH_LOG/);
    const dependencyResponse = await fetch(`${dependencyUrl}/still-healthy`);
    assert.equal(dependencyResponse.status, 200);
  } finally {
    await new Promise(resolve => dependency.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("portable launcher reports an early child failure with the log tail", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-portable-launcher-failure-"));
  const port = await reservePort();
  const serverScript = path.join(root, "failing-server.cjs");
  await writeFile(serverScript, "console.error('CONTROLLED_EARLY_FAILURE'); process.exit(23);\n", "utf8");
  const url = `http://127.0.0.1:${port}`;
  try {
    const result = await runLauncher({
      PPT_PORT_OVERRIDE: String(port),
      PPT_URL_OVERRIDE: url,
      PPT_HEALTH_URL_OVERRIDE: `${url}/api/health`,
      PPT_SERVER_SCRIPT_OVERRIDE: serverScript,
      PPT_EXPECTED_APP_VERSION_OVERRIDE: "v0.0.0-current",
      PPT_LOG_OVERRIDE: path.join(root, "launcher.log"),
      OPEN_CMD_OVERRIDE: "/usr/bin/true"
    });
    assert.equal(result.status, 1);
    assert.match(result.output, /PPT 服务进程已提前退出/);
    assert.match(result.output, /CONTROLLED_EARLY_FAILURE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
