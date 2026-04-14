# SkiSource — CLAUDE.md

## What this is

**SkiSource** is a single-file vintage ski/snowboard clothing sourcing tool for a Swedish resale business. Everything lives in `index.html` — no build step, no dependencies, no backend. It uses the Anthropic Claude API directly from the browser.

## Architecture

- **Single file**: `index.html` — all HTML, CSS, and JS in one file (~1200 lines)
- **No framework**: vanilla JS, no React/Vue/etc.
- **No backend**: Claude API called directly from the browser via `fetch`
- **Persistence**: everything stored in `localStorage` (deals, brands, API key, team name, AI memory)
- **Deployment**: static file — works on Netlify, Vercel, GitHub Pages, or just opening locally

## Features (as of last session)

### Search tab
- Quick mode: free-text query → Claude generates search links + ranked results
- Advanced mode: brand/item/color/size/era filters
- Platform links auto-generated for: Tradera, Vinted, Sellpy, eBay, Blocket, Tise
- FB Marketplace: "Copy query" button (can't deep-link)
- AI-powered search: sends query to Claude → returns 6-12 ranked results with URLs, prices in SEK, condition, era, quick take

### Score tab
- Paste any listing (any language, any currency, any format)
- Claude scores 1-10 with verdict, flags, resale estimate, buy/pass recommendation
- Supported languages: Swedish, Polish, Norwegian, Finnish, German, French, Italian, Dutch, Danish, Spanish
- Supported currencies: SEK, EUR (×11.5), PLN (×2.6), NOK (×0.97), DKK (×1.55), GBP (×13.5), USD (×10.5)

### Deal Board tab
- Save scored deals with status: Available / Claimed / Bought / Pass
- Filter by status, platform, min score; sort by score/price/date
- When status = Bought: shows sell price input → computes actual margin
- Export/import JSON for backup or sharing

### Settings tab
- Anthropic API key (stored in localStorage, never leaves browser)
- Team member name (shown on "Claimed by" label)
- Target brands list (customisable, affects search and scoring priorities)
- AI Memory card: shows outcome count, clear button

## AI Memory / Self-Teaching System

This is the most important feature. How it works:

1. **Recording**: when a deal is marked Bought + sell price entered → `addMemory({type:'bought', ...})`. When marked Pass → prompts for reason → `addMemory({type:'passed', ...})`
2. **Storage**: `S.memory[]` in state, persisted to `localStorage('ski_memory')`
3. **Injection**: `buildLearnedContext()` formats last 12 buys + last 8 passes into a text block injected into BOTH the scoring prompt (`SCORE_BASE`) and the search prompt (`SEARCH_BASE`) as few-shot calibration
4. **Cap**: keeps last 50 outcomes to avoid token bloat
5. **Effect**: Claude adjusts scores and search priorities based on what's actually been working for this team

## Key constants / prompts

- `SCORE_BASE` (~150 lines): multilingual scoring prompt with condition terms, price parsing, brand tiers, era detection, platform seller patterns, scoring calibration, resale estimates
- `SEARCH_BASE` (~20 lines): search agent prompt
- `buildLearnedContext()`: appends learned outcomes to both prompts at call time
- `DEFAULT_BRANDS`: the default brand watchlist
- `PLATFORMS`: platform URL builders (Tradera, Vinted, Sellpy, eBay, Blocket, Tise)
- Model used: `claude-opus-4-6` via direct `fetch` to `https://api.anthropic.com/v1/messages`

## State shape

```js
S = {
  deals:    [...],      // Deal Board entries
  brands:   [...],      // Target brand list
  apiKey:   '',         // Anthropic API key
  teamName: '',         // User's name
  memory:   [...]       // AI learning outcomes
}
```

Each memory entry: `{ type, brand_tier, era, condition, platform, buy_price_sek, sell_price_sek, score, verdict, note, ts }`

## localStorage keys

| Key | Contents |
|-----|----------|
| `ski_deals` | JSON array of saved deals |
| `ski_brands` | JSON array of brand strings |
| `ski_apikey` | Anthropic API key string |
| `ski_teamname` | Team member name |
| `ski_memory` | JSON array of AI learning outcomes |

## Deployment

No build step needed — just serve `index.html`.

**Netlify (no CLI):** Drag the project folder onto netlify.com/drop  
**Netlify (CLI):** `npm i -g netlify-cli` → `netlify deploy --prod --dir .`  
**Vercel:** `npm i -g vercel` → `vercel --prod`  
**GitHub Pages:** push to GitHub, enable Pages on the repo

## What was last worked on

- Self-teaching AI memory system (outcomes stored and injected as few-shot examples)
- Holistic multilingual scoring (10 languages, all currencies, full brand tier table, platform seller patterns, sell price tracking, pass reason logging)
- Sell price input on Bought cards → actual margin display
- Pass reason prompt → feeds into AI memory
- Blocket + Tise added to platforms
