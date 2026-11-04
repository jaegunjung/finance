/* ─────────────────────────────────────────────────────────────────────────────
 * Return-share card (portfolio / stock pages)
 *
 * Pages publish what to share with:
 *   window.jjShare.set({ label, pct, start, end })   // or a function returning that
 *   window.jjShare.set(null)                          // hide the button
 *   window.jjShare.open({ label, pct, start, end, path })  // one-off card (e.g. a
 *     portfolio row); path = site page the card/links point to instead of this one
 *
 * Only these fields are ever read — label (ticker / "My Portfolio"), pct
 * (return in %), start/end (YYYY-MM-DD period), path (site path). Anything else a caller passes
 * (shares, prices, dollar amounts) is dropped by _sanitize(), so the card and
 * the share text can never contain cost basis or position size.
 *
 * _includes/return-share.html defines a tiny stub (window.jjShare.set queues
 * the data) so pages can call set() before this file has loaded.
 * ─────────────────────────────────────────────────────────────────────────────*/
(function () {
  'use strict';

  var W = 1200, H = 630;
  var BG = '#0d1117';
  var GREEN = '#3fb950', RED = '#f85149';
  var FONT = "system-ui, -apple-system, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  var SITE = 'jjanalysis.com';
  var KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
  var KAKAO_PLACEHOLDER = 'YOUR_KAKAO_JAVASCRIPT_KEY';

  var root = document.getElementById('jjReturnShare');
  var stub = window.jjShare || {};
  var source = stub._q !== undefined ? stub._q : null;
  var override = null;   // one-off data passed to open(d); cleared on close
  var lastLines = [];
  var modal = null, canvas = null, toastTimer = null;
  var logoImg = null;
  var cardBlob = null;   // PNG of the card as last drawn — kept ready so a click can use it without waiting

  function isKo() { return document.documentElement.classList.contains('ko-mode'); }

  // ── data ────────────────────────────────────────────────────────────────
  function _sanitize(d) {
    if (!d) return null;
    var pct = Number(d.pct);
    if (!isFinite(pct)) return null;
    var label = String(d.label || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!label) return null;
    var dateRe = /^\d{4}-\d{2}-\d{2}$/;
    return {
      label: label,
      pct: pct,
      start: dateRe.test(d.start || '') ? d.start : null,
      end: dateRe.test(d.end || '') ? d.end : null,
      path: /^\/[A-Za-z0-9\/_-]*$/.test(d.path || '') ? d.path : null
    };
  }

  function resolve() { return resolveFrom(override || source); }

  function resolveFrom(d) {
    if (typeof d === 'function') {
      try { d = d(); } catch (e) { d = null; }
    }
    return _sanitize(d);
  }

  function pagePath(d) { return (d && d.path) || location.pathname; }

  function shareUrl(d) {
    return 'https://' + SITE + pagePath(d || resolve());
  }

  // LinkedIn's feed composer takes prefilled text (share-offsite only takes a
  // URL), so the text and the UTM-tagged link go in together.
  function linkedinText(d) {
    var up = d.pct >= 0;
    var p = fmtPct(d.pct, true);
    return isKo()
      ? d.label + ' ' + p + '% ' + (up ? '수익' : '손실') + ' 중 ' + (up ? '📈' : '📉') + ' jjanalysis.com 분석 기반'
      : d.label + ' ' + p + '% ' + (up ? 'gain' : 'loss') + ' ' + (up ? '📈' : '📉') + ' Powered by jjanalysis.com analysis';
  }

  function linkedinUrl(d) {
    var url = shareUrl(d) + '?utm_source=linkedin&utm_medium=social&utm_campaign=portfolio-share';
    return 'https://www.linkedin.com/feed/?shareActive=true&text=' +
      encodeURIComponent(linkedinText(d) + '\n' + url);
  }

  // ascii: plain '-' for share text (searchable); the card uses the typographic '−'.
  function fmtPct(p, ascii) {
    var s = Math.abs(p).toFixed(2);
    if (s === '0.00') return '0.00';
    return (p > 0 ? '+' : (ascii ? '-' : '−')) + s;
  }

  function fmtDate(iso) { return iso ? iso.replace(/-/g, '.') : ''; }

  function periodText(d) {
    if (d.start && d.end) return fmtDate(d.start) + ' – ' + fmtDate(d.end);
    if (d.start) return fmtDate(d.start) + ' –';
    if (d.end) return (isKo() ? '기준일 ' : 'As of ') + fmtDate(d.end);
    return '';
  }

  function shareText(d) {
    var up = d.pct >= 0;
    return isKo()
      ? '내 ' + d.label + ' 수익률은 ' + fmtPct(d.pct, true) + '% ' + (up ? '📈' : '📉') + ' #jjanalysis #주식'
      : 'My ' + d.label + ' return is ' + fmtPct(d.pct, true) + '% ' + (up ? '📈' : '📉') + ' #jjanalysis #stocks';
  }

  function xIntentUrl(d) {
    return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText(d)) +
      '&url=' + encodeURIComponent(shareUrl(d));
  }

  // ── card ────────────────────────────────────────────────────────────────
  function loadLogo() {
    if (logoImg) return Promise.resolve(logoImg);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { logoImg = img; res(img); };
      img.onerror = function () { res(null); };
      img.src = '/assets/images/jj-logo.png';
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Draws text and records it, so tests can assert exactly what is on the card.
  function txt(ctx, s, x, y) { lastLines.push(s); ctx.fillText(s, x, y); }

  function fitFont(ctx, s, weight, size, maxW) {
    do {
      ctx.font = weight + ' ' + size + 'px ' + FONT;
      if (ctx.measureText(s).width <= maxW) break;
      size -= 4;
    } while (size > 24);
  }

  function drawCard(cv, d, logo) {
    var ctx = cv.getContext('2d');
    var ko = isKo();
    var up = d.pct >= 0;
    var col = up ? GREEN : RED;
    lastLines = [];

    cv.width = W; cv.height = H;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // soft glow behind the number
    var g = ctx.createRadialGradient(W * 0.72, H * 0.52, 20, W * 0.72, H * 0.52, 520);
    g.addColorStop(0, up ? 'rgba(63,185,80,0.20)' : 'rgba(248,81,73,0.20)');
    g.addColorStop(1, 'rgba(13,17,23,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // faint trend line across the background
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = col;
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pts = up
      ? [[0, 520], [180, 470], [330, 495], [500, 400], [660, 430], [840, 300], [990, 330], [1200, 170]]
      : [[0, 170], [180, 230], [330, 205], [500, 320], [660, 290], [840, 420], [990, 395], [1200, 540]];
    pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.restore();

    // accent bar
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, W, 8);

    // header: logo + site
    var hx = 72, hy = 64;
    if (logo) {
      ctx.save();
      roundRect(ctx, hx, hy, 56, 56, 12);
      ctx.clip();
      ctx.drawImage(logo, hx, hy, 56, 56);
      ctx.restore();
    } else {
      ctx.fillStyle = '#58a6ff';
      roundRect(ctx, hx, hy, 56, 56, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 26px ' + FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('JJ', hx + 28, hy + 30);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e6edf3';
    ctx.font = '700 30px ' + FONT;
    txt(ctx, SITE, hx + 76, hy + 29);

    // label
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#e6edf3';
    fitFont(ctx, d.label, '800', 64, W - 144);
    txt(ctx, d.label, 72, 250);

    ctx.fillStyle = '#8b949e';
    ctx.font = '500 30px ' + FONT;
    txt(ctx, ko ? '누적 수익률' : 'All-time return', 72, 300);

    // big return
    var big = fmtPct(d.pct) + '%';
    ctx.fillStyle = col;
    fitFont(ctx, big, '800', 168, W - 144);
    txt(ctx, big, 66, 468);

    // period
    var per = periodText(d);
    if (per) {
      ctx.fillStyle = '#8b949e';
      ctx.font = '500 30px ' + FONT;
      txt(ctx, per, 72, 535);
    }

    // footer URL
    ctx.fillStyle = '#58a6ff';
    ctx.font = '600 26px ' + FONT;
    ctx.textAlign = 'right';
    txt(ctx, SITE + pagePath(d).replace(/\/$/, ''), W - 72, H - 52);
    ctx.textAlign = 'left';
  }

  function render() {
    var d = resolve();
    if (!d || !canvas) return Promise.resolve(null);
    cardBlob = null;
    drawCard(canvas, d, logoImg);         // draw immediately, logo if cached
    return loadLogo().then(function (img) {
      if (img) drawCard(canvas, d, img);
      return toBlob();
    }).then(function (b) { cardBlob = b; return d; });
  }

  function toBlob() {
    return new Promise(function (res) {
      if (!canvas) return res(null);
      canvas.toBlob(function (b) { res(b); }, 'image/png');
    });
  }

  function fileName() {
    var d = resolve();
    var slug = d ? d.label.replace(/[^A-Za-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').toLowerCase() : 'return';
    return 'jjanalysis-' + (slug || 'return') + '.png';
  }

  // ── UI ──────────────────────────────────────────────────────────────────
  function toast(msg, ms) {
    var t = modal && modal.querySelector('.jjs-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }

  var ICONS = {
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.735-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    kakao: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.33 4.66 6.75l-.95 3.48c-.08.3.26.54.52.37l4.13-2.74c.54.06 1.08.1 1.64.1 5.52 0 10-3.58 10-8S17.52 3 12 3z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
  };

  function build() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'jjs-overlay';
    modal.id = 'jjShareModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="jjs-box">' +
        '<div class="jjs-head">' +
          '<span><span class="en-only">Share your return</span><span class="ko-only">수익률 공유</span></span>' +
          '<button type="button" class="jjs-close" aria-label="Close">✕</button>' +
        '</div>' +
        '<canvas class="jjs-canvas" width="' + W + '" height="' + H + '"></canvas>' +
        '<p class="jjs-note"><span class="en-only">Only the return % and period are shown — no prices or share counts.</span>' +
          '<span class="ko-only">수익률(%)과 기간만 표시됩니다 — 매수가·보유수량은 포함되지 않습니다.</span></p>' +
        '<div class="jjs-actions">' +
          '<a class="jjs-btn jjs-li" target="_blank" rel="noopener">' + ICONS.linkedin + '<span>LinkedIn</span></a>' +
          '<a class="jjs-btn jjs-x" target="_blank" rel="noopener">' + ICONS.x + '<span>X</span></a>' +
          '<button type="button" class="jjs-btn jjs-kakao">' + ICONS.kakao + '<span><span class="en-only">KakaoTalk</span><span class="ko-only">카카오톡</span></span></button>' +
          '<button type="button" class="jjs-btn jjs-copy">' + ICONS.link + '<span><span class="en-only">Copy link</span><span class="ko-only">링크 복사</span></span></button>' +
          '<button type="button" class="jjs-btn jjs-save">' + ICONS.save + '<span><span class="en-only">Save image</span><span class="ko-only">이미지 저장</span></span></button>' +
        '</div>' +
        '<div class="jjs-toast" role="status" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(modal);
    canvas = modal.querySelector('canvas');

    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('.jjs-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
    modal.querySelector('.jjs-x').addEventListener('click', function () {
      var d = resolve();
      if (d) this.href = xIntentUrl(d);   // refresh in case language changed
    });
    modal.querySelector('.jjs-li').addEventListener('click', shareLinkedIn);
    modal.querySelector('.jjs-copy').addEventListener('click', copyLink);
    modal.querySelector('.jjs-kakao').addEventListener('click', shareKakao);
    modal.querySelector('.jjs-save').addEventListener('click', saveImage);
  }

  // open()      → the page's own data (set()).
  // open(data)  → a one-off card, e.g. one portfolio row; set() is untouched.
  function open(data) {
    override = (data && typeof data === 'object' && !(data instanceof Event)) ? data : null;
    var d = resolve();
    if (!d) { override = null; return; }
    build();
    modal.querySelector('.jjs-x').href = xIntentUrl(d);
    modal.querySelector('.jjs-li').href = linkedinUrl(d);
    modal.classList.add('open');
    document.documentElement.classList.add('jjs-lock');
    render();
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('open');
    document.documentElement.classList.remove('jjs-lock');
    override = null;
  }

  function copyLink() {
    var url = shareUrl();
    var done = function () { toast(isKo() ? '링크를 복사했습니다' : 'Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url) ? done() : toast(url); });
    } else {
      fallbackCopy(url) ? done() : toast(url);
    }
  }

  function fallbackCopy(s) {
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  // LinkedIn's share URL only takes text — a site can't attach an image to
  // the post. So the card goes along another way:
  //   mobile  → native share sheet with the PNG (pick LinkedIn there)
  //   desktop → copy the PNG to the clipboard, then open the LinkedIn composer
  //             with the text prefilled; the user pastes the image (Ctrl+V).
  //             If the clipboard refuses, the PNG is downloaded instead.
  function shareLinkedIn(e) {
    var d = resolve();
    if (!d) return;
    var a = e.currentTarget;
    a.href = linkedinUrl(d);
    if (!canvas) return;   // let the plain link work
    e.preventDefault();
    var ko = isKo();
    var openLi = function () { window.open(a.href, '_blank', 'noopener'); };

    if (cardBlob && window.matchMedia('(pointer: coarse)').matches) {
      try {
        var file = new File([cardBlob], fileName(), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: linkedinText(d) + '\n' + shareUrl(d) +
            '?utm_source=linkedin&utm_medium=social&utm_campaign=portfolio-share' })
            .catch(function (err) { if (err && err.name !== 'AbortError') openLi(); });
          return;
        }
      } catch (err) { /* fall through */ }
    }

    var paste = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘V' : 'Ctrl+V';
    var blobP = cardBlob ? Promise.resolve(cardBlob) : toBlob();
    var copied;
    try {
      copied = (navigator.clipboard && window.ClipboardItem)
        ? navigator.clipboard.write([new ClipboardItem({ 'image/png': blobP })])
        : Promise.reject(new Error('no clipboard'));
    } catch (err) { copied = Promise.reject(err); }

    copied.then(function () {
      toast(ko ? '카드 이미지를 복사했어요 — 링크드인 글쓰기 창에서 ' + paste + '로 붙여넣으세요'
               : 'Card image copied — paste it (' + paste + ') into the LinkedIn post', 6000);
    }, function () {
      return blobP.then(function (blob) {
        if (blob) downloadBlob(blob);
        toast(ko ? '카드 이미지를 저장했어요 — 링크드인 글에 사진으로 첨부하세요'
                 : 'Card image saved — attach it to the LinkedIn post as a photo', 6000);
      });
    }).then(function () { setTimeout(openLi, 900); });   // let the toast be seen first
  }

  function downloadBlob(blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function saveImage() {
    toBlob().then(function (blob) {
      if (!blob) return;
      var name = fileName();
      // Mobile: native share sheet with the image (Instagram, 카톡 등)
      try {
        var file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) &&
            window.matchMedia('(pointer: coarse)').matches) {
          navigator.share({ files: [file], text: shareText(resolve()) }).catch(function () {});
          return;
        }
      } catch (e) { /* fall through to download */ }
      downloadBlob(blob);
    });
  }

  // ── Kakao ───────────────────────────────────────────────────────────────
  var kakaoLoading = null;
  function kakaoKey() { return (root && root.getAttribute('data-kakao-key')) || ''; }

  function loadKakao() {
    if (window.Kakao) return Promise.resolve(window.Kakao);
    if (kakaoLoading) return kakaoLoading;
    kakaoLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = KAKAO_SDK;
      s.crossOrigin = 'anonymous';
      s.onload = function () { window.Kakao ? res(window.Kakao) : rej(new Error('Kakao SDK missing')); };
      s.onerror = function () { kakaoLoading = null; rej(new Error('Kakao SDK load failed')); };
      document.head.appendChild(s);
    });
    return kakaoLoading;
  }

  function shareKakao() {
    var key = kakaoKey();
    if (!key || key === KAKAO_PLACEHOLDER) {
      toast(isKo() ? '카카오 앱키가 아직 설정되지 않았습니다' : 'Kakao app key is not configured yet');
      return;
    }
    var d = resolve();
    if (!d) return;
    loadKakao().then(function (Kakao) {
      if (!Kakao.isInitialized()) Kakao.init(key);
      return toBlob().then(function (blob) {
        var file = new File([blob], fileName(), { type: 'image/png' });
        // Kakao needs a hosted image URL; uploadImage puts the card on Kakao's CDN.
        return Kakao.Share.uploadImage({ file: [file] });
      }).then(function (res) {
        var url = shareUrl(d);
        Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: shareText(d),
            description: periodText(d) || SITE,
            imageUrl: res.infos.original.url,
            imageWidth: W,
            imageHeight: H,
            link: { mobileWebUrl: url, webUrl: url }
          },
          buttons: [{ title: isKo() ? 'jjanalysis에서 보기' : 'View on jjanalysis', link: { mobileWebUrl: url, webUrl: url } }]
        });
      });
    }).catch(function () {
      toast(isKo() ? '카카오톡 공유에 실패했습니다' : 'KakaoTalk share failed');
    });
  }

  // ── public API ──────────────────────────────────────────────────────────
  function refreshButton() {
    if (!root) return;
    root.hidden = !resolveFrom(source);
  }

  window.jjShare = {
    set: function (d) { source = d; refreshButton(); },
    open: open,
    close: close,
    // exposed for tests
    _resolve: resolve,
    _shareText: function () { var d = resolve(); return d ? shareText(d) : null; },
    _xIntentUrl: function () { var d = resolve(); return d ? xIntentUrl(d) : null; },
    _linkedinUrl: function () { var d = resolve(); return d ? linkedinUrl(d) : null; },
    _shareUrl: shareUrl,
    _cardLines: function () { return lastLines.slice(); },
    _render: render
  };

  if (root) {
    var btn = root.querySelector('.jjs-open');
    if (btn) btn.addEventListener('click', function () { open(); });
  }
  refreshButton();
})();
