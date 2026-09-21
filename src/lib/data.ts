import type { Market, MarketBundle, MarketResult } from "../types";

const PAGE_SIZE = 1000;

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

function headers(key: string, range?: string): HeadersInit {
  const h: Record<string, string> = {
    apikey: key,
    Accept: "application/json",
  };

  if (key.split(".").length === 3) {
    h.Authorization = `Bearer ${key}`;
  }

  if (range) {
    h.Range = range;
  }

  return h;
}

async function getJson<T>(path: string, range?: string): Promise<T> {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: headers(key, range),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

async function fetchMarkets(): Promise<Market[]> {
  return getJson<Market[]>(
    "veltrix_markets?select=id,market_key,market_name,country_code,active&active=eq.true&order=market_key.asc"
  );
}

async function fetchArchive(): Promise<MarketResult[]> {
  const output: MarketResult[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const page = await getJson<MarketResult[]>(
      "xgen_market_result_archive?select=market_id,draw_date,top3,bottom2,recorded_at&order=draw_date.asc,recorded_at.asc",
      `${from}-${to}`
    );

    output.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return output;
}

export async function loadMarketBundle(): Promise<MarketBundle> {
  const [markets, results] = await Promise.all([fetchMarkets(), fetchArchive()]);
  const activeIds = new Set(markets.map((market) => market.id));

  return {
    markets,
    results: results.filter((row) => activeIds.has(row.market_id)),
  };
}
