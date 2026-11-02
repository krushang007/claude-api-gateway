// Exact Anthropic pricing tiers (prices in USD per 1 Million tokens)
export const PRICING_TIERS = {
  // Claude Opus 5.5 (Tier BE)
  "claude-opus-5-5": {
    name: "Claude Opus 5.5",
    family: "opus",
    inputPerM: 8.0,
    outputPerM: 40.0,
    cacheWrite5mPerM: 10.0,
    cacheWrite1hPerM: 16.0,
    cacheReadPerM: 0.40
  },
  // Claude Opus 5 & 4.8 (Tier bu)
  "claude-opus-5": {
    name: "Claude Opus 5",
    family: "opus",
    inputPerM: 10.0,
    outputPerM: 50.0,
    cacheWrite5mPerM: 12.5,
    cacheWrite1hPerM: 20.0,
    cacheReadPerM: 1.00
  },
  "claude-opus-4-8": {
    name: "Claude Opus 4.8",
    family: "opus",
    inputPerM: 10.0,
    outputPerM: 50.0,
    cacheWrite5mPerM: 12.5,
    cacheWrite1hPerM: 20.0,
    cacheReadPerM: 1.00
  },
  // Claude Opus 4.6, 4.5, 3 (Tier 15_75)
  "claude-opus-4-6": {
    name: "Claude Opus 4.6",
    family: "opus",
    inputPerM: 15.0,
    outputPerM: 75.0,
    cacheWrite5mPerM: 18.75,
    cacheWrite1hPerM: 30.0,
    cacheReadPerM: 1.50
  },
  "claude-opus-4-5": {
    name: "Claude Opus 4.5",
    family: "opus",
    inputPerM: 15.0,
    outputPerM: 75.0,
    cacheWrite5mPerM: 18.75,
    cacheWrite1hPerM: 30.0,
    cacheReadPerM: 1.50
  },

  // Claude Sonnet 5.5 & Sonnet 5 (Tier 5_25)
  "claude-sonnet-5-5": {
    name: "Claude Sonnet 5.5",
    family: "sonnet",
    inputPerM: 5.0,
    outputPerM: 25.0,
    cacheWrite5mPerM: 6.25,
    cacheWrite1hPerM: 10.0,
    cacheReadPerM: 0.50
  },
  "claude-sonnet-5": {
    name: "Claude Sonnet 5",
    family: "sonnet",
    inputPerM: 5.0,
    outputPerM: 25.0,
    cacheWrite5mPerM: 6.25,
    cacheWrite1hPerM: 10.0,
    cacheReadPerM: 0.50
  },
  // Claude Sonnet 4.6 (Anthropic negotiated rate: $2.40 / $12.00)
  "claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6",
    family: "sonnet",
    inputPerM: 2.4,
    outputPerM: 12.0,
    cacheWrite5mPerM: 3.0,
    cacheWrite1hPerM: 4.8,
    cacheReadPerM: 0.24
  },
  // Claude Sonnet 4.5, 3.7, 3.5 (Tier 3_15)
  "claude-sonnet-4-5": {
    name: "Claude Sonnet 4.5",
    family: "sonnet",
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheWrite5mPerM: 3.75,
    cacheWrite1hPerM: 6.0,
    cacheReadPerM: 0.30
  },
  "claude-3-7-sonnet": {
    name: "Claude Sonnet 3.7",
    family: "sonnet",
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheWrite5mPerM: 3.75,
    cacheWrite1hPerM: 6.0,
    cacheReadPerM: 0.30
  },
  "claude-3-5-sonnet": {
    name: "Claude Sonnet 3.5",
    family: "sonnet",
    inputPerM: 3.0,
    outputPerM: 15.0,
    cacheWrite5mPerM: 3.75,
    cacheWrite1hPerM: 6.0,
    cacheReadPerM: 0.30
  },

  // Claude Haiku 5.5
  "claude-haiku-5-5": {
    name: "Claude Haiku 5.5",
    family: "haiku",
    inputPerM: 0.10,
    outputPerM: 0.50,
    cacheWrite5mPerM: 0.125,
    cacheWrite1hPerM: 0.20,
    cacheReadPerM: 0.01
  },
  // Claude Haiku 4.5
  "claude-haiku-4-5": {
    name: "Claude Haiku 4.5",
    family: "haiku",
    inputPerM: 1.0,
    outputPerM: 5.0,
    cacheWrite5mPerM: 1.25,
    cacheWrite1hPerM: 2.0,
    cacheReadPerM: 0.10
  },
  // Claude Haiku 3.5
  "claude-3-5-haiku": {
    name: "Claude Haiku 3.5",
    family: "haiku",
    inputPerM: 0.80,
    outputPerM: 4.0,
    cacheWrite5mPerM: 1.0,
    cacheWrite1hPerM: 1.60,
    cacheReadPerM: 0.08
  }
};

