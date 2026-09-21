# 16bit Signal Board

Mobile-first 16-bit market signal dashboard for all active Veltrix markets.

## MVP

- Loads every active market from `veltrix_markets` (currently designed for 60 markets).
- Uses `xgen_market_result_archive` as historical input.
- Exact Pair engine: Top-3 and Top-5.
- Run Engine v2: separate top/bottom scoring, one primary run digit plus two runners.
- Search and filters: ALL / VIP / ลาว / ฮานอย / หุ้น.
- Upcoming strip for known VIP schedules.
- One action per market card: **COPY ALL**.
- Mobile-first 16-bit UI; 1 card per row on phones.

## Environment

Create `.env.local` locally, or set these variables in Vercel:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Do not commit production credentials. `.env*` files are ignored except `.env.example`.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Model note

The signal engines are experimental statistical models. Historical backtests do not guarantee future results.

Run Engine v2 uses 5/10/20/30-draw windows, decay, same-side transitions, and
window stability. It compares each side's leading score and gap after applying
market-specific weights estimated from prior walk-forward side hits. Agreement
adds a small score boost. `MarketSignal.runDiagnostics` contains side scores,
weights, gaps, stability, a qualitative confidence bucket, and walk-forward
records for backtesting. These are internal scores, not calibrated win
probabilities. The app also stores a compact pre-draw prediction in this
browser's local storage and settles it when a later draw is fetched. Forward
records are device-specific, can be cleared by the browser, and are not a
server-side audit log.


## Home Screen / PWA

The app includes a web app manifest, Apple touch icon, favicon, standalone mobile display mode, and a pixel-number font for a 16-bit home-screen experience.
