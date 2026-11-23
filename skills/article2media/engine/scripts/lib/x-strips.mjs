// X 版长图: a long page cut into strips that X keeps at full width. Two versions use it: the X version (the default
// --x: the model's text-first draft laid out as one continuous column, see buildX in layout-long.mjs) and the full
// version (--x full: every phone page as it is).
//
// X fits every picture into a 4096 px long side and its phone app shows the 2048 px version by default, so a
// 1080 × 9000+ phone page arrives 240–480 px wide: unreadable on a phone and blurry on a desktop, which scales it
// back up. A strip no taller than ~3× its width keeps the phone page's own typography (body ≈ 3% of the width):
// on a phone it fills the screen with ~9 pt body text and no zoom, on a desktop it is sharp.
//
// Cuts fall in the gaps between blocks: section boundaries first, then between a section's text and its figures,
// then between paragraphs, figures and panels. Never right after a heading or label, never between a figure and
// its caption. Cutting through a card (a figure, a panel, a checklist stage) is the last resort and is reported.
// Nothing here launches Chrome: measureCuts runs inside the rendered page, the rest is pure.

export const X_STRIP = {
  scale: 2, // the phone page is 540 CSS px wide → 1080 px strips
  maxPx: 4096, // X's long-side cap: a strip is never taller, padding included
  prefRatio: 3, // aim for height ≤ 3 × width (fills a phone screen, readable without zoom)
  looseRatio: 10 / 3, // one strip fewer is fine while every strip stays under this
  margin: 18, // CSS px of background kept above and below a cut (padded when the gap is narrower)
  minPiece: 240, // CSS px: no stub strips
  perPost: 20, // pictures per X post (20 since Nov 2026; it was 4)
};

// The X version (text first): the phone page's column and type, strips about as tall as a phone screen. X's phone
// viewer fits a picture to the screen, so a strip of ~2.2 × its width fills it edge to edge and its 17.5 px body
// (3.2% of the width) shows at ≈ 12 pt; a taller one shrinks to fit and wastes the screen's sides.
export const X_TEXT = { ...X_STRIP, width: 540, prefRatio: 2.2, looseRatio: 2.45, capRatio: 2.6 };

const PENALTY = { 3: 0, 2: 150, 1: 300, 0: 3000, '-1': 20000 };

/**
 * Runs in the page (serialized by page.evaluate, so it must stay self-contained). Returns the document height and
 * every place the page can be cut: { H, cands: [{ y, gap, level, box }] } in CSS px.
 * level 3 = between page blocks (sections), 2 = inside a section, 1 = inside a flow column, 0 = through a card.
 */
export function measureCuts() {
  const H = Math.ceil(document.documentElement.scrollHeight);
  const root = document.querySelector('.page') || document.body;
  const FLOW = [['.page', 3], ['.sec', 2], ['.xt-sec', 2], ['.sec-text, .sec-vis, .figs, .cl-grid, .sec-bullets, .pg-head, .pg-head-main, .xt-quote, .xt-list', 1]];
  // In the X version a heading or an excerpt's label leads into what follows; the editor's comment stays with what it is about.
  const KEEP_NEXT = '.sec-label, .sec-h, .pg-top, .pg-title, .pg-part, .xt-h, .xt-who, .xt-intro, .cl-head, .cl-label, .cl-title, .p-title, .fig-id, .st-head, h1, h2, h3, h4, h5, h6';
  const KEEP_PREV = '.fig-cap, .sec-take, .xt-note, .xt-table-note, .cl-done, .cl-guard-note, .cl-note, .fx-note';
  const levelOf = (e) => { for (const [sel, l] of FLOW) if (e.matches(sel)) return l; return 0; };
  const ignored = (e) => {
    if (e.closest('[data-deco], [aria-hidden="true"]')) return true;
    const cs = getComputedStyle(e);
    return cs.display === 'none' || cs.visibility === 'hidden' || ((cs.position === 'absolute' || cs.position === 'fixed') && e.getBoundingClientRect().height > 0.5 * H);
  };
  // Where an element actually draws, not its box: a section's divider is its top border and the space above its
  // content is padding, so two boxes can touch while the ink between them is 40 px apart. Ink = text, replaced
  // content, background, shadow, generated content (both edges); a top / bottom border (that edge only); else the
  // union of the children's ink.
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const inkMemo = new Map();
  const ink = (e) => {
    if (inkMemo.has(e)) return inkMemo.get(e);
    let r = null;
    const rect = e.getBoundingClientRect();
    if (!ignored(e) && rect.height > 0) {
      const top = rect.top + scrollY, bottom = rect.bottom + scrollY;
      const cs = getComputedStyle(e);
      const pseudo = ['::before', '::after'].some((p) => !/^(none|normal)$/.test(getComputedStyle(e, p).content));
      const fill = /^(IMG|svg|CANVAS|VIDEO|HR|INPUT|IFRAME)$/i.test(e.tagName) || cs.backgroundImage !== 'none' || !clear(cs.backgroundColor) || cs.boxShadow !== 'none' || pseudo ||
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const edge = (s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !clear(cs[`border${s}Color`]);
      if (fill) r = { top, bottom };
      else {
        for (const c of e.children) { const k = ink(c); if (k) r = r ? { top: Math.min(r.top, k.top), bottom: Math.max(r.bottom, k.bottom) } : { ...k }; }
        if (edge('Top')) r = { top, bottom: r ? r.bottom : top + parseFloat(cs.borderTopWidth) };
        if (edge('Bottom')) r = { top: r ? r.top : bottom - parseFloat(cs.borderBottomWidth), bottom };
      }
    }
    inkMemo.set(e, r);
    return r;
  };
  const els = [...root.querySelectorAll('*')].map((e) => ({ e, k: ink(e) })).filter((x) => x.k);
  const cands = [];
  let pid = 0;
  for (const parent of [root, ...root.querySelectorAll('*')]) {
    if (parent.children.length < 2 || ignored(parent)) continue;
    parent.dataset.xcut = String(++pid); // renderStrips finds the container of a cut by this
    const kids = [...parent.children].map((e) => ({ e, k: ink(e) })).filter((x) => x.k).sort((a, b) => a.k.top - b.k.top);
    const level = levelOf(parent);
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1], b = kids[i];
      const gap = b.k.top - a.k.bottom;
      if (gap < 0) continue;
      const y = (a.k.bottom + b.k.top) / 2;
      // [data-x-break]: the picture ends after this block, whatever the heights.
      if (a.e.hasAttribute('data-x-break')) { cands.push({ y, gap, level: 3, pid: parent.dataset.xcut, box: '', forced: true }); continue; }
      if (a.e.matches(KEEP_NEXT) || b.e.matches(KEEP_PREV)) continue;
      // Anything else drawn across the line (a neighbouring column, a taller sibling) would be sliced.
      if (els.some((x) => x.k.top < y - 0.5 && x.k.bottom > y + 0.5 && !x.e.contains(a.e))) continue;
      cands.push({ y, gap, level, pid: parent.dataset.xcut, box: level ? '' : String(parent.getAttribute('class') || parent.tagName).split(' ')[0] });
    }
  }
  return { H, cands };
}

