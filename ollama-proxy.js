// This is a proxy server for Ollama API
const http = require("node:http");

const PORT = 3010;
const OLLAMA_URL = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "gpt-oss:120b-cloud";
const MAX_BODY_BYTES = 512 * 1024;
const ALLOWED_ORIGIN_PATTERNS = [
  /^chrome-extension:\/\/.+/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
];

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") {
    return false;
  }
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function sendJson(res, statusCode, payload, origin) {
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  res.writeHead(statusCode, headers);
  res.end(body);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function createRequestHandler(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const ollamaUrl = options.ollamaUrl || OLLAMA_URL;
  const ollamaModel = options.ollamaModel || OLLAMA_MODEL;

  return async (req, res) => {
    const origin = req?.headers?.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      if (!origin) {
        res.writeHead(204);
        res.end();
        return;
      }
      if (!isAllowedOrigin(origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/analyze") {
      sendJson(res, 404, { response: "" }, origin);
      return;
    }

    try {
      const rawBody = await collectBody(req);
      let prompt = "";
      let requestedModel = "";
      if (rawBody) {
        const parsed = JSON.parse(rawBody);
        if (typeof parsed.prompt === "string") {
          prompt = parsed.prompt;
        }
        if (typeof parsed.model === "string") {
          requestedModel = parsed.model.trim();
        }
      }
      const model = requestedModel || ollamaModel;

      const response = await fetchImpl(ollamaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        sendJson(res, response.status, { response: "" }, origin);
        return;
      }

      const data = await response.json();
      const text = typeof data.response === "string" ? data.response.trim() : "";
      sendJson(res, 200, { response: text }, origin);
    } catch (error) {
      sendJson(res, 500, { response: "" }, origin);
    }
  };
}

function createProxyServer(options = {}) {
  return http.createServer(createRequestHandler(options));
}

function handleServerError(error, port = PORT, dependencies = {}) {
  const log = dependencies.log || console.error;
  const exit = dependencies.exit || process.exit;
  if (error && error.code === "EADDRINUSE") {
    log(
      `Port ${port} is already in use. Stop the process using it and try again.`,
    );
    exit(1);
    return;
  }
  log("Ollama proxy failed to start.", error);
  exit(1);
}

function startServer(options = {}) {
  const { port = PORT, onListen, ...handlerOptions } = options;
  const server = createProxyServer(handlerOptions);
  server.on("error", (error) => {
    handleServerError(error, port);
  });
  server.listen(port, () => {
    if (typeof onListen === "function") {
      onListen({ port, server });
      return;
    }
    console.log(`Ollama proxy running on http://localhost:${port}`);
  });
  return server;
}

function startServerIfMain(isMain = require.main === module, options = {}) {
  if (!isMain) {
    return null;
  }
  return startServer(options);
}

startServerIfMain();

module.exports = {
  PORT,
  OLLAMA_URL,
  OLLAMA_MODEL,
  isAllowedOrigin,
  sendJson,
  collectBody,
  createRequestHandler,
  createProxyServer,
  handleServerError,
  startServer,
  startServerIfMain,
};
