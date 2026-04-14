# Vintage Ski/Snowboard Sourcing Tool — Design Spec
**Date:** 2026-04-14
**Status:** Approved

---

## Overview

A single `index.html` web app for a small Swedish resale team (2–5 people) to source underpriced vintage ski and snowboard clothing across multiple platforms. The tool generates platform search URLs, accepts pasted listings for AI scoring via the Claude API, and maintains a local deal board with JSON export/import for team sharing.

No frameworks, no build step, no backend. All CSS and JS inline. Deployable as a static file to Netlify.

---

## Architecture

### File structure
Single `index.html`. All CSS and JS inline. No external dependencies except the Anthropic API (`https://api.anthropic.com/v1/messages`).

### State model
One `APP_STATE` object in memory with the following shape:

```js
{
  deals: Deal[],        // saved deal cards
  brands: string[],     // target brand list
  apiKey: string,       // Anthropic API key
  teamName: string,     // active team member name
  activeTab: string     // current tab
}
```

State is serialized to `localStorage` on every mutation. Keys: `ski_deals`, `ski_brands`, `ski_apikey`, `ski_teamname`.

### Tab navigation
Persistent nav bar with 4 tabs: **Search**, **Score**, **Deal Board**, **Settings**. Tab content is swapped dynamically (only active tab content rendered). State persists across tab switches.

---

## Search Tab

### Two modes — Quick and Advanced (toggled by a switch)

#### Quick mode
- Single text input for a custom query
- "Open all platforms" button opens all 4 automated platforms simultaneously in new tabs
- 6 pre-built search template buttons:
  - "Helly Hansen fleece 90s"
  - "Burton snowboard jacket vintage"
  - "Nevica ski suit"
  - "Bogner ski jacket"
  - "Ellesse ski 80s"
  - "Killy vintage"
- Each template opens all platforms simultaneously

#### Advanced mode
Structured search builder with fields:
- **Brand** — dropdown from brand list (or type custom)
- **Item type** — free text (e.g. "ski jacket", "one-piece suit", "fleece")
- **Era** — multi-select chips: 70s / 80s / 90s / 00s / any
- **Color** — free text (optional)
- **Size** — free text (optional)
- **Extra keywords** — free text for anything else

The builder assembles a platform-optimized query string per platform:
- Tradera: Swedish color terms where relevant, quoted phrases where supported
- eBay: English terms, `LH_PrefLoc=3` for European sellers
- Vinted / Sellpy: URL-encoded query string

### Platform launch buttons
Each platform shown with an individual "open" button AND an "Open all" button. Both modes show all platforms.

#### Platform search URLs
| Platform | URL pattern |
|---|---|
| Tradera | `https://www.tradera.com/search?q=<query>` |
| Vinted | `https://www.vinted.se/catalog?search_text=<query>` |
| Sellpy | `https://www.sellpy.se/search?query=<query>` |
| eBay | `https://www.ebay.com/sch/i.html?_nkw=<query>&LH_PrefLoc=3` |

### Facebook Marketplace
Static reminder card: "Search Facebook Marketplace manually" with a "Copy query" button that copies the current query to clipboard and shows a visual confirmation toast.

---

## Score Tab

### Listing input
- Large textarea: "Paste listing (title, price, description, URL)"
- No required format — users paste raw copied text
- Platform selector dropdown: Tradera / Vinted / Sellpy / eBay / Facebook / Other

### AI scoring
- **Model:** `claude-sonnet-4-20250514`
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **System prompt:**

```
You are an expert in vintage ski and snowboard clothing resale. You evaluate thrift listings for a Swedish resale business. Score each listing from 1-10 based on:
- Brand tier (Bogner/Kjus = highest, Helly Hansen/Burton/Nevica = high, others = medium)
- Era/collectibility (80s-90s = best, early 2000s = good, 2010s+ = lower)
- Condition signals from the description (like new/mint = best, good used = fine, worn/damaged = low)
- Price vs likely resale value in SEK (under 200 SEK for a good piece = great deal)
- Resale potential in the Swedish/European vintage market

Return ONLY a JSON object with these fields:
{
  score: number (1-10),
  brand_tier: string (high/medium/low),
  era: string (e.g. '90s' or 'unknown'),
  condition: string (mint/good/fair/poor/unknown),
  buy_price_sek: number or null,
  estimated_resale_sek: number or null,
  margin_estimate: string (e.g. '3-4x' or 'unknown'),
  verdict: string (max 20 words — one sharp sentence on whether to buy),
  flags: array of strings (any red flags, e.g. 'no era info', 'synthetic material', 'high competition item')
}
```

