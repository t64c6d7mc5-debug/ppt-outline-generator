import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OutlineInputError } from "./lib/generate-outline.js";
import { runResultFirstPipeline } from "./lib/result-first-pipeline.js";
import { LocalModelError, runLocalPlanningProfile } from "./lib/local-model-planner.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024;
export const RUNTIME_INFO = Object.freeze({
  status: "ok",
  app_version: "v2.3.15-rc4",
  pipeline: "result-first",
  response_contract_version: 2
});
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

export function createAppServer({ onOutlineRequest, generateOutlineFn } = {}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/api/health") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return sendJson(response, 405, { error: "Method Not Allowed" }, { Allow: "GET, HEAD" }, request.method);
        }
        return sendJson(response, 200, RUNTIME_INFO, {}, request.method);
      }

      if (url.pathname === "/api/outline") {
        if (request.method !== "POST") {
          return sendJson(response, 405, { error: "Method Not Allowed" }, { Allow: "POST" });
        }
        const input = await readJsonBody(request);
        input.request_id = normalizeRequestId(input.request_id);
        if (typeof onOutlineRequest === "function") await onOutlineRequest(structuredClone(input));
        const outcome = await runResultFirstPipeline(input, generateOutlineFn ? { generateOutlineFn } : {});
        return sendJson(response, outcome.http_status, outcome.response);
      }

      if (url.pathname === "/api/planning-stage") {
        if (request.method !== "POST") return sendJson(response, 405, { error: "Method Not Allowed" }, { Allow: "POST" });
        const input = await readJsonBody(request);
        input.request_id = normalizeRequestId(input.request_id);
        const result = await runLocalPlanningProfile(input);
        return sendJson(response, 200, result);
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return sendJson(response, 405, { error: "Method Not Allowed" });
      }

      return await serveStatic(url.pathname, request.method, response);
    } catch (error) {
      if (error instanceof OutlineInputError || error instanceof SyntaxError) {
        return sendJson(response, 400, { error: error.message });
      }
      if (error instanceof LocalModelError) {
        return sendJson(response, error.httpStatus, { error: error.safeMessage, code: error.code });
      }
      if (error?.code === "BODY_TOO_LARGE") {
        return sendJson(response, 413, { error: "请求内容不能超过 1 MB" });
      }
      console.error(error);
      return sendJson(response, 500, { error: "生成失败，请稍后重试" });
    }
  });
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Body too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

async function serveStatic(pathname, method, response) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, requested);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-store"
    });
    response.end(method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      return sendJson(response, 404, { error: "Not Found" });
    }
    throw error;
  }
}

function sendJson(response, status, payload, extraHeaders = {}, method = "GET") {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(method === "HEAD" ? undefined : body);
}

function normalizeRequestId(value) {
  const text = String(value || "").trim();
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,80}$/.test(text)) return text;
  return `req_${randomUUID()}`;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT) || 3000;
  const packageInfo = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`PPT Outline Generator v${packageInfo.version} running at http://127.0.0.1:${port}`);
  });
}
