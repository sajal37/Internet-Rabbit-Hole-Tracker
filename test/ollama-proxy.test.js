const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");

const {
  createRequestHandler,
  handleServerError,
  startServer,
  startServerIfMain,
  sendJson,
  isAllowedOrigin,
  OLLAMA_URL,
  OLLAMA_MODEL,
} = require("../ollama-proxy");

function createMockReq({
  method = "POST",
  url = "/analyze",
  body = "",
  headers = {},
  remoteAddress = "127.0.0.1",
} = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress };
  req.destroy = () => {
    req.destroyed = true;
  };
  process.nextTick(() => {
    if (body) {
      req.emit("data", body);
    }
    req.emit("end");
  });
  return req;
}

function createMockRes() {
  return {
    headers: {},
    statusCode: null,
    ended: false,
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(status, headers) {
      this.statusCode = status;
      if (headers) {
        Object.assign(this.headers, headers);
      }
    },
    end(data) {
      this.ended = true;
      if (data) {
        this.body += data;
      }
    },
  };
}

test("ollama proxy handles preflight OPTIONS", async () => {
  const handler = createRequestHandler({
    fetchImpl: () => {
      throw new Error("should not fetch");
    },
  });
  const req = createMockReq({ method: "OPTIONS" });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
});

test("ollama proxy allows preflight from allowed origin", async () => {
  const handler = createRequestHandler({ fetchImpl: () => null });
  const req = createMockReq({
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000" },
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
});

test("ollama proxy origin helpers and headers", () => {
  assert.equal(isAllowedOrigin(null), false);
  assert.equal(isAllowedOrigin("chrome-extension://abc"), true);
  assert.equal(isAllowedOrigin("http://localhost:3000"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5000"), true);
  assert.equal(isAllowedOrigin("https://example.com"), false);

  const res = createMockRes();
  sendJson(res, 200, { response: "ok" }, "http://localhost:3000");
  assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(res.headers["Access-Control-Allow-Headers"], "Content-Type");

  const resBlocked = createMockRes();
  sendJson(resBlocked, 200, { response: "ok" }, "https://example.com");
  assert.equal(resBlocked.headers["Access-Control-Allow-Origin"], undefined);
});

test("ollama proxy rejects preflight from disallowed origin", async () => {
  const handler = createRequestHandler({ fetchImpl: () => null });
  const req = createMockReq({
    method: "OPTIONS",
    headers: { origin: "https://example.com" },
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});

test("ollama proxy sets headers on allowed origin post", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ response: " ok " }),
    }),
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "hi" }),
    headers: { origin: "http://localhost:3000" },
  });
  req.destroy = () => {};
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(res.headers["Access-Control-Allow-Headers"], "Content-Type");
});

test("ollama proxy handles payload too large", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({ ok: true, json: async () => ({ response: "" }) }),
  });
  const big = "x".repeat(512 * 1024 + 10);
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: big,
  });
  let destroyed = false;
  req.destroy = () => {
    destroyed = true;
  };
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.equal(destroyed, true);
});

test("ollama proxy rejects oversized multi-chunk body", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({ ok: true, json: async () => ({ response: "" }) }),
  });
  const req = new EventEmitter();
  req.method = "POST";
  req.url = "/analyze";
  req.headers = {};
  let destroyed = false;
  req.destroy = () => {
    destroyed = true;
  };
  const res = createMockRes();
  setImmediate(() => {
    req.emit("data", "x".repeat(512 * 1024));
    req.emit("data", "y");
    req.emit("end");
  });
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.equal(destroyed, true);
});

test("ollama proxy rejects non-analyze requests", async () => {
  const handler = createRequestHandler({
    fetchImpl: () => {
      throw new Error("should not fetch");
    },
  });
  const req = createMockReq({ method: "GET", url: "/other" });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy forwards prompt and trims response", async () => {
  let captured = null;
  const handler = createRequestHandler({
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: " hello  " }),
      };
    },
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "hi" }),
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { response: "hello" });
  assert.equal(captured.url, OLLAMA_URL);
  const payload = JSON.parse(captured.options.body);
  assert.equal(payload.model, OLLAMA_MODEL);
  assert.equal(payload.prompt, "hi");
  assert.equal(payload.stream, false);
});

test("ollama proxy respects requested model override", async () => {
  let capturedModel = null;
  const handler = createRequestHandler({
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body);
      capturedModel = payload.model;
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: "ok" }),
      };
    },
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "hi", model: "llama3:latest" }),
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedModel, "llama3:latest");
});

