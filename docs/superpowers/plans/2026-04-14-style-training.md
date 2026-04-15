# Style Training Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Train tab where users rate AI-found listings as Good/Bad to build persistent style memory that improves all searches.

**Architecture:** All changes are in `index.html` (single-file app). New `styleMemory` array and `styleSeeds` string added to state and localStorage. `buildStyleContext()` formats rated items into a prompt block injected into both Train and regular Search calls. The Train tab has a seed URL box, a Find button that calls Claude, ratable result cards, and an editable memory panel.

**Tech Stack:** Vanilla JS, Claude API (`claude-sonnet-4-5`) with `web_search_20250305` tool, localStorage.

---

### Task 1: Replace `styles` with `styleMemory` + `styleSeeds` in state and persistence

**Files:**
- Modify: `index.html` (state declaration, loadState, save)

- [ ] **Step 1: Update state declaration**

Find and replace this block:
```js
  // AI memory: outcomes the model learns from
  memory: [],  // {type:'bought'|'passed', brand_tier, era, condition, platform, buy_price_sek, sell_price_sek, score, verdict, note, ts}
  styles: ''   // notable styles/items to watch for, injected into search prompt
};
```
Replace with:
```js
  // AI memory: outcomes the model learns from
  memory:      [],  // {type:'bought'|'passed', brand_tier, era, condition, platform, buy_price_sek, sell_price_sek, score, verdict, note, ts}
  styleMemory: [],  // {url, title, brand, era, condition, style_notes, rating:'good'|'bad', ts}
  styleSeeds:  ''   // raw seed URLs textarea content
};
```

- [ ] **Step 2: Update loadState**

Find:
```js
    const m = localStorage.getItem('ski_memory');
    const y = localStorage.getItem('ski_styles');
    if (d) S.deals    = JSON.parse(d);
    if (b) S.brands   = JSON.parse(b);
    if (k) S.apiKey   = k;
    if (n) S.teamName = n;
    if (m) S.memory   = JSON.parse(m);
    if (y) S.styles   = y;
```
Replace with:
```js
    const m  = localStorage.getItem('ski_memory');
    const sm = localStorage.getItem('ski_style_memory');
    const ss = localStorage.getItem('ski_style_seeds');
    if (d)  S.deals       = JSON.parse(d);
    if (b)  S.brands      = JSON.parse(b);
    if (k)  S.apiKey      = k;
    if (n)  S.teamName    = n;
    if (m)  S.memory      = JSON.parse(m);
    if (sm) S.styleMemory = JSON.parse(sm);
    if (ss) S.styleSeeds  = ss;
```

- [ ] **Step 3: Update save()**

Find:
```js
    localStorage.setItem('ski_memory',   JSON.stringify(S.memory));
    localStorage.setItem('ski_styles',   S.styles);
```
Replace with:
```js
    localStorage.setItem('ski_memory',       JSON.stringify(S.memory));
    localStorage.setItem('ski_style_memory', JSON.stringify(S.styleMemory));
    localStorage.setItem('ski_style_seeds',  S.styleSeeds);
```

- [ ] **Step 4: Verify in browser**

