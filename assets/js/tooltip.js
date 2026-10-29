/* Financial-term tooltips.
 * Loaded lazily by _includes/tooltip.html (after window load + idle).
 * Scans text in <main> for known terms, wraps them in <span class="jj-term">,
 * and shows one shared popup on hover (mouse) or tap (touch).
 * Content rendered later by page JS is picked up via a debounced MutationObserver.
 * Opt out on any element with class="no-term" or data-no-term.
 */
(function () {
  'use strict';
  if (window.__jjTooltipInit) return;
  window.__jjTooltipInit = true;

  // ── Glossary ───────────────────────────────────────────────
  // re: regex source (case-sensitive). title/ko are shown in KO mode; titleEn/en in EN mode.
  var TERMS = {
    PER: {
      re: '\\bPER\\b|\\bP\\/E\\b|주가수익비율',
      title: 'PER (주가수익비율)',
      titleEn: 'P/E (Price-to-Earnings)',
      ko: '주가를 주당순이익(EPS)으로 나눈 값. 낮을수록 이익 대비 저평가.',
      en: 'Price-to-Earnings ratio: share price ÷ EPS. Lower means cheaper relative to earnings.'
    },
    PBR: {
      re: '\\bPBR\\b|\\bP\\/B\\b|주가순자산비율',
      title: 'PBR (주가순자산비율)',
      titleEn: 'P/B (Price-to-Book)',
      ko: '주가를 주당순자산(BPS)으로 나눈 값. 1 미만이면 장부가치보다 싸게 거래되는 중.',
      en: 'Price-to-Book ratio: share price ÷ book value per share. Below 1 = trading under book value.'
    },
    EPS: {
      re: '\\bEPS\\b|주당순이익',
      title: 'EPS (주당순이익)',
      titleEn: 'EPS (Earnings Per Share)',
      ko: '기업의 순이익을 발행 주식수로 나눈 값.',
      en: 'Earnings Per Share: net income ÷ shares outstanding.'
    },
    YTD: {
      re: '\\bYTD\\b|연초\\s?대비',
      title: 'YTD (연초대비수익률)',
      titleEn: 'YTD (Year-to-Date)',
      ko: 'Year-to-Date. 올해 1월 1일 대비 수익률.',
      en: 'Year-to-Date: return since January 1 of the current year.'
    },
    CAGR: {
      re: '\\bCAGR\\b|연평균\\s?성장률',
      title: 'CAGR (연평균성장률)',
      titleEn: 'CAGR (Compound Annual Growth Rate)',
      ko: 'Compound Annual Growth Rate. 복리 기준으로 매년 평균 몇 % 성장했는지 나타낸 값.',
      en: 'Compound Annual Growth Rate: the steady yearly rate that gets you from start to end value.'
    },
    MCAP: {
      re: '시가총액|\\b[Mm]arket [Cc]ap(?:italization)?\\b',
      title: '시가총액 (Market Cap)',
      titleEn: 'Market Cap',
      ko: '주가 × 발행 주식수. 시장이 매기는 기업 전체의 가치.',
      en: 'Share price × shares outstanding: the market value of the whole company.'
    },
    VOL: {
      re: '변동성|\\b[Vv]olatility\\b',
      title: '변동성 (Volatility)',
      titleEn: 'Volatility',
      ko: '가격의 등락폭. 클수록 리스크가 높음.',
      en: 'How widely the price swings. Higher volatility = higher risk.'
    },
    MACRO: {
      re: '매크로|\\b[Mm]acro\\b',
      title: '매크로 (Macro)',
      titleEn: 'Macro',
      ko: '금리, 물가, 실업률 등 거시경제 지표.',
      en: 'Macroeconomics: economy-wide indicators such as interest rates, inflation and unemployment.'
    },
    ETF: {
      re: '\\bETFs?\\b',
      title: 'ETF (상장지수펀드)',
      titleEn: 'ETF (Exchange-Traded Fund)',
      ko: '여러 종목을 묶어 거래소에서 주식처럼 거래하는 펀드.',
      en: 'Exchange-Traded Fund: a basket of securities that trades on an exchange like a stock.'
    },
    RSI: {
      re: '\\bRSI\\b',
      title: 'RSI (상대강도지수)',
      titleEn: 'RSI (Relative Strength Index)',
      ko: '최근 상승폭과 하락폭을 비교한 모멘텀 지표. 70 이상 과매수, 30 이하 과매도.',
      en: 'Relative Strength Index: momentum gauge. Above 70 = overbought, below 30 = oversold.'
    }
  };

  // Max underlined occurrences per term, per language bucket — keeps tables from turning into a sea of dots.
  var MAX_PER_TERM = 3;

  var keys = Object.keys(TERMS);
  var combined = new RegExp(keys.map(function (k) { return '(' + TERMS[k].re + ')'; }).join('|'), 'g');
  var quickTest = new RegExp(keys.map(function (k) { return TERMS[k].re; }).join('|'));

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1,
                    BUTTON: 1, A: 1, CODE: 1, PRE: 1, CANVAS: 1, SVG: 1, LABEL: 1 };
  var SKIP_SELECTOR = '.jj-term, .jj-tip, .no-term, [data-no-term], [contenteditable], nav, footer, .modal, [role="dialog"]';

  function bucketOf(el) {
    if (el.closest('.ko-only, .lang-ko')) return 'ko';
    if (el.closest('.en-only, .lang-en')) return 'en';
    return 'all';
  }

  function liveCount(key, bucket) {
    return document.querySelectorAll('.jj-term[data-term="' + key + '"][data-bucket="' + bucket + '"]').length;
  }

  function acceptNode(node) {
    var p = node.parentElement;
    if (!p || SKIP_TAGS[p.tagName] || p.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
    // closest() above only checks the parent chain for selectors; also skip tags anywhere up the chain
    for (var a = p; a && a !== document.body; a = a.parentElement) {
      if (SKIP_TAGS[a.tagName]) return NodeFilter.FILTER_REJECT;
    }
    if (!quickTest.test(node.nodeValue)) return NodeFilter.FILTER_SKIP;
    // Chart overlays (e.g. the RSI(14) label) ignore pointer events, so a tooltip could never open there.
    if (getComputedStyle(p).pointerEvents === 'none') return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function wrapTextNode(node) {
    var text = node.nodeValue;
    var bucket = bucketOf(node.parentElement);
    var frag = null, last = 0, m;
    combined.lastIndex = 0;
    while ((m = combined.exec(text))) {
      var key = null;
      for (var i = 0; i < keys.length; i++) { if (m[i + 1] !== undefined) { key = keys[i]; break; } }
      if (!key || liveCount(key, bucket) + (frag ? frag.querySelectorAll('[data-term="' + key + '"]').length : 0) >= MAX_PER_TERM) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var span = document.createElement('span');
      span.className = 'jj-term';
      span.setAttribute('data-term', key);
      span.setAttribute('data-bucket', bucket);
      span.setAttribute('tabindex', '0');
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (!frag) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function scan(root) {
    if (!root || !root.ownerDocument) return;
    if (root.nodeType === 3) { if (acceptNode(root) === NodeFilter.FILTER_ACCEPT) wrapTextNode(root); return; }
    if (root.nodeType !== 1) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: acceptNode });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(wrapTextNode);
  }

  // ── Popup ──────────────────────────────────────────────────
  var tip = document.createElement('div');
  tip.className = 'jj-tip';
  tip.id = 'jj-tip';
  tip.setAttribute('role', 'tooltip');
  tip.innerHTML = '<div class="jj-tip-title"></div><div class="jj-tip-body"></div><div class="jj-tip-arrow"></div>';
  document.body.appendChild(tip);
  var tipTitle = tip.querySelector('.jj-tip-title');
  var tipBody = tip.querySelector('.jj-tip-body');
  var tipArrow = tip.querySelector('.jj-tip-arrow');
  var current = null;

  function show(el) {
    var def = TERMS[el.getAttribute('data-term')];
    if (!def) return;
    var ko = document.documentElement.classList.contains('ko-mode');
    tipTitle.textContent = ko ? def.title : (def.titleEn || def.title);
    tipBody.textContent = ko ? def.ko : (def.en || def.ko);
    if (current && current !== el) current.removeAttribute('aria-describedby');
    current = el;
    el.setAttribute('aria-describedby', 'jj-tip');
    tip.classList.add('open');
    position(el);
  }

  function hide() {
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    tip.classList.remove('open');
  }

  function position(el) {
    var r = el.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    tip.style.left = '0px'; tip.style.top = '0px';
    var tw = tip.offsetWidth, th = tip.offsetHeight, gap = 8, margin = 8;
    var above = r.top - th - gap >= margin || r.bottom + th + gap > vh - margin;
    var top = above ? r.top - th - gap : r.bottom + gap;
    var cx = r.left + r.width / 2;
    var left = Math.max(margin, Math.min(cx - tw / 2, vw - tw - margin));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(margin, top) + 'px';
    tip.classList.toggle('below', !above);
    tipArrow.style.left = Math.max(10, Math.min(cx - left, tw - 10)) + 'px';
  }

  function termFrom(e) { return e.target.closest ? e.target.closest('.jj-term') : null; }

  var lastPointer = 'mouse';
  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);

  document.addEventListener('pointerover', function (e) {
    if (e.pointerType !== 'mouse') return;
    var t = termFrom(e);
    if (t) show(t);
  });
  document.addEventListener('pointerout', function (e) {
    if (e.pointerType !== 'mouse') return;
    var t = termFrom(e);
    if (t && t === current && !t.contains(e.relatedTarget)) hide();
  });

  // Tap toggles; tapping anywhere else closes.
  document.addEventListener('click', function (e) {
    var t = termFrom(e);
    if (t) {
      if (lastPointer !== 'mouse' && t === current) hide(); else show(t);
      return;
    }
    if (current && !tip.contains(e.target)) hide();
  });

  document.addEventListener('focusin', function (e) { var t = termFrom(e); if (t) show(t); });
  document.addEventListener('focusout', function (e) { if (termFrom(e) === current) hide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', function () { if (current) hide(); }, { passive: true, capture: true });
  window.addEventListener('resize', function () { if (current) hide(); });

  // ── Initial scan + watch for JS-rendered content ───────────
  var root = document.querySelector('main') || document.body;
  scan(root);

  var pending = [], timer = null;
  var observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) pending.push(added[j]);
      if (records[i].type === 'characterData') pending.push(records[i].target);
    }
    if (current && !current.isConnected) hide();
    if (!timer && pending.length) timer = setTimeout(flush, 400);
  });
  function flush() {
    timer = null;
    var batch = pending; pending = [];
    observer.disconnect();
    batch.forEach(function (n) { if (n.isConnected) scan(n); });
    observer.takeRecords();
    observe();
  }
  function observe() { observer.observe(root, { childList: true, subtree: true, characterData: true }); }
  observe();

  window.jjTooltip = { terms: TERMS, rescan: function (el) { scan(el || root); } };
})();