- Spinner shown while waiting for API response
- If no API key: banner directing to Settings tab
- If API error or non-JSON response: shows raw response with retry option

### Result card
Displayed inline after scoring:
- Score badge (large, color-coded: green 8-10, amber 5-7, red 1-4)
- Brand tier, era, condition as small tags
- Buy price in SEK + estimated resale + margin
- Verdict sentence
- Flags as warning chips
- "Save to Deal Board" button — extracts URL from pasted text via regex (`https?://\S+`); prompts user to enter a URL manually if none found; auto-fills team member name from Settings as claimer

---

## Deal Board Tab

### Card grid
- Responsive CSS grid: 1 column mobile, 2–3 columns desktop
- Default sort: score descending

### Each deal card displays
- Score badge (color-coded, same scheme as Score tab)
- Brand, era, condition tags
- Buy price (SEK) + estimated resale + margin estimate
- Verdict text
- Platform source tag
- Link to original listing (opens new tab)
- "Claimed by" — editable text input inline on card
- Status dropdown: Available / Claimed / Bought / Pass
- Timestamp (relative: "2 hours ago", stored as ISO string)
- Delete button with confirmation dialog

### Filters (additive AND logic)
- Status (multi-select)
- Platform (multi-select)
- Score range (slider: min–max)
- Brand (multi-select from saved deals)

### Sort options
- Score (high to low)
- Price (low to high)
- Date added (newest first)

### Export / Import
- **Export**: "Export deals" downloads `deals-YYYY-MM-DD.json` with the full `deals[]` array
- **Import**: "Import deals" accepts a `.json` file, merges by deal UUID (no duplicates), shows toast with count of deals added

Each deal is assigned a UUID on creation so merges are idempotent.

---

## Settings Tab

- **API key**: text input, stored in localStorage, masked by default with show/hide toggle. Reminder banner on Score tab if empty.
- **Team member name**: text input, used as default "claimed by" value on new deals
- **Brand manager**:
  - List of current target brands with individual delete buttons
  - "Add brand" text input + button
  - Saved in localStorage key `ski_brands`
  - Default brands: Helly Hansen, Burton, Volcom, Bogner, Ellesse, Killy, Nevica, O'Neill, Kjus, Phenix, Alpina, Descente
- **Danger zone**: "Clear all deals" button with confirmation dialog

---

## UI Style

- Dark mode by default (dark background, light text)
- Clean, minimal with a subtle CRT/vintage aesthetic (optional scan-line texture, monospace accents)
- Score badges: large, bold, clearly color-coded (green / amber / red)
- Mobile-friendly: touch targets ≥ 44px, stacked layout on narrow screens
- English labels throughout (Swedish is acceptable but English preferred for clarity)
- Toasts for feedback (save, import, copy-to-clipboard, errors) — auto-dismiss after 3s

---

## Data Shapes

### Deal object
```js
{
  id: string,               // UUID v4
  score: number,
  brand_tier: string,
  era: string,
  condition: string,
  buy_price_sek: number | null,
  estimated_resale_sek: number | null,
  margin_estimate: string,
  verdict: string,
  flags: string[],
  platform: string,
  listing_url: string,
  raw_paste: string,        // original pasted text
  claimed_by: string,
  status: 'Available' | 'Claimed' | 'Bought' | 'Pass',
  created_at: string        // ISO 8601
}
```

---

## Deployment

Static HTML file deployed to Netlify via drag-and-drop or GitHub integration. No server-side config needed. A `netlify.toml` is not required for a single static file but can be added for custom redirects if needed.

Step-by-step Netlify deployment instructions to be included at the end of the implementation plan.

---

## Out of Scope
- Real-time sync between team members (handled via export/import)
- Server-side scraping or proxy
- Authentication / user accounts
- Push notifications
- Automated price tracking over time
