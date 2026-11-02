import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { calculateCost } from "./pricing.mjs";
import { logRequest, getStats } from "./db.mjs";

const PORT = Number(process.env.PORT || 8765);
const DEFAULT_API_KEY = process.env.ANTHROPIC_API_KEY || "";

function parseSSELine(line, usage, modelHolder) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const dataStr = trimmed.slice(5).trim();
  if (!dataStr || dataStr === "[DONE]") return;
  try {
    const event = JSON.parse(dataStr);
    if (event.type === "message_start" && event.message) {
      if (event.message.model) modelHolder.model = event.message.model;
      if (event.message.usage) {
        Object.assign(usage, event.message.usage);
      }
    } else if (event.type === "message_delta" && event.usage) {
      Object.assign(usage, event.usage);
    }
  } catch {
    // ignore incomplete chunks
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  // 1. Dashboard UI Route
  if (pathname === "/" || pathname === "/dashboard") {
    const html = fs.readFileSync(path.resolve(process.cwd(), "dashboard.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // 2. Stats & Analytics API Route
  if (pathname === "/api/stats") {
    try {
      const model = parsedUrl.searchParams.get("model") || "all";
      const fromDate = parsedUrl.searchParams.get("fromDate") || "";
      const toDate = parsedUrl.searchParams.get("toDate") || "";
      const stats = await getStats({ model, fromDate, toDate });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(stats));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. Anthropic Reverse Proxy Route
  const startTime = Date.now();
  const upstreamUrl = "https://api.anthropic.com" + req.url;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === "host" || k.toLowerCase() === "accept-encoding") continue;
    headers[k] = v;
  }

  if (!headers["x-api-key"]) {
    headers["x-api-key"] = DEFAULT_API_KEY;
  }

  // Strip claude-code-20250219 to bypass the artificial Anthropic restriction
  if (headers["anthropic-beta"]) {
    const betas = headers["anthropic-beta"]
      .split(",")
      .map(b => b.trim())
      .filter(b => b !== "claude-code-20250219");
    if (betas.length > 0) {
      headers["anthropic-beta"] = betas.join(",");
    } else {
      delete headers["anthropic-beta"];
    }
  }

  let requestBody = undefined;
  let requestedModel = "unknown";
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length > 0) {
      requestBody = Buffer.concat(chunks);
      try {
        const parsed = JSON.parse(requestBody.toString("utf8"));
        if (parsed.model) requestedModel = parsed.model;
      } catch {
        // ignore parse error
      }
    }
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: requestBody,
      duplex: "half"
    });

    const isStream = upstreamRes.headers.get("content-type")?.includes("text/event-stream");
    const resHeaders = {};
    for (const [k, v] of upstreamRes.headers.entries()) {
      if (k.toLowerCase() === "content-encoding") continue;
      resHeaders[k] = v;
    }

    res.writeHead(upstreamRes.status, resHeaders);

    if (!upstreamRes.body) {
      res.end();
      return;
    }

    if (isStream) {
      const modelHolder = { model: requestedModel };
      const usage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_creation: {},
        output_tokens_details: {}
      };
      let buffer = "";
      const decoder = new TextDecoder();

      for await (const chunk of upstreamRes.body) {
        res.write(chunk);
        buffer += decoder.decode(chunk, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep remainder

        for (const line of lines) {
          parseSSELine(line, usage, modelHolder);
        }
      }
      if (buffer) {
        parseSSELine(buffer, usage, modelHolder);
      }
      res.end();

      const durationMs = Date.now() - startTime;
      const costData = calculateCost(usage, modelHolder.model);
      console.log(`[proxy] Stream finished: ${modelHolder.model} | in:${costData.tokens.input} cacheRead:${costData.tokens.cacheRead} out:${costData.tokens.output} | $${costData.costs.totalCost.toFixed(5)}`);
      
      logRequest({
        endpoint: pathname,
        model: modelHolder.model,
        stream: true,
        status: upstreamRes.status,
        durationMs,
        tokens: costData.tokens,
        costs: costData.costs
      });
    } else {
      // Non-streaming response
      const chunks = [];
      for await (const chunk of upstreamRes.body) chunks.push(chunk);
      const fullBody = Buffer.concat(chunks);
      res.write(fullBody);
      res.end();

      const durationMs = Date.now() - startTime;
      let model = requestedModel;
      let usage = {};

      try {
        const json = JSON.parse(fullBody.toString("utf8"));
        if (json.model) model = json.model;
        if (json.usage) usage = json.usage;
      } catch {
        // ignore parse error
      }

      if (upstreamRes.status === 200 && Object.keys(usage).length > 0) {
        const costData = calculateCost(usage, model);
        console.log(`[proxy] Request finished: ${model} | in:${costData.tokens.input} cacheRead:${costData.tokens.cacheRead} out:${costData.tokens.output} | $${costData.costs.totalCost.toFixed(5)}`);
        
        logRequest({
          endpoint: pathname,
          model,
          stream: false,
          status: upstreamRes.status,
          durationMs,
          tokens: costData.tokens,
          costs: costData.costs
        });
      }
    }
  } catch (err) {
    console.error(`[gateway] Proxy error on ${req.method} ${pathname}:`, err.message);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { type: "gateway_error", message: err.message } }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[gateway] Anthropic Container Gateway listening on http://0.0.0.0:${PORT}`);
  console.log(`[gateway] Dashboard accessible at http://localhost:${PORT}/`);
});
