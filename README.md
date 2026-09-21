# 16bit Signal Board

Mobile-first 16-bit market signal dashboard for all active Veltrix markets.

## MVP

- Loads every active market from `veltrix_markets` (currently designed for 60 markets).
- Uses `xgen_market_result_archive` as historical input.
- Exact Pair engine: Top-3 and Top-5.
- Run19 engine: one primary run digit plus two runners.
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