/**
 * Pure: choose the cuts. H and every y are CSS px. Returns the strips in order:
 * [{ y0, y1, padTop, padBot, px, level, box, pidTop, pidBot }] — px is the strip's height in image px, padding
 * included; level / box describe the cut that ends the strip (3 for the last one); pidTop / pidBot name the
 * container each cut runs through (its background fills the padding). Throws only when H is not a number.
 */
export function planStrips(H, cands, opt = {}) {
  const o = { ...X_STRIP, ...opt };
  if (!(H > 0)) throw new Error('planStrips: bad height');
  const padOf = (c) => (c ? Math.max(0, o.margin - c.gap / 2) : 0);
  // Forced cuts (forced: true) split the page into parts planned one by one; a part's end gets the cut's padding.
  const forced = cands.filter((c) => c.forced && c.y > 0 && c.y < H).sort((a, b) => a.y - b.y);
  if (forced.length) {
    const ends = [{ y: 0 }, ...forced, { y: H }];
    const out = [];
    for (let i = 0; i + 1 < ends.length; i++) {
      const a = ends[i], b = ends[i + 1];
      const top = i ? padOf(a) : 0, bot = i + 2 < ends.length ? padOf(b) : 0;
      const sub = cands.filter((c) => !c.forced && c.y > a.y && c.y < b.y).map((c) => ({ ...c, y: c.y - a.y }));
      const part = planStrips(b.y - a.y, sub, { ...opt, maxPx: o.maxPx - Math.ceil((top + bot) * o.scale) });
      for (const s of part) { s.y0 += a.y; s.y1 += a.y; }
      Object.assign(part[0], { padTop: top, pidTop: a.pid });
      if (bot) Object.assign(part.at(-1), { padBot: bot, pidBot: b.pid, level: b.level, box: b.box || '' });
      for (const s of part) s.px = Math.round((s.y1 - s.y0 + s.padTop + s.padBot) * o.scale);
      out.push(...part);
    }
    return out;
  }
  const W = 1080 / o.scale;
  // capRatio: a tighter limit than X's own (the X version keeps its type large in X's fit-to-screen viewer).
  const pref = W * o.prefRatio, loose = W * o.looseRatio, cap = Math.min(o.maxPx / o.scale, o.capRatio ? W * o.capRatio : Infinity);
  const real = [...cands].filter((c) => c.y > 0 && c.y < H).sort((a, b) => a.y - b.y);
  // Last resort when a block taller than a strip has no gap: a raw cut every 20 px, reported as such.
  const raw = [];
  for (let y = 20; y < H; y += 20) raw.push({ y, gap: 0, level: -1, box: '' });
  const solve = (pts, n) => {
    const target = H / n;
    const dp = Array.from({ length: n + 1 }, () => new Array(pts.length).fill(Infinity));
    const from = Array.from({ length: n + 1 }, () => new Array(pts.length).fill(-1));
    dp[0][0] = 0;
    const last = pts.length - 1;
    for (let k = 1; k <= n; k++) for (let j = 1; j < pts.length; j++) {
      if (k === n && j !== last) continue; // the last piece ends at the page bottom
      for (let i = j - 1; i >= 0; i--) {
        const len = pts[j].y - pts[i].y;
        if (len > cap) break; // i only gets smaller from here, len only longer
        if (dp[k - 1][i] === Infinity) continue;
        const pads = (i ? padOf(pts[i]) : 0) + (j === last ? 0 : padOf(pts[j]));
        if (len + pads > cap) continue;
        if (len < o.minPiece && n > 1) continue;
        const c = dp[k - 1][i] + Math.abs(len - target) + Math.max(0, len - pref) * 2 + (j === last ? 0 : PENALTY[pts[j].level] ?? 0);
        if (c < dp[k][j]) { dp[k][j] = c; from[k][j] = i; }
      }
    }
    if (dp[n][last] === Infinity) return null;
    const idx = [];
    for (let k = n, j = last; k > 0; j = from[k][j], k--) idx.unshift(j);
    return idx;
  };
  let n = Math.max(1, Math.ceil(H / pref));
  if (n > 1 && H / (n - 1) <= loose) n -= 1;
  for (const pool of [real, [...real, ...raw].sort((a, b) => a.y - b.y)]) {
    const pts = [{ y: 0, gap: 0, level: 3 }, ...pool, { y: H, gap: 0, level: 3 }];
    // The fewest strips that fit; but when that count only fits by cutting through a card, up to two more strips
    // that cut between blocks are better.
    let first = null, firstM = 0;
    for (let m = n; m <= n + 40; m++) {
      if (first && m > firstM + 2) break;
      const got = solve(pts, m);
      if (!got) continue;
      if (!first) { first = got; firstM = m; }
      if (got.slice(0, -1).every((j) => pts[j].level >= 1)) { first = got; break; }
    }
    if (first) {
      const idx = first;
      let prev = 0;
      return idx.map((j) => {
        const a = pts[prev], b = pts[j];
        const padTop = prev ? padOf(a) : 0, padBot = j === pts.length - 1 ? 0 : padOf(b);
        prev = j;
        return { y0: a.y, y1: b.y, padTop, padBot, px: Math.round((b.y - a.y + padTop + padBot) * o.scale), level: b.level, box: b.box || '', pidTop: a.pid, pidBot: b.pid };
      });
    }
  }
  throw new Error('planStrips: no plan');
}