const DEFAULT_FALLBACK_TIER = {
  name: "Claude Standard",
  family: "standard",
  inputPerM: 3.0,
  outputPerM: 15.0,
  cacheWrite5mPerM: 3.75,
  cacheWrite1hPerM: 6.0,
  cacheReadPerM: 0.30
};

export function getPricing(modelId = "") {
  const cleanId = (modelId || "").toLowerCase();
  for (const [key, tier] of Object.entries(PRICING_TIERS)) {
    if (cleanId.includes(key)) {
      return tier;
    }
  }
  if (cleanId.includes("opus")) return PRICING_TIERS["claude-opus-5-5"];
  if (cleanId.includes("sonnet")) return PRICING_TIERS["claude-sonnet-5-5"];
  if (cleanId.includes("haiku")) return PRICING_TIERS["claude-haiku-5-5"];
  return DEFAULT_FALLBACK_TIER;
}

export function calculateCost(usage = {}, modelId = "") {
  const pricing = getPricing(modelId);

  const uncachedInput = Number(usage.input_tokens || 0);
  const cacheRead = Number(usage.cache_read_input_tokens || 0);

  const cacheWrite5m = Number(usage.cache_creation?.ephemeral_5m_input_tokens || 0);
  const cacheWrite1h = Number(usage.cache_creation?.ephemeral_1h_input_tokens || 0);
  const totalCacheWrite = (cacheWrite5m > 0 || cacheWrite1h > 0)
    ? (cacheWrite5m + cacheWrite1h)
    : Number(usage.cache_creation_input_tokens || 0);

  const outputTokens = Number(usage.output_tokens || 0);
  const thinkingTokens = Number(usage.output_tokens_details?.thinking_tokens || 0);

  const inputCost = (uncachedInput / 1_000_000) * pricing.inputPerM;
  const cacheReadCost = (cacheRead / 1_000_000) * pricing.cacheReadPerM;
  const cacheWriteCost = cacheWrite5m > 0
    ? ((cacheWrite5m / 1_000_000) * pricing.cacheWrite5mPerM) + ((cacheWrite1h / 1_000_000) * pricing.cacheWrite1hPerM)
    : (totalCacheWrite / 1_000_000) * pricing.cacheWrite5mPerM;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerM;

  const totalCost = inputCost + cacheReadCost + cacheWriteCost + outputCost;

  // What this would have cost without caching
  const costWithoutCaching = ((uncachedInput + cacheRead + totalCacheWrite) / 1_000_000) * pricing.inputPerM + outputCost;
  const savings = Math.max(0, costWithoutCaching - totalCost);

  return {
    pricingName: pricing.name,
    pricing,
    tokens: {
      input: uncachedInput,
      output: outputTokens,
      thinking: thinkingTokens,
      cacheRead,
      cacheWrite: totalCacheWrite,
      total: uncachedInput + cacheRead + totalCacheWrite + outputTokens
    },
    costs: {
      inputCost,
      cacheReadCost,
      cacheWriteCost,
      outputCost,
      totalCost,
      savings
    }
  };
}

