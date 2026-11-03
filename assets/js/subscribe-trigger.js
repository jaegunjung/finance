/* ─────────────────────────────────────────────────────────────────────────────
 * Scroll-triggered subscribe bar.
 * When the reader passes 70% of the page, a small Buttondown signup bar slides up
 * from the bottom. Closing it hides it for 14 days; subscribing hides it for good.
 * Loaded from _layouts/post.html and the high-traffic pages (crypto, ETH, ENVX).
 * ─────────────────────────────────────────────────────────────────────────────*/
(function () {
  'use strict';

  var THRESHOLD = 0.7;
  var DISMISS_KEY = 'jj-sub-bar-dismissed-at';
  var DONE_KEY = 'jj-subscribed';
  var DISMISS_DAYS = 14;
  var ACTION = 'https://buttondown.com/api/emails/embed-subscribe/jaegun';

  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function suppressed() {
    if (get(DONE_KEY)) return true;
    var t = parseInt(get(DISMISS_KEY) || '0', 10);
    return t && (Date.now() - t) < DISMISS_DAYS * 864e5;
  }

  // Remember any successful signup on the page (inline banner, post form, this bar)
  // so the bar stops nagging people who already subscribed.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || !f.action || f.action.indexOf('buttondown.com') === -1) return;
    set(DONE_KEY, '1');
    track('subscribe_submit', { source: f.getAttribute('data-sub-source') || 'form', page: location.pathname });
    var bar = document.getElementById('jjSubBar');
    if (bar && f !== bar.querySelector('form')) bar.remove();
  }, true);

  if (suppressed()) return;

  var CSS =
    '.jj-sub-bar{position:fixed;left:50%;bottom:16px;z-index:9000;width:calc(100% - 32px);max-width:560px;' +
    'transform:translate(-50%,140%);transition:transform .35s ease;box-sizing:border-box;' +
    'background:linear-gradient(135deg,#2b2210,#1f1a10);border:1px solid rgba(210,153,34,.55);border-left:4px solid #f5a623;' +
    'border-radius:10px;padding:12px 40px 12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.5);color:#fff;}' +
    '.jj-sub-bar.show{transform:translate(-50%,0);}' +
    '.jj-sub-bar p{margin:0 0 8px;font-size:.88rem;font-weight:600;color:#ffd27a;line-height:1.4;}' +
    '.jj-sub-bar form{display:flex;gap:6px;margin:0;}' +
    '.jj-sub-bar input[type=email]{flex:1 1 auto;min-width:0;background:#14110a;color:#fff;border:1px solid #5a4a24;border-radius:6px;padding:8px 10px;font-size:14px;}' +
    '.jj-sub-bar button[type=submit]{background:#f5a623;color:#1a1a2e;border:none;border-radius:6px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;}' +
    '.jj-sub-bar .jj-sub-x{position:absolute;top:6px;right:8px;background:none;border:none;color:#a89770;font-size:16px;cursor:pointer;padding:4px;line-height:1;}' +
    '@media (prefers-reduced-motion:reduce){.jj-sub-bar{transition:none;}}';

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement('div');
    el.id = 'jjSubBar';
    el.className = 'jj-sub-bar';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Newsletter');
    el.innerHTML =
      '<button type="button" class="jj-sub-x" aria-label="Close" data-aria-label-en="Close" data-aria-label-ko="닫기">✕</button>' +
      '<p><span class="en-only">📬 Get the next analysis in your inbox</span><span class="ko-only">📬 다음 분석을 이메일로 받아보세요</span></p>' +
      '<form action="' + ACTION + '" method="post" class="embeddable-buttondown-form" data-sub-source="scroll-bar">' +
        '<input type="email" name="email" required aria-label="Email" placeholder="Enter your email" ' +
          'data-placeholder-en="Enter your email" data-placeholder-ko="이메일 주소를 입력하세요" />' +
        '<input type="hidden" name="embed" value="1" />' +
        '<button type="submit"><span class="en-only">Subscribe</span><span class="ko-only">구독하기</span></button>' +
      '</form>';
    document.body.appendChild(el);
    if (window.jjApplyI18nAttrs) window.jjApplyI18nAttrs(el);

    el.querySelector('.jj-sub-x').addEventListener('click', function () {
      set(DISMISS_KEY, String(Date.now()));
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 400);
      track('subscribe_bar_dismiss', { page: location.pathname });
    });
    return el;
  }

  // Skip while an inline subscribe banner is on screen — no point showing two at once.
  function inlineVisible() {
    var nodes = document.querySelectorAll('.jj-sub-inline, .embeddable-buttondown-form');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].closest('#jjSubBar')) continue;
      var r = nodes[i].getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) return true;
    }
    return false;
  }

  var shown = false, ticking = false;
  function check() {
    ticking = false;
    if (shown) return;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    if ((window.scrollY || doc.scrollTop) / max < THRESHOLD) return;
    if (inlineVisible()) return;
    shown = true;
    window.removeEventListener('scroll', onScroll);
    var el = build();
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('show'); }); });
    track('subscribe_bar_view', { page: location.pathname });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