/**
 * Pure: group strips into X posts of at most `perPost` pictures. A page's strips stay together (a page with more
 * than perPost is split evenly on its own); consecutive pages share a post when they fit. Fewest posts first, then
 * the most even ones (4/3/2 rather than 4/4/1). pages: [{ page, n }] in order. Returns [[{ page, k }]].
 */
export function groupPosts(pages, perPost = X_STRIP.perPost) {
  const split = (n) => { const parts = Math.ceil(n / perPost), sizes = []; for (let p = 0, left = n; p < parts; p++) { const s = Math.ceil(left / (parts - p)); sizes.push(s); left -= s; } return sizes; };
  const better = (a, b) => !b || a.posts < b.posts || (a.posts === b.posts && a.slack < b.slack);
  const f = [{ posts: 0, slack: 0, from: -1 }];
  for (let i = 1; i <= pages.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const run = pages.slice(j, i), sum = run.reduce((a, p) => a + p.n, 0);
      let cost;
      if (run.length === 1 && sum > perPost) cost = split(sum).reduce((a, s) => ({ posts: a.posts + 1, slack: a.slack + (perPost - s) ** 2 }), { posts: 0, slack: 0 });
      else if (sum <= perPost) cost = { posts: 1, slack: (perPost - sum) ** 2 };
      else break; // a longer run only gets bigger
      const c = { posts: f[j].posts + cost.posts, slack: f[j].slack + cost.slack, from: j };
      if (better(c, f[i])) f[i] = c;
    }
  }
  const runs = [];
  for (let i = pages.length; i > 0; i = f[i].from) runs.unshift(pages.slice(f[i].from, i));
  const posts = [];
  for (const run of runs) {
    const strips = run.flatMap(({ page, n }) => Array.from({ length: n }, (_, k) => ({ page, k: k + 1 })));
    if (strips.length <= perPost) { posts.push(strips); continue; }
    let at = 0;
    for (const s of split(strips.length)) { posts.push(strips.slice(at, at + s)); at += s; }
  }
  return posts;
}

/** File name of strip k of page p: x-01-1.png (sorts in upload order). */
export const stripName = (page, k, ext = 'png') => `x-${String(page).padStart(2, '0')}-${k}.${ext}`;
/** Page and strip number back from a file name, or null. */
export const parseStripName = (f) => { const m = String(f).match(/^x-(\d+)-(\d+)\.(png|jpe?g)$/); return m ? { page: Number(m[1]), k: Number(m[2]) } : null; };
