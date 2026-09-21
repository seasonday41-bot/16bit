import { useEffect, useMemo, useState } from "react";
import { loadMarketBundle } from "./lib/data";
import { MIN_HISTORY, predictMarket } from "./lib/engine";
import { getUpcomingMarkets, MARKET_TIMES } from "./lib/schedule";
import type { Market, MarketBundle, MarketSignal } from "./types";

type FilterKey = "ALL" | "VIP" | "ลาว" | "ฮานอย" | "หุ้น";

const FILTERS: FilterKey[] = ["ALL", "VIP", "ลาว", "ฮานอย", "หุ้น"];

const STOCK_WORDS = [
  "หุ้น",
  "นิคเคอิ",
  "ฮั่งเส็ง",
  "ดาวโจนส์",
  "ไต้หวัน",
  "เยอรมัน",
  "รัสเซีย",
  "สิงคโปร์",
  "อังกฤษ",
  "เกาหลี",
  "จีน",
];

function matchesFilter(market: Market, filter: FilterKey): boolean {
  const name = market.market_name;

  if (filter === "ALL") return true;
  if (filter === "VIP") return name.toUpperCase().includes("VIP");
  if (filter === "ลาว") return name.includes("ลาว");
  if (filter === "ฮานอย") return name.includes("ฮานอย");
  return STOCK_WORDS.some((word) => name.includes(word));
}

function formatDrawDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function copyText(signal: MarketSignal): string {
  return [
    signal.market.market_name,
    "",
    "เจาะ 2 Top-3",
    signal.top3Pairs.join(" • "),
    "",
    "เจาะ 2 Top-5",
    signal.top5Pairs.join(" • "),
    "",
    "วิ่ง 19 ประตู",
    String(signal.runDigit),
    "",
    "รอง",
    signal.runRunners.join(" • "),
  ].join("\n");
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function MarketCard({
  market,
  signal,
  copied,
  onCopy,
}: {
  market: Market;
  signal: MarketSignal | null;
  copied: boolean;
  onCopy: (signal: MarketSignal) => void;
}) {
  const time = MARKET_TIMES[market.market_name] ?? "--:--";

  return (
    <article className="market-card">
      <header className="market-card__header">
        <div>
          <div className="market-key">{market.market_key.toUpperCase()}</div>
          <h2>{market.market_name}</h2>
        </div>
        <time>{time}</time>
      </header>

      {signal ? (
        <>
          <section className="signal-block signal-block--top3">
            <span className="signal-label">TOP 3</span>
            <div className="pair-row pair-row--large">
              {signal.top3Pairs.map((pair) => (
                <strong key={pair}>{pair}</strong>
              ))}
            </div>
          </section>

          <section className="signal-block">
            <span className="signal-label">TOP 5</span>
            <div className="pair-row">
              {signal.top5Pairs.map((pair) => (
                <strong key={pair}>{pair}</strong>
              ))}
            </div>
          </section>

          <section className="run-block">
            <div>
              <span className="signal-label">RUN 19</span>
              <div className="run-note">วิ่ง 19 ประตู</div>
            </div>
            <div className="run-main">{signal.runDigit}</div>
            <div className="runner-up">
              รอง {signal.runRunners.join(" • ")}
            </div>
          </section>

          <div className="market-meta">
            <span>DATA {signal.historyCount}</span>
            <span>งวดล่าสุด {formatDrawDate(signal.latestDrawDate)}</span>
            <span>
              ผลล่าสุด {signal.latestTop2}-{signal.latestBottom2}
            </span>
          </div>

          <button
            className={copied ? "copy-button copy-button--copied" : "copy-button"}
            onClick={() => onCopy(signal)}
            type="button"
          >
            {copied ? "✓ COPIED" : "COPY ALL"}
          </button>
        </>
      ) : (
        <div className="not-ready">
          <strong>WAITING FOR DATA</strong>
          <span>ต้องมีผลย้อนหลังอย่างน้อย {MIN_HISTORY} งวด</span>
        </div>
      )}
    </article>
  );
}

export default function App() {
  const [bundle, setBundle] = useState<MarketBundle | null>(null);
  const [error, setError] = useState<string>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadMarketBundle()
      .then((nextBundle) => {
        if (cancelled) return;
        setBundle(nextBundle);
        setUpdatedAt(new Date());
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signals = useMemo(() => {
    if (!bundle) return new Map<string, MarketSignal | null>();

    const map = new Map<string, MarketSignal | null>();

    for (const market of bundle.markets) {
      map.set(market.id, predictMarket(market, bundle.results));
    }

    return map;
  }, [bundle]);

  const visibleMarkets = useMemo(() => {
    if (!bundle) return [];

    const query = search.trim().toLowerCase();

    return bundle.markets.filter((market) => {
      const searchMatch =
        !query ||
        market.market_name.toLowerCase().includes(query) ||
        market.market_key.toLowerCase().includes(query);

      return searchMatch && matchesFilter(market, filter);
    });
  }, [bundle, filter, search]);

  const upcoming = useMemo(
    () => (bundle ? getUpcomingMarkets(bundle.markets) : []),
    [bundle]
  );

  async function handleCopy(signal: MarketSignal) {
    await copyToClipboard(copyText(signal));
    setCopiedKey(signal.market.market_key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }

  const updateLabel = updatedAt
    ? updatedAt.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-kicker">16BIT // SIGNAL BOARD</div>
          <h1>PIXEL LOTTO</h1>
        </div>
        <div className="status-box">
          <strong>{bundle?.markets.length ?? "--"} MARKETS</strong>
          <span>● UPDATED {updateLabel}</span>
        </div>
      </header>

      <section className="controls">
        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาตลาด..."
            aria-label="ค้นหาตลาด"
          />
        </label>

        <nav className="filter-strip" aria-label="ตัวกรองตลาด">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === filter ? "filter-chip is-active" : "filter-chip"}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </section>

      <section className="upcoming-strip" aria-label="ตลาดที่กำลังจะออก">
        <div className="upcoming-title">NEXT &gt;&gt;</div>
        <div className="upcoming-items">
          {upcoming.length ? (
            upcoming.map(({ market, time, tomorrow }) => (
              <span key={market.id}>
                {market.market_name} <strong>{time}</strong>
                {tomorrow ? " +1" : ""}
              </span>
            ))
          ) : (
            <span>กำลังโหลดตารางตลาด...</span>
          )}
        </div>
      </section>

      {error ? (
        <section className="error-panel">
          <strong>DATA LINK OFFLINE</strong>
          <p>{error}</p>
          <p>
            ตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_PUBLISHABLE_KEY
            ใน environment ของ Vercel หรือไฟล์ .env.local
          </p>
        </section>
      ) : null}

      {!bundle && !error ? (
        <section className="loading-panel">
          <span className="loading-pixel" />
          LOADING 60 MARKETS...
        </section>
      ) : null}

      {bundle ? (
        <>
          <div className="result-count">
            SHOWING {visibleMarkets.length} / {bundle.markets.length}
          </div>

          <section className="market-grid">
            {visibleMarkets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                signal={signals.get(market.id) ?? null}
                copied={copiedKey === market.market_key}
                onCopy={handleCopy}
              />
            ))}
          </section>
        </>
      ) : null}

      <footer className="app-footer">
        <span>16BIT SIGNAL BOARD</span>
        <span>EXPERIMENTAL MODEL • NO GUARANTEE</span>
      </footer>
    </main>
  );
}
