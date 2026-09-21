export type Market = {
  id: string;
  market_key: string;
  market_name: string;
  country_code?: string | null;
  active: boolean;
};

export type MarketResult = {
  market_id: string;
  draw_date: string;
  top3: string;
  bottom2: string;
  recorded_at?: string | null;
};

export type MarketSignal = {
  market: Market;
  top3Pairs: string[];
  top5Pairs: string[];
  runDigit: number;
  runRunners: number[];
  latestTop3: string;
  latestBottom2: string;
  latestDrawDate: string;
  historyCount: number;
};

export type MarketBundle = {
  markets: Market[];
  results: MarketResult[];
};
