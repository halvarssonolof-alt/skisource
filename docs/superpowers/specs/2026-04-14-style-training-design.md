# Style Training Tab — Design Spec
**Date:** 2026-04-14
**Status:** Approved

## Overview

A dedicated **Train** tab that lets the user build a persistent style memory by rating AI-found listings as Good or Bad. Ratings accumulate and get injected into all future searches (Train tab and regular Search tab), so the AI continuously refines toward the user's specific taste.

---

## Data Model

New `styleMemory` array in state, separate from buy/pass `memory`.

```js
// S.styleMemory entry
{
  url:         string,   // listing URL
  title:       string,
  brand:       string,
  era:         string,   // '70s'|'80s'|'90s'|'00s'|'unknown'
  condition:   string,
  style_notes: string,   // AI-extracted: "studded panels, 90s colorblock, Peak Performance"
  rating:      'good'|'bad',
  ts:          string    // ISO timestamp
}
```

- Persisted to `localStorage('ski_style_memory')`
- Capped at 60 entries (oldest dropped first)
- "Not working" ratings are never stored — dismissed silently

---

## State Changes

```js
S = {
  ...existing fields,
  styleMemory: [],   // rated listing entries
  styleSeeds:  ''    // raw URL seed textarea content (persisted)
}
```

localStorage keys added: `ski_style_memory`, `ski_style_seeds`

---

## buildStyleContext()

New function, parallel to `buildLearnedContext()`. Formats style memory into a prompt block:

```
═══ LEARNED STYLE PREFERENCES ═══
Use these to calibrate what this team is looking for:

LIKED (find more like these):
• Peak Performance | 90s | good | studded panels, bright colorblock
• Ellesse | 80s | mint | one-piece bib, pastel geometric
...

DISLIKED (avoid these patterns):
• Burton | 00s | fair | plain shell, muted colors
...

Prioritise listings that match the LIKED patterns. Deprioritise DISLIKED patterns.
```

- Uses last 20 good + last 10 bad entries
- Returns `''` if styleMemory is empty
- Injected into Train tab searches AND regular Search tab searches

---

## Train Tab UI

Fifth nav tab: `Train`, between Board and Settings.

### Layout (top to bottom)

**Header row**
- Section title: `STYLE TRAINING`
- Counter badge: `● 14 good · 6 bad` or `(no style memory yet)`

**Seed box** (collapsible, closed by default if style memory exists)
- Label: "Seed with example URLs (optional)"
- Textarea: paste 1–5 URLs of items you like, one per line
- Hint text: "Skip this if you already have rated items — the AI will use your memory instead"

**Find items button**
- Primary button: `Find items ↗`
- Triggers Claude search using style memory + seed URLs
- Shows spinner + status text while loading

**Results grid**
- Same `.deal-grid` layout as Board tab
- 8–10 cards per batch
- Each card shows: title, brand, era, price, platform tag, quick_take
- Three action buttons per card: `Good` · `Bad` · `Not working`
- After rating: Good/Bad buttons reflect selection (accent/red highlight) but remain clickable to change
- "Not working" dismisses the card immediately, no storage

**Style memory panel** (always visible if styleMemory.length > 0)
- Section title: `RATED ITEMS`
- Compact list rows: `[Good/Bad toggle] Title — brand · era · style_notes [Remove ×]`
- Toggle flips rating between good ↔ bad and updates storage
- Remove deletes the entry from styleMemory

---

## Claude Call (Train Search)

Same fetch structure as `callClaudeSearch`, different prompt composition:

```js
system = SEARCH_BASE + buildStyleContext() + seedCtx
```

Where `seedCtx` is:
```
═══ SEED EXAMPLES FROM USER ═══
The user provided these specific listings as style references.
Visit each URL and use their aesthetic as a search target:
[urls, one per line]
```

If both styleMemory and seeds are empty, falls back to generic vintage ski search.

**Response JSON** — same fields as regular search plus one addition:
```json
{
  "title": "...",
  "brand": "...",
  "price_sek": 299,
  "price_raw": "299 kr",
  "condition": "good",
  "platform": "Tradera",
  "url": "https://...",
  "era": "90s",
  "quick_take": "...",
  "style_notes": "studded construction, colorblock panels, Peak Performance 90s cut"
}
```

`style_notes` is stored when user rates the item.

---

## Regular Search Tab Integration

`runAiSearch()` already builds `systemPrompt = SEARCH_BASE + buildLearnedContext()`.

Change to: `systemPrompt = SEARCH_BASE + buildStyleContext() + buildLearnedContext()`

No other changes to Search tab. Style memory silently improves all searches.

---

## Replacing Notable Styles

The "Notable styles to watch for" card added in the previous session (Settings tab) is removed. Its functionality is superseded by the style training system. The `S.styles` state field and `ski_styles` localStorage key are also removed.

---

## Error Handling

- No API key → toast error, redirect to Settings (same as existing pattern)
- Claude returns malformed JSON → show error card with Retry button (same as existing pattern)
- Individual card URL is dead → user clicks "Not working", card dismissed

---

## Scope

This spec covers the Train tab and style memory system only. No changes to Score tab, Deal Board, or Settings beyond removing the notable styles card.
