// "long" layout: one tall page per content page — phone width by default (540 CSS px, one column),
// or the wide magazine page (1200 CSS px, text beside figures) with ctx.wide.
import { esc, md, pad2, plain } from './markup.mjs';
import { renderFigure } from './figures.mjs';
import { coverIllustrationSrc, coverIllustrationAspect } from './illustrations.mjs';

export const LABELS = {
  zh: {
    page: (i, n) => `第 ${pad2(i)} / ${pad2(n)} 页`,
    pageShort: (i, n) => `第 ${i} / ${n} 页`,
    fig: '图',
    done: '做完的标准：',
    footnote: (s, editor, ill = false) =>
      `来源：${[s.author && `${s.author}${s.handle ? `（${s.handle}）` : ''}`, s.title && `《${s.title}》`, s.platform, s.date]
        .filter(Boolean)
        .join('，')}。框架标签、表格与清单由${editor}整理${ill ? '；插图仅作示意' : ''}。`,
  },
  en: {
    page: (i, n) => `Page ${pad2(i)} / ${pad2(n)}`,
    pageShort: (i, n) => `Page ${i} / ${n}`,
    fig: 'Fig.',
    done: 'Done when: ',
    footnote: (s, editor, ill = false) =>
      `Source: ${[s.author && `${s.author}${s.handle ? ` (${s.handle})` : ''}`, s.title && `“${s.title}”`, s.platform, s.date]
        .filter(Boolean)
        .join(', ')}. Labels, tables and checklists by ${editor}${ill ? '; illustrations are schematic' : ''}.`,
  },
};

// Phone-width pages stack their figures, so a fixed canvas height would leave short figures (a comparison,
// three bars) floating in an empty panel. Shrink each canvas to what it actually draws. Figures laid out
// on an absolute stage (converge / tree / path) and SVG charts fill their canvas and are left alone.
const HUG_SCRIPT = `<script>
window.__hug = function () {
  document.querySelectorAll('.fig-canvas').forEach(function (cv) {
    cv.style.height = '';
    if (cv.querySelector('.cv, .tr, .pa, .fig-svg, .ill, .im')) return;
    var c = cv.getBoundingClientRect(), t = 1e9, b = -1e9;
    cv.querySelectorAll('*').forEach(function (el) {
      if (el.closest('.fx-note')) return; // the note sits at the canvas bottom; it is added back below
      var solid = el.matches('.box, .cmp-col, .hb-row, .hb-axis, .ill-missing');
      if (!solid && el.children.length) return;
      var e = el.getBoundingClientRect();
      if (e.width < 1 || e.height < 1) return;
      t = Math.min(t, e.top); b = Math.max(b, e.bottom);
    });
    if (b < t) return;
    var note = cv.querySelector('.fx-note');
    var ratio = (b - t + (note ? note.getBoundingClientRect().height : 0)) / c.height;
    if (ratio < 0.86) cv.style.height = Math.ceil(cv.clientHeight * ratio + 14) + 'px';
  });
};
window.__hug();
document.fonts.ready.then(window.__hug);
</script>`;

/** Does the content carry AI illustrations (so the footnote says they are schematic)? */
export const hasIllustrations = (c) => !!c.cover?.illustration || (c.pages || []).some((p) => (p.sections || []).some((s) => (s.figures || []).some((f) => f?.type === 'illustration')));

export const accVar = (k, nAcc) => `var(--accent-${(k % nAcc) + 1})`;

function figureBlock(f, id, L) {
  return (
    `<figure class="fig" data-fig="${id}">` +
    `<div class="fig-card"><div class="fig-id">${L.fig} ${id}</div><div class="fig-canvas">${renderFigure(f)}</div></div>` +
    (f.caption ? `<figcaption class="fig-cap" data-qa-text>${md(f.caption)}</figcaption>` : '') +
    `</figure>`
  );
}