Open `index.html` in browser. Open DevTools console. Run:
```js
save(); localStorage.getItem('ski_style_memory')
```
Expected: `"[]"`

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "refactor: replace styles field with styleMemory + styleSeeds in state"
```

---

### Task 2: Add buildStyleContext()

**Files:**
- Modify: `index.html` (add function after `buildLearnedContext`)

- [ ] **Step 1: Add the function**

Find:
```js
function addMemory(entry) {
```
Insert immediately before it:
```js
// ─── Build style preference context to inject into prompts ───
function buildStyleContext() {
  if (!S.styleMemory.length) return '';
  const good = S.styleMemory.filter(m => m.rating === 'good');
  const bad  = S.styleMemory.filter(m => m.rating === 'bad');
  let ctx = '\n\n═══ LEARNED STYLE PREFERENCES ═══\nUse these to calibrate what this team is looking for:\n\n';
  if (good.length) {
    ctx += 'LIKED (find more like these):\n';
    good.slice(-20).forEach(m => {
      ctx += `• ${m.brand||'?'} | ${m.era||'?'} | ${m.condition||'?'} | ${m.style_notes||''}\n`;
    });
    ctx += '\n';
  }
  if (bad.length) {
    ctx += 'DISLIKED (avoid these patterns):\n';
    bad.slice(-10).forEach(m => {
      ctx += `• ${m.brand||'?'} | ${m.era||'?'} | ${m.condition||'?'} | ${m.style_notes||''}\n`;
    });
    ctx += '\n';
  }
  ctx += 'Prioritise listings that match the LIKED patterns. Deprioritise DISLIKED patterns.\n';
  return ctx;
}

```

- [ ] **Step 2: Verify in browser console**

Add a test entry and call the function:
```js
S.styleMemory.push({brand:'Bogner',era:'80s',condition:'good',style_notes:'colorblock bib',rating:'good',ts:''});
console.log(buildStyleContext());
```
Expected: a text block starting with `═══ LEARNED STYLE PREFERENCES ═══` with a LIKED section.

- [ ] **Step 3: Commit**
```bash
git add index.html
git commit -m "feat: add buildStyleContext() for style memory prompt injection"
```

---

### Task 3: Remove "Notable styles" from Settings, wire buildStyleContext into Search

**Files:**
- Modify: `index.html` (settings HTML, renderSettings, saveStyles, runAiSearch)

- [ ] **Step 1: Remove the notable styles HTML card from Settings tab**

Find and delete this entire block:
```html
  <div class="card col" style="margin-bottom:14px;border-color:rgba(139,124,246,.25);">
    <div class="lbl" style="color:var(--accent);margin-bottom:6px;">Notable styles to watch for</div>
    <p style="color:var(--muted);font-size:11px;line-height:1.6;margin-bottom:8px;">
      List niche styles, cuts, or items the AI should actively look for when searching — one per line.
      E.g. "studded ski pants", "stirrup ski pants", "one-piece bib suits", "Gore-Tex shell 90s".
    </p>
    <textarea id="styles-input" placeholder="studded ski pants&#10;stirrup pants&#10;one-piece bib suit&#10;Gore-Tex shell 90s" style="min-height:90px;"></textarea>
    <div style="margin-top:6px;">
      <button class="btn btn-sm btn-primary" onclick="saveStyles()">Save</button>
    </div>
  </div>
```

- [ ] **Step 2: Remove styles-input line from renderSettings**

Find:
```js
function renderSettings() {
  document.getElementById('api-key-input').value   = S.apiKey;
  document.getElementById('team-name-input').value = S.teamName;
  document.getElementById('styles-input').value    = S.styles;
  renderBrandList();
  updateMemoryCount();
}
```
Replace with:
```js
function renderSettings() {
  document.getElementById('api-key-input').value   = S.apiKey;
  document.getElementById('team-name-input').value = S.teamName;
  renderBrandList();
  updateMemoryCount();
}
```

- [ ] **Step 3: Remove saveStyles() function**

Find and delete:
```js
function saveStyles() {
  S.styles = document.getElementById('styles-input').value;
  save(); toast('Styles saved — AI will use these in all searches', 'success');
}

```

- [ ] **Step 4: Update runAiSearch to use buildStyleContext**

Find:
```js
    const learned = buildLearnedContext();
    const stylesCtx = S.styles.trim() ? `\n\n═══ NOTABLE STYLES TO ACTIVELY SEARCH FOR ═══\nThis team has flagged these specific styles/items as high-value finds — prioritise them:\n${S.styles.trim()}\n` : '';
    const systemPrompt = SEARCH_BASE + stylesCtx + learned;
```
Replace with:
```js
    const learned      = buildLearnedContext();
    const styleCtx     = buildStyleContext();
    const systemPrompt = SEARCH_BASE + styleCtx + learned;
```

- [ ] **Step 5: Verify Settings tab renders without errors**

Open `index.html`, go to Settings. Confirm no JS errors in console and the "Notable styles" card is gone.

- [ ] **Step 6: Commit**
```bash
git add index.html
git commit -m "refactor: remove notable styles, wire buildStyleContext into Search tab"
```

---

### Task 4: Add Train tab HTML

**Files:**
- Modify: `index.html` (nav, tab content)

- [ ] **Step 1: Add Train nav tab**

Find:
```html
  <button class="nav-tab" data-tab="settings" onclick="switchTab('settings')">Settings</button>
```
Replace with:
```html
  <button class="nav-tab" data-tab="train" onclick="switchTab('train')">Train</button>
  <button class="nav-tab" data-tab="settings" onclick="switchTab('settings')">Settings</button>
```

- [ ] **Step 2: Add Train tab content**

Find the Settings tab opening tag:
```html
<!-- ══════════════ SETTINGS ══════════════ -->
```
Insert immediately before it:
```html
<!-- ══════════════ TRAIN ══════════════ -->
<div id="tab-train" class="tab-content">
  <div class="row" style="justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
    <div class="section-title" style="margin:0;">Style Training</div>
    <div id="train-counter" style="font-size:11px;color:var(--muted);"></div>
  </div>

  <details id="train-seed-details" style="margin-bottom:16px;">
    <summary style="cursor:pointer;color:var(--accent);font-size:11px;letter-spacing:1px;text-transform:uppercase;list-style:none;display:flex;align-items:center;gap:6px;">
      <span>▸</span> Seed with example URLs <span style="color:var(--muted);font-weight:normal;text-transform:none;letter-spacing:0;">(optional)</span>
    </summary>
    <div class="card col" style="margin-top:10px;gap:10px;">
      <p style="color:var(--muted);font-size:11px;line-height:1.6;">
        Paste URLs of items you like — one per line. The AI will visit them and use their style as a reference.
        Skip this once you have rated items.
      </p>
      <textarea id="seed-urls" placeholder="https://www.sellpy.se/item/...&#10;https://www.tradera.com/item/..." style="min-height:80px;" onblur="saveSeedUrls()"></textarea>
    </div>
  </details>

  <div style="margin-bottom:20px;">
    <button class="btn btn-primary" id="train-btn" onclick="runStyleSearch()">Find items ↗</button>
  </div>

  <div id="train-status" style="display:none;" class="row" style="margin-bottom:12px;">
    <span class="spinner"></span>
    <span style="color:var(--muted);font-size:12px;" id="train-status-text">Searching…</span>
  </div>

  <div id="train-results"></div>
  <div id="style-memory-panel"></div>
</div>

```

- [ ] **Step 3: Verify tab renders**

Open `index.html`, click the Train nav tab. The tab should be visible with the section title, a collapsed seed box, and a "Find items" button. No JS errors.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "feat: add Train tab HTML skeleton"
```

---

### Task 5: Train tab — runStyleSearch and card rendering

**Files:**
- Modify: `index.html` (add JS section for Train tab)

- [ ] **Step 1: Add module-level variable and saveSeedUrls**

Find the comment:
```js
// ═══════════════════════════════════════════════
//  NAV
```
Insert immediately before it:
```js
// ═══════════════════════════════════════════════
//  TRAIN TAB
// ═══════════════════════════════════════════════
let styleResults = [];

function saveSeedUrls() {
  S.styleSeeds = document.getElementById('seed-urls').value;
  save();
}

```

- [ ] **Step 2: Add runStyleSearch**

Directly after the `saveSeedUrls` function, add:
```js
async function runStyleSearch() {
  if (!S.apiKey) { toast('Set your API key in Settings', 'error'); switchTab('settings'); return; }

  const btn       = document.getElementById('train-btn');
  const status    = document.getElementById('train-status');
  const statusTxt = document.getElementById('train-status-text');
  const resultsDiv = document.getElementById('train-results');

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Searching…';
  status.style.display = 'flex'; statusTxt.textContent = 'Finding items that match your style…';
  resultsDiv.innerHTML = '';
  styleResults = [];

  try {
    const styleCtx  = buildStyleContext();
    const seedLines = S.styleSeeds.trim().split('\n').filter(l => l.trim());
    const seedCtx   = seedLines.length
      ? `\n\n═══ SEED EXAMPLES FROM USER ═══\nThe user provided these specific listings as style references. Visit each URL and use their aesthetic as a search target:\n${seedLines.join('\n')}\n`
      : '';
    const systemPrompt = SEARCH_BASE + styleCtx + seedCtx;
    const userMsg = (styleCtx || seedCtx)
      ? 'Find 8-10 vintage ski/snowboard clothing listings that match the learned style preferences and seed examples above. Search tradera.com, vinted.se, sellpy.se, ebay.com, blocket.se, tise.com. Return as JSON array — same format as usual but add a "style_notes" field (max 10 words describing the key aesthetic of each item).'
      : 'Find 8-10 interesting vintage ski/snowboard clothing listings across tradera.com, vinted.se, sellpy.se, ebay.com, blocket.se, tise.com. Return as JSON array with a "style_notes" field (max 10 words on key aesthetic).';

    const results = await callClaudeSearch(userMsg, systemPrompt);
    styleResults = results;
    status.style.display = 'none';

    if (!results.length) {
      resultsDiv.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:16px 0;">No results found. Try adding seed URLs or rating more items.</div>`;
    } else {
      resultsDiv.innerHTML = `
        <div style="color:var(--muted);font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">${results.length} items — rate each one to train your style</div>
        <div class="deal-grid">${results.map((r, i) => styleResultHtml(r, i)).join('')}</div>`;
    }
  } catch(e) {
    status.style.display = 'none';
    resultsDiv.innerHTML = `<div class="result-card" style="border-color:var(--red);">
      <div style="color:var(--red);font-weight:bold;margin-bottom:8px;">Search error</div>
      <pre style="white-space:pre-wrap;color:var(--muted);font-size:11px;">${esc(e.message)}</pre>
      <button class="btn btn-sm" style="margin-top:12px;" onclick="runStyleSearch()">Retry</button>
    </div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = 'Find items ↗';
  }
}

```

- [ ] **Step 3: Add styleResultHtml**

Directly after `runStyleSearch`, add:
```js
function styleResultHtml(r, idx) {
  const priceTxt = r.price_sek != null ? `${r.price_sek} SEK` : (r.price_raw || '?');
  return `<div class="deal-card" id="style-card-${idx}">
    <div class="deal-card-top">
      <div class="deal-card-meta">
        <div style="font-size:13px;font-weight:bold;margin-bottom:4px;">${esc(r.title||'Untitled')}</div>
        <div class="row" style="gap:5px;flex-wrap:wrap;margin-bottom:4px;">
          ${r.brand&&r.brand!=='unknown'?`<span class="tag">${esc(r.brand)}</span>`:''}
          ${r.era&&r.era!=='unknown'?`<span class="tag">${esc(r.era)}</span>`:''}
          ${r.platform?`<span class="tag tag-plat">${esc(r.platform)}</span>`:''}
        </div>
        ${r.style_notes?`<div style="font-size:11px;color:var(--accent);margin-top:2px;">↳ ${esc(r.style_notes)}</div>`:''}
      </div>
      <div style="font-size:15px;color:var(--green);font-weight:bold;white-space:nowrap;">${esc(priceTxt)}</div>
    </div>
    ${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener" class="btn btn-sm" style="width:fit-content;">Open ↗</a>`:''}
    <div class="deal-card-actions">
      <button class="btn btn-sm" id="style-good-${idx}" onclick="rateStyleItem(${idx},'good')">Good</button>
      <button class="btn btn-sm" id="style-bad-${idx}"  onclick="rateStyleItem(${idx},'bad')">Bad</button>
      <button class="btn btn-sm" id="style-nope-${idx}" onclick="dismissStyleCard(${idx})">Not working</button>
    </div>
  </div>`;
}

```

- [ ] **Step 4: Verify card rendering**

Open `index.html`, go to Train tab, click "Find items". Cards should appear with Good/Bad/Not working buttons. Open/Not working should work. (Rating will be wired in Task 6.)

- [ ] **Step 5: Commit**
```bash
git add index.html
git commit -m "feat: Train tab — runStyleSearch and card rendering"
```

---

### Task 6: Rating functions

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add rateStyleItem and dismissStyleCard**

Directly after `styleResultHtml`, add:
```js
function rateStyleItem(idx, rating) {
  const r = styleResults[idx];
  if (!r) return;

  // Remove existing entry for this URL if re-rating
  S.styleMemory = S.styleMemory.filter(m => m.url !== r.url);
  S.styleMemory.push({
    url:         r.url || '',
    title:       r.title || '',
    brand:       r.brand || 'unknown',
    era:         r.era || 'unknown',
    condition:   r.condition || 'unknown',
    style_notes: r.style_notes || '',
    rating,
    ts: new Date().toISOString()
  });
  if (S.styleMemory.length > 60) S.styleMemory = S.styleMemory.slice(-60);
  save();
  updateTrainCounter();

  // Update button styles to show selection
  const goodBtn = document.getElementById(`style-good-${idx}`);
  const badBtn  = document.getElementById(`style-bad-${idx}`);
  if (goodBtn) {
    goodBtn.style.background  = rating === 'good' ? 'var(--green)' : '';
    goodBtn.style.color       = rating === 'good' ? '#000' : '';
    goodBtn.style.borderColor = rating === 'good' ? 'var(--green)' : '';
  }
  if (badBtn) {
    badBtn.style.background   = rating === 'bad' ? 'var(--red)' : '';
    badBtn.style.color        = rating === 'bad' ? '#fff' : '';
    badBtn.style.borderColor  = rating === 'bad' ? 'var(--red)' : '';
  }

  renderStyleMemoryPanel();
  toast(rating === 'good' ? 'Marked Good — style memory updated' : 'Marked Bad — style memory updated', 'success');
}

function dismissStyleCard(idx) {
  const card = document.getElementById(`style-card-${idx}`);
  if (card) card.style.display = 'none';
}

```

- [ ] **Step 2: Verify rating**

Open Train tab, click Find items, rate a card Good. Button should turn green. Rate it Bad — button should switch to red. Open DevTools: `S.styleMemory` should have one entry.

- [ ] **Step 3: Verify re-rating**

Rate the same card Good, then Bad. `S.styleMemory` should still have only one entry for that URL with rating `'bad'`.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "feat: Train tab — Good/Bad/Not working rating functions"
```

---

### Task 7: Style memory panel (view + edit rated items)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add renderStyleMemoryPanel, toggleStyleRating, removeStyleItem, clearStyleMemory, updateTrainCounter**

Directly after `dismissStyleCard`, add:
```js
function renderStyleMemoryPanel() {
  const panel = document.getElementById('style-memory-panel');
  if (!panel) return;
  if (!S.styleMemory.length) { panel.innerHTML = ''; return; }

  panel.innerHTML = `
    <hr>
    <div class="section-title" style="margin-bottom:12px;">Rated Items <span style="color:var(--muted);font-weight:normal;font-size:10px;">(${S.styleMemory.length})</span></div>
    <div class="col" style="gap:6px;">
      ${S.styleMemory.map((m, i) => `
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:8px 10px;font-size:11px;">
          <button class="btn btn-sm" style="min-width:52px;background:${m.rating==='good'?'var(--green)':'var(--red)'};color:${m.rating==='good'?'#000':'#fff'};border-color:${m.rating==='good'?'var(--green)':'var(--red)'}" onclick="toggleStyleRating(${i})">${m.rating==='good'?'Good':'Bad'}</button>
          <div style="flex:1;min-width:0;">
            <div style="color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.title||m.url)}</div>
            <div style="color:var(--muted);margin-top:2px;">${esc([m.brand,m.era,m.style_notes].filter(Boolean).join(' · '))}</div>
          </div>
          <button class="btn btn-sm" style="color:var(--muted);padding:4px 7px;" onclick="removeStyleItem(${i})" title="Remove">×</button>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:10px;">
      <button class="btn btn-sm btn-danger" onclick="clearStyleMemory()">Clear style memory</button>
    </div>`;
}

function toggleStyleRating(idx) {
  if (!S.styleMemory[idx]) return;
  S.styleMemory[idx].rating = S.styleMemory[idx].rating === 'good' ? 'bad' : 'good';
  save();
  renderStyleMemoryPanel();
  updateTrainCounter();
}

function removeStyleItem(idx) {
  S.styleMemory.splice(idx, 1);
  save();
  renderStyleMemoryPanel();
  updateTrainCounter();
}

function clearStyleMemory() {
  if (!confirm('Clear all style memory? The AI will lose its learned style calibration.')) return;
  S.styleMemory = [];
  save();
  renderStyleMemoryPanel();
  updateTrainCounter();
  toast('Style memory cleared', 'info');
}

function updateTrainCounter() {
  const el = document.getElementById('train-counter');
  if (!el) return;
  const good = S.styleMemory.filter(m => m.rating === 'good').length;
  const bad  = S.styleMemory.filter(m => m.rating === 'bad').length;
  el.textContent = S.styleMemory.length ? `● ${good} good · ${bad} bad` : '(no style memory yet)';
}

```

- [ ] **Step 2: Verify memory panel**

Rate 2–3 cards. A "Rated Items" section should appear below results. Click the Good/Bad toggle on a row — it should flip. Click × — row should disappear. Counter at top should update.

- [ ] **Step 3: Verify persistence**

Reload the page, go to Train tab. Rated items panel should still be populated from localStorage.

- [ ] **Step 4: Commit**
```bash
git add index.html
git commit -m "feat: Train tab — editable style memory panel with toggle, remove, clear"
```

---

### Task 8: Wire up renderTrain and switchTab

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add renderTrain function**

Find:
```js
function renderSettings() {
```
Insert immediately before it:
```js
function renderTrain() {
  const seedEl = document.getElementById('seed-urls');
  if (seedEl) seedEl.value = S.styleSeeds;
  updateTrainCounter();
  renderStyleMemoryPanel();
}

```

- [ ] **Step 2: Add Train to switchTab**

Find:
```js
  if (name === 'board')    renderBoard();
  if (name === 'settings') renderSettings();
  if (name === 'search')   renderSearchUI();
```
Replace with:
```js
  if (name === 'board')    renderBoard();
  if (name === 'settings') renderSettings();
  if (name === 'search')   renderSearchUI();
  if (name === 'train')    renderTrain();
```

- [ ] **Step 3: Full end-to-end verification**

1. Open `index.html` in browser
2. Go to Train tab — counter shows `(no style memory yet)`, seed box is collapsible
3. Expand seed box, paste a Sellpy URL, click away — reload page, re-open Train tab, seed URL should still be there
4. Click Find items — spinner appears, results load as cards
5. Click Good on a card — button turns green, counter updates, memory panel appears below
6. Click Bad on another card — button turns red
7. In memory panel, click toggle on a Good item — it flips to Bad
8. Click × on an item — it's removed
9. Go to Search tab, run a search — no JS errors (buildStyleContext is now injecting style memory silently)
10. Go to Settings — no notable styles card, no JS errors

- [ ] **Step 4: Final commit and push**
```bash
git add index.html
git commit -m "feat: style training tab — full implementation with persistent style memory"
git push
```
