/* ─────────────────────────────────────────────────────────────────────────────
 * UTM handling (loaded on every page from _layouts/default.html)
 *
 * 1. Welcome banner: a visitor who lands with ?utm_source=… (e.g. from a LinkedIn
 *    post) sees a thin banner under the nav. Closing it is remembered in
 *    localStorage('jj-utm-banner-dismissed'), so it never shows again.
 * 2. window.jjUtm: helpers for _includes/share-buttons.html — every shared URL is
 *    https://jjanalysis.com<path>?utm_source=<src>&utm_medium=social&utm_campaign=share
 * ─────────────────────────────────────────────────────────────────────────────*/
(function () {
  'use strict';

  var SITE = 'https://jjanalysis.com';
  var DISMISS_KEY = 'jj-utm-banner-dismissed';
  var KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
  var KAKAO_PLACEHOLDER = 'YOUR_KAKAO_JAVASCRIPT_KEY';

  // utm_source → display name [en, ko]
  var SOURCES = {
    linkedin: ['LinkedIn', '링크드인'],
    twitter: ['X (Twitter)', 'X(트위터)'],
    x: ['X (Twitter)', 'X(트위터)'],
    reddit: ['Reddit', '레딧'],
    kakao: ['KakaoTalk', '카카오톡'],
    facebook: ['Facebook', '페이스북'],
    threads: ['Threads', '스레드'],
    instagram: ['Instagram', '인스타그램']
  };

  function isKo() { return document.documentElement.classList.contains('ko-mode'); }
  function track(name, params) { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} }

  function shareUrl(source) {
    return SITE + location.pathname +
      '?utm_source=' + encodeURIComponent(source) + '&utm_medium=social&utm_campaign=share';
  }

  function utmSource() {
    try {
      var s = new URLSearchParams(location.search).get('utm_source');
      return s ? s.trim().toLowerCase().slice(0, 40) : '';
    } catch (e) { return ''; }
  }

  // ── 1. welcome banner ───────────────────────────────────────────────────
  function bannerHtml(src) {
    var name = SOURCES[src];
    var greetEn = name ? 'Welcome from ' + name[0] + '! 👋' : 'Welcome! 👋';
    var greetKo = name ? name[1] + '에서 오셨군요! 👋' : '반갑습니다! 👋';
    return '<p class="utm-banner-text">' +
        '<span class="en-only">' + greetEn + ' Bookmark the site for daily market updates</span>' +
        '<span class="ko-only">' + greetKo + ' 즐겨찾기 추가하고 매일 시장 업데이트 받아보세요</span>' +
      '</p>' +
      '<button type="button" class="utm-banner-close" aria-label="Close" data-aria-label-en="Close" data-aria-label-ko="닫기">✕</button>';
  }

  function showBanner() {
    var src = utmSource();
    if (!src) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) {}
    if (document.getElementById('utmBanner')) return;
    var host = document.querySelector('main');
    if (!host) return;

    var el = document.createElement('div');
    el.id = 'utmBanner';
    el.className = 'utm-banner';
    el.setAttribute('role', 'status');
    el.innerHTML = bannerHtml(src);
    host.insertBefore(el, host.firstChild);
    if (window.jjApplyI18nAttrs) window.jjApplyI18nAttrs(el);

    el.querySelector('.utm-banner-close').addEventListener('click', function () {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      el.remove();
      track('utm_banner_dismiss', { utm_source: src });
    });
    track('utm_banner_view', { utm_source: src });
  }

  // ── 2. share helpers ────────────────────────────────────────────────────
  function toast(btn, msg) {
    var box = btn && btn.closest('.share-section');
    var t = box && box.querySelector('.share-toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2500);
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

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        if (!fallbackCopy(text)) throw new Error('copy failed');
      });
    }
    return fallbackCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function shareTitle(btn) {
    var box = btn && btn.closest('.share-section');
    return (box && box.getAttribute('data-share-title')) || document.title;
  }

  function copyLink(btn) {
    // Touch devices: native share sheet (it already offers "copy").
    if (navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      track('share', { method: 'share_sheet', content_path: location.pathname });
      navigator.share({ title: shareTitle(btn), url: shareUrl('share_sheet') }).catch(function () {});
      return;
    }
    var url = shareUrl('copy_link');
    writeClipboard(url).then(function () {
      toast(btn, isKo() ? '링크를 복사했습니다' : 'Link copied');
    }, function () { toast(btn, url); });
    track('share', { method: 'copy_link', content_path: location.pathname });
  }

  var kakaoLoading = null;
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

  function shareKakao(btn) {
    var key = (btn && btn.getAttribute('data-kakao-key')) || '';
    var url = shareUrl('kakao');
    track('share', { method: 'kakao', content_path: location.pathname });
    // Placeholder path: no key yet → copy the UTM link so the user can paste it into KakaoTalk.
    var copyInstead = function () {
      writeClipboard(url).then(function () {
        toast(btn, isKo() ? '카카오톡 공유 준비 중 — 링크를 복사했어요. 카톡에 붙여넣어 주세요'
                          : 'KakaoTalk share coming soon — link copied, paste it in KakaoTalk');
      }, function () { toast(btn, url); });
    };
    if (!key || key === KAKAO_PLACEHOLDER) return copyInstead();
    loadKakao().then(function (Kakao) {
      if (!Kakao.isInitialized()) Kakao.init(key);
      // sendScrap builds the card from the page's OG tags.
      Kakao.Share.sendScrap({ requestUrl: url });
    }).catch(copyInstead);
  }

  // GA: count clicks on the plain-link share buttons too.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.share-btn[data-share]');
    if (a) track('share', { method: a.getAttribute('data-share'), content_path: location.pathname });
  });

  window.jjUtm = {
    shareUrl: shareUrl,
    source: utmSource,
    copyLink: copyLink,
    shareKakao: shareKakao,
    showBanner: showBanner,
    DISMISS_KEY: DISMISS_KEY
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
  else showBanner();
})();