export function panelBlock(p) {
  if (!p) return '';
  const title = p.title ? `<div class="p-title">${md(p.title)}</div>` : '';
  if (p.type === 'table') {
    return `<div class="panel p-table">${title}${(p.rows || [])
      .map((r) => `<div class="row"><div data-qa-text>${md(r[0])}</div><div data-qa-text>${md(r[1])}</div></div>`)
      .join('')}</div>`;
  }
  if (p.type === 'cards') {
    const items = p.items || [];
    const cols = p.cols || (items.length === 2 || items.length === 4 ? 2 : 3);
    return `<div class="panel p-cards">${title}<div class="cards c${cols}">${items
      .map((it) => `<div class="p-card"><div class="t" data-qa-text>${md(it.title)}</div>${it.text ? `<div class="x" data-qa-text>${md(it.text)}</div>` : ''}</div>`)
      .join('')}</div></div>`;
  }
  if (p.type === 'quote') {
    return `<div class="panel p-quote">${title}<div class="q" data-qa-text>${md(p.text)}</div>${p.note ? `<div class="n" data-qa-text>${md(p.note)}</div>` : ''}</div>`;
  }
  return '';
}

function standardSection(s, num, k, nAcc, L) {
  const figs = (s.figures || []).slice(0, 2);
  const hasVis = figs.length || s.panel;
  const text =
    `<div class="sec-text">` +
    `<div class="sec-label">${pad2(num)} / ${md(s.label || '')}</div>` +
    `<h2 class="sec-h" data-qa-text>${md(s.heading)}</h2>` +
    (s.paragraphs || []).map((p) => `<p data-qa-text>${md(p)}</p>`).join('') +
    (s.bullets?.length ? `<ul class="sec-bullets">${s.bullets.map((b) => `<li data-qa-text>${md(b)}</li>`).join('')}</ul>` : '') +
    (s.takeaway ? `<p class="sec-take" data-qa-text>${md(s.takeaway)}</p>` : '') +
    `</div>`;
  const vis = hasVis
    ? `<div class="sec-vis">` +
      (figs.length ? `<div class="figs figs-${figs.length}">${figs.map((f, j) => figureBlock(f, `${num}${'AB'[j]}`, L)).join('')}</div>` : '') +
      panelBlock(s.panel) +
      `</div>`
    : '';
  return `<section class="sec acc${hasVis ? '' : ' solo'}" style="--acc:${accVar(k, nAcc)}" data-sec="${pad2(num)}">${text}${vis}</section>`;
}

function checklistSection(s, num, k, nAcc, L) {
  const stages = (s.stages || [])
    .map((st, j) =>
      `<div class="cl-card acc" style="--acc:${accVar(k + j, nAcc)}">` +
      `<div class="cl-head"><div class="cl-label">${md(st.label || '')}</div><div class="cl-title">${md(st.title)}</div></div>` +
      `<ul>${(st.items || []).map((it) => `<li><i class="cl-box"></i><span data-qa-text>${md(it)}</span></li>`).join('')}</ul>` +
      (st.done ? `<div class="cl-done" data-qa-text><b>${esc(L.done)}</b>${md(st.done)}</div>` : '') +
      `</div>`)
    .join('');
  const g = s.guard;
  const guard = g
    ? `<div class="cl-card cl-guard">` +
      `<div class="cl-head"><div class="cl-label">${md(g.label || '护栏')}</div><div class="cl-title">${md(g.title)}</div></div>` +
      `<ul>${(g.items || []).map((it) => `<li><i class="cl-x">✕</i><span data-qa-text>${md(it)}</span></li>`).join('')}</ul>` +
      (g.note ? `<div class="cl-guard-note">${md(g.note)}</div>` : '') +
      `</div>`
    : '';
  return (
    `<section class="sec sec-checklist acc" style="--acc:${accVar(k, nAcc)}" data-sec="${pad2(num)}">` +
    `<div class="sec-label">${pad2(num)} / ${md(s.label || '')}</div>` +
    `<h2 class="sec-h" data-qa-text>${md(s.heading)}</h2>` +
    (s.paragraphs || []).map((p) => `<p class="cl-intro" data-qa-text>${md(p)}</p>`).join('') +
    `<div class="cl-grid">${stages}${guard}</div>` +
    (s.note ? `<p class="cl-note">${md(s.note)}</p>` : '') +
    `</section>`
  );
}