test("ollama proxy ignores non-string prompt values", async () => {
  let capturedPrompt = null;
  const handler = createRequestHandler({
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body);
      capturedPrompt = payload.prompt;
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: "ok" }),
      };
    },
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: 123 }),
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(capturedPrompt, "");
});

test("ollama proxy rejects oversized prompt", async () => {
  const handler = createRequestHandler({
    fetchImpl: () => {
      throw new Error("should not fetch");
    },
    maxPromptChars: 3,
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "toolong" }),
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy rate limits repeated requests", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ response: "ok" }),
    }),
    rateLimitMax: 1,
    rateLimitWindowMs: 1000,
    rateLimitKeyFn: () => "test-key",
  });
  const req1 = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "hi" }),
  });
  const res1 = createMockRes();
  await handler(req1, res1);
  assert.equal(res1.statusCode, 200);

  const req2 = createMockReq({
    method: "POST",
    url: "/analyze",
    body: JSON.stringify({ prompt: "hi again" }),
  });
  const res2 = createMockRes();
  await handler(req2, res2);
  assert.equal(res2.statusCode, 429);
  assert.equal(res2.headers["Retry-After"], "1");
});

test("ollama proxy handles empty body and non-string response", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ response: 123 }),
    }),
  });
  const req = createMockReq({ method: "POST", url: "/analyze" });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy surfaces upstream errors", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }),
  });
  const req = createMockReq({ method: "POST", url: "/analyze" });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy handles malformed request bodies", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ response: "ok" }),
    }),
  });
  const req = createMockReq({
    method: "POST",
    url: "/analyze",
    body: "{",
  });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy handles upstream fetch failures", async () => {
  const handler = createRequestHandler({
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  const req = createMockReq({ method: "POST", url: "/analyze" });
  const res = createMockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(JSON.parse(res.body), { response: "" });
});

test("ollama proxy startServerIfMain returns null when not main", () => {
  assert.equal(startServerIfMain(false), null);
});

test("ollama proxy startServerIfMain starts when main", async () => {
  await new Promise((resolve, reject) => {
    const server = startServerIfMain(true, {
      port: 0,
      onListen: ({ server: active }) => {
        active.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      },
    });
    server.on("error", reject);
  });
});

test("ollama proxy startServer starts and closes", async () => {
  await new Promise((resolve, reject) => {
    const server = startServer({
      port: 0,
      onListen: ({ server: active }) => {
        active.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      },
    });
    server.on("error", reject);
  });
});

test("ollama proxy startServer logs when no onListen", async () => {
  const logBackup = console.log;
  let logged = "";
  console.log = (message) => {
    logged = message;
  };
  try {
    await new Promise((resolve, reject) => {
      const server = startServer({ port: 0 });
      server.on("listening", () => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server.on("error", reject);
    });
  } finally {
    console.log = logBackup;
  }
  assert.ok(logged.includes("Ollama proxy running on http://localhost:0"));
});

test("ollama proxy startServer routes errors through handler", async () => {
  const exitBackup = process.exit;
  const errorBackup = console.error;
  let exitCode = null;
  let message = "";
  process.exit = (code) => {
    exitCode = code;
  };
  console.error = (line) => {
    message = line;
  };
  try {
    await new Promise((resolve, reject) => {
      const server = startServer({
        port: 0,
        onListen: ({ server: active }) => {
          active.emit("error", { code: "EADDRINUSE" });
          active.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        },
      });
      server.on("error", () => {});
    });
  } finally {
    process.exit = exitBackup;
    console.error = errorBackup;
  }
  assert.equal(exitCode, 1);
  assert.ok(message.includes("Port 0 is already in use."));
});

test("ollama proxy handles port-in-use errors", () => {
  const messages = [];
  let exitCode = null;
  handleServerError(
    { code: "EADDRINUSE" },
    9999,
    {
      log: (message) => messages.push(message),
      exit: (code) => {
        exitCode = code;
      },
    },
  );
  assert.equal(exitCode, 1);
  assert.equal(
    messages[0],
    "Port 9999 is already in use. Stop the process using it and try again.",
  );
});

test("ollama proxy handles unexpected errors", () => {
  const messages = [];
  let exitCode = null;
  const error = new Error("boom");
  handleServerError(
    error,
    3010,
    {
      log: (...args) => messages.push(args),
      exit: (code) => {
        exitCode = code;
      },
    },
  );
  assert.equal(exitCode, 1);
  assert.equal(messages[0][0], "Ollama proxy failed to start.");
  assert.equal(messages[0][1], error);
});
