import type { Market, MarketBundle, MarketResult } from "../types";

const HISTORY_LIMIT = 30;
const RPC_BATCH_SIZE = 8;

type RecentResultRow = {
  draw_date: string;
  top3: string;
  bottom2: string;
};

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "ยังไม่ได้ตั้ง VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  return { url, key };
}

function baseHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    Accept: "application/json",
  };

  if (key.split(".").length === 3) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

async function getJson<T>(path: string): Promise<T> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: baseHeaders(key),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

async function rpcJson<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      ...baseHeaders(key),
      "Content-Type": "application/json",
      "Content-Profile": "xgen_private",
      "Accept-Profile": "xgen_private",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase RPC ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

async function fetchMarkets(): Promise<Market[]> {
  return getJson<Market[]>(
    "veltrix_markets?select=id,market_key,market_name,country_code,active&active=eq.true&order=market_key.asc"
  );
}

async function fetchMarketHistory(market: Market): Promise<MarketResult[]> {
  const rows = await rpcJson<RecentResultRow[]>("recent_results", {
    p_market_key: market.market_key,
    p_limit: HISTORY_LIMIT,
  });

  return rows.map((row) => ({
    market_id: market.id,
    draw_date: row.draw_date,
    top3: row.top3,
    bottom2: row.bottom2,
    recorded_at: null,
  }));
}

async function fetchAllHistory(markets: Market[]): Promise<MarketResult[]> {
  const output: MarketResult[] = [];

  for (let index = 0; index < markets.length; index += RPC_BATCH_SIZE) {
    const batch = markets.slice(index, index + RPC_BATCH_SIZE);
    const results = await Promise.all(batch.map(fetchMarketHistory));

    for (const rows of results) {
      output.push(...rows);
    }
  }

  return output;
}

export async function loadMarketBundle(): Promise<MarketBundle> {
  const markets = await fetchMarkets();
  const results = await fetchAllHistory(markets);

  return {
    markets,
    results,
  };
}