/**
 * Build the full HTML document for page `pi` (0-based).
 * ctx: { content, brand, themeCss, layoutCss, nAcc, wide }
 */
export function buildPage(pi, ctx) {
  const { content, brand, themeCss, layoutCss, nAcc } = ctx;
  const lang = content.lang === 'en' ? 'en' : 'zh';
  const L = LABELS[lang];
  const pages = content.pages;
  const page = pages[pi];
  const total = pages.length;

  // Continuous section numbering across pages.
  let num = pages.slice(0, pi).reduce((a, p) => a + (p.sections || []).length, 0);
  const sections = (page.sections || [])
    .map((s) => {
      num += 1;
      const k = num - 1;
      return s.kind === 'checklist' ? checklistSection(s, num, k, nAcc, L) : standardSection(s, num, k, nAcc, L);
    })
    .join('');
  const firstK = pages.slice(0, pi).reduce((a, p) => a + (p.sections || []).length, 0);

  const editor = brand.editor || (lang === 'zh' ? '编者' : 'the editor');
  const footnote = content.footnote || (content.source ? L.footnote(content.source, editor, hasIllustrations(content)) : '');
  const series = content.series || brand.series || '';
  const meta = [brand.handle, L.pageShort(pi + 1, total)].filter(Boolean).join(' · ');
  const hero = pi === 0 ? coverIllustrationSrc(content) : ''; // AI cover illustration, first page only

  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${esc(String(content.title || '').replace(/\n/g, ' '))} · ${pi + 1}/${total}</title>
<style>${layoutCss}</style>
<style>${themeCss}</style>
</head><body>
<main class="page${ctx.wide ? '' : ' m'}" data-page="${pi + 1}">
<header class="pg-top"><span>${md([series, brand.issueLabel].filter(Boolean).join(' · '))}</span><span>${esc(L.page(pi + 1, total))}</span></header>
${hero ? '<div class="pg-head has-hero"><div class="pg-head-main">' : ''}
<h1 class="pg-title" data-qa-text>${md(content.title)}</h1>
${page.part ? `<div class="pg-part acc" style="--acc:${accVar(firstK, nAcc)}">${md(page.part)}</div>` : ''}
${page.intro ? `<p class="pg-intro" data-qa-text>${md(page.intro)}</p>` : ''}
${hero ? `</div><div class="pg-hero"><img src="${esc(hero)}" style="aspect-ratio:${coverIllustrationAspect(content)}" alt=""></div></div>` : ''}
${sections}
${page.closing ? `<div class="pg-closing" data-qa-text>${md(page.closing)}</div>` : ''}
<footer class="pg-foot"><div class="pg-src">${md(footnote)}</div>
<div class="pg-brand${brand.avatar ? ' has-ava' : ''}">${brand.avatar ? `<img class="pg-brand-ava" src="${esc(brand.avatar)}" alt="">` : ''}<div>${brand.name ? `<div class="pg-brand-name">${md(brand.name)}</div>` : ''}<div class="pg-brand-meta">${md([brand.tagline, meta].filter(Boolean).join(' · '))}</div></div></div></footer>
</main>
${ctx.wide ? '' : HUG_SCRIPT}
</body></html>`;
}

// ---------- X 版 (long.mjs --x) ----------
// X readers scroll a feed: a set of figures with their explanations stripped is a puzzle to them, and every extra
// picture in a post loses some of them. So the X version is text first, written for it by the model in content.json
// "x" according to what the piece is (a story keeps its own words, a tutorial becomes steps, a roundup a table…):
// an ordered list of blocks — original excerpts (verbatim, checked against article.md), the editor's short comments,
// text, lists, tables, key lines, code, and rarely a figure. Laid out as one continuous phone-width column and cut
// into strips about as tall as a phone screen (lib/x-strips.mjs X_TEXT).

/** A heading or title on one line: forced breaks become nothing between CJK characters, a space between words. */
export const oneLine = (t) => plain(t).replace(/\s*\n\s*/g, (m, i, str) => (/[A-Za-z0-9]/.test(str[i - 1] || '') && /[A-Za-z0-9]/.test(str[i + m.length] || '') ? ' ' : '')).trim();

/** The kinds of piece the X version is written for, with the label its header shows. */
export const X_KINDS = {
  story: { zh: '原文节选 · 编者短评', en: 'Excerpts · notes' },
  tutorial: { zh: '教程整理', en: 'How-to' },
  list: { zh: '清单整理', en: 'Roundup' },
  report: { zh: '要点 · 编者解读', en: 'Key points' },
  news: { zh: '快讯', en: 'News' },
};
/** The block types of content.json "x".blocks: each block is an object with exactly one of these keys. */
export const X_BLOCKS = ['h', 'quote', 'note', 'text', 'list', 'table', 'key', 'code', 'figure'];
export const xBlockType = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? X_BLOCKS.filter((k) => k in b) : []);
/** A quote's paragraphs (a string is one paragraph). */
export const quoteParas = (q) => (Array.isArray(q) ? q : [q]).filter((t) => typeof t === 'string' && t.trim());

const X_LABELS = {
  zh: { quote: '原文', note: '短评', foot: (src, editor, quotes) => `${src}${quotes ? `标「原文」的段落摘自原文，只删不改；其余由${editor}整理。` : ''}` },
  en: { quote: 'Original', note: 'Note', foot: (src, editor, quotes) => `${src}${quotes ? ` Passages marked “Original” are quoted as written (cuts only); the rest is by ${editor}.` : ''}` },
};

function xBlock(b, i, prev, ctx) {
  const { L, XL, nAcc, figNo } = ctx;
  const [type] = xBlockType(b);
  if (type === 'h') return `<h2 class="xt-h" data-qa-text>${md(b.h)}</h2>`;
  if (type === 'quote') {
    // The label goes on the first excerpt of a run, and again when the speaker changes.
    const who = b.who ? String(b.who) : '';
    const cont = prev && xBlockType(prev)[0] === 'quote' && String(prev.who || '') === who;
    const label = cont ? '' : `<div class="xt-who">${esc(XL.quote)}${who ? ` · ${md(who)}` : ''}</div>`;
    return `<blockquote class="xt-quote${cont ? ' cont' : ''}">${label}${quoteParas(b.quote).map((t) => `<p data-qa-text>${md(t)}</p>`).join('')}</blockquote>`;
  }
  if (type === 'note') return `<p class="xt-note"><span class="xt-chip">${md(b.label || XL.note)}</span><span data-qa-text>${md(b.note)}</span></p>`;
  if (type === 'text') return (Array.isArray(b.text) ? b.text : [b.text]).map((t) => `<p class="xt-text" data-qa-text>${md(t)}</p>`).join('');
  if (type === 'key') return `<p class="xt-key acc" style="--acc:${accVar(i, nAcc)}" data-qa-text>${md(b.key)}</p>`;
  if (type === 'list') {
    const tag = b.ordered ? 'ol' : 'ul';
    return `<${tag} class="xt-list">${(b.list || []).map((t, j) => `<li>${b.ordered ? `<i>${j + 1}</i>` : ''}<span data-qa-text>${md(t)}</span></li>`).join('')}</${tag}>`;
  }
  if (type === 'table') {
    const t = b.table || {};
    const head = (t.head || []).length ? `<thead><tr>${t.head.map((h) => `<th data-qa-text>${md(h)}</th>`).join('')}</tr></thead>` : '';
    const rows = (t.rows || []).map((r) => `<tr>${r.map((c) => `<td data-qa-text>${md(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="xt-table">${t.title ? `<div class="xt-table-title" data-qa-text>${md(t.title)}</div>` : ''}<table>${head}<tbody>${rows}</tbody></table>${t.note ? `<div class="xt-table-note" data-qa-text>${md(t.note)}</div>` : ''}</div>`;
  }
  if (type === 'code') return `<pre class="xt-code" data-qa-text>${esc(b.code)}</pre>`;
  if (type === 'figure') return `<div class="xt-fig figs figs-1">${figureBlock(b.figure, String(figNo()), L)}</div>`;
  return '';
}

// Title: keep the author's line breaks, shrinking until no line wraps.
const X_SCRIPT = `<script>
window.__xt = function () {
  var t = document.querySelector('.xt .pg-title');
  if (!t) return;
  t.style.fontSize = '';
  var lines = (t.innerHTML.match(/<br>/g) || []).length + 1, size = parseFloat(getComputedStyle(t).fontSize);
  var lh = function () { return parseFloat(getComputedStyle(t).lineHeight) || size * 1.2; };
  while (size > 26 && t.getBoundingClientRect().height > lines * lh() + 2) { size -= 1; t.style.fontSize = size + 'px'; }
};
window.__xt();
document.fonts.ready.then(function () { window.__xt(); if (window.__hug) window.__hug(); });
</script>`;

/** Sections of the X draft: a new one starts at each heading (the cut planner prefers their boundaries). */
export function xSections(blocks) {
  const secs = [];
  for (const b of blocks || []) {
    if (!secs.length || xBlockType(b)[0] === 'h') secs.push([]);
    secs.at(-1).push(b);
  }
  return secs;
}

/** The X version as one HTML document. ctx: { content, brand, themeCss, layoutCss, nAcc } */
export function buildX(ctx) {
  const { content, brand, themeCss, layoutCss, nAcc } = ctx;
  const lang = content.lang === 'en' ? 'en' : 'zh';
  const L = LABELS[lang], XL = X_LABELS[lang];
  const x = content.x || {};
  const blocks = x.blocks || [];
  let fig = 0, k = 0, prev = null;
  const bctx = { L, XL, nAcc, figNo: () => ++fig };
  const body = xSections(blocks).map((sec) => {
    const html = sec.map((b) => { const h = xBlock(b, k++, prev, bctx); prev = b; return h; }).join('');
    return `<section class="xt-sec">${html}</section>`;
  }).join('');
  const editor = brand.editor || (lang === 'zh' ? '编者' : 'the editor');
  const quotes = blocks.some((b) => xBlockType(b)[0] === 'quote');
  const src = content.source ? L.footnote(content.source, editor).replace(/框架标签、表格与清单由.*$|Labels, tables.*$/, '') : '';
  const footnote = x.footnote || XL.foot(src, editor, quotes) || content.footnote || '';
  const series = content.series || brand.series || '';
  const kind = X_KINDS[x.kind]?.[lang] || '';
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">
<title>${esc(oneLine(x.title || content.title || ''))} · X</title>
<style>${layoutCss}</style>
<style>${themeCss}</style>
</head><body>
<main class="page m xt" data-page="1">
<header class="pg-top"><span>${md([series, brand.issueLabel].filter(Boolean).join(' · '))}</span><span>${esc(kind)}</span></header>
<h1 class="pg-title" data-qa-text>${md(x.title || content.title)}</h1>
${x.intro ? `<p class="xt-intro" data-qa-text>${md(x.intro)}</p>` : ''}
${body}
<footer class="pg-foot"><div class="pg-src">${md(footnote)}</div>
<div class="pg-brand${brand.avatar ? ' has-ava' : ''}">${brand.avatar ? `<img class="pg-brand-ava" src="${esc(brand.avatar)}" alt="">` : ''}<div>${brand.name ? `<div class="pg-brand-name">${md(brand.name)}</div>` : ''}<div class="pg-brand-meta">${md([brand.tagline, brand.handle].filter(Boolean).join(' · '))}</div></div></div></footer>
</main>
${HUG_SCRIPT}
${X_SCRIPT}
</body></html>`;
}
