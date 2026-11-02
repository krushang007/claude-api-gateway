import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "usage.jsonl");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function logRequest(entry) {
  try {
    const line = JSON.stringify({
      id: entry.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      date: (entry.timestamp || new Date().toISOString()).slice(0, 10),
      endpoint: entry.endpoint || "/v1/messages",
      model: entry.model || "unknown",
      stream: Boolean(entry.stream),
      status: entry.status || 200,
      durationMs: entry.durationMs || 0,
      tokens: entry.tokens || { input: 0, output: 0, thinking: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      costs: entry.costs || { inputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, outputCost: 0, totalCost: 0, savings: 0 }
    }) + "\n";

    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (err) {
    console.error("[db] Error logging request:", err.message);
  }
}

export async function getStats(filter = {}) {
  const records = [];

  if (fs.existsSync(LOG_FILE)) {
    const fileStream = fs.createReadStream(LOG_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (filter.model && filter.model !== "all" && !item.model.toLowerCase().includes(filter.model.toLowerCase())) {
          continue;
        }
        if (filter.fromDate && item.date < filter.fromDate) {
          continue;
        }
        if (filter.toDate && item.date > filter.toDate) {
          continue;
        }
        records.push(item);
      } catch {
        // ignore corrupted lines
      }
    }
  }

  let totalCost = 0;
  let totalSavings = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalThinkingTokens = 0;

  const dayMap = {};
  const modelMap = {};

  for (const r of records) {
    const cost = r.costs?.totalCost || 0;
    const savings = r.costs?.savings || 0;
    const inp = r.tokens?.input || 0;
    const out = r.tokens?.output || 0;
    const cRead = r.tokens?.cacheRead || 0;
    const cWrite = r.tokens?.cacheWrite || 0;
    const think = r.tokens?.thinking || 0;

    totalCost += cost;
    totalSavings += savings;
    totalInputTokens += inp;
    totalOutputTokens += out;
    totalCacheReadTokens += cRead;
    totalCacheWriteTokens += cWrite;
    totalThinkingTokens += think;

    const day = r.date;
    if (!dayMap[day]) {
      dayMap[day] = { date: day, requests: 0, cost: 0, savings: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    }
    dayMap[day].requests += 1;
    dayMap[day].cost += cost;
    dayMap[day].savings += savings;
    dayMap[day].inputTokens += inp;
    dayMap[day].outputTokens += out;
    dayMap[day].cacheReadTokens += cRead;

    const m = r.model;
    if (!modelMap[m]) {
      modelMap[m] = { model: m, requests: 0, cost: 0, savings: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    }
    modelMap[m].requests += 1;
    modelMap[m].cost += cost;
    modelMap[m].savings += savings;
    modelMap[m].inputTokens += inp;
    modelMap[m].outputTokens += out;
    modelMap[m].cacheReadTokens += cRead;
  }

  const daily = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
  const models = Object.values(modelMap).sort((a, b) => b.cost - a.cost);
  const recent = records.slice(-150).reverse();

  return {
    totalRequests: records.length,
    totalCost,
    totalSavings,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      cacheRead: totalCacheReadTokens,
      cacheWrite: totalCacheWriteTokens,
      thinking: totalThinkingTokens,
      total: totalInputTokens + totalOutputTokens + totalCacheReadTokens + totalCacheWriteTokens
    },
    daily,
    models,
    recent
  };
}

