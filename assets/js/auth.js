/**
 * auth.js — Global Supabase auth state for JJ Financial Analysis
 * Handles nav avatar display, profile menu, and sign-out.
 * Loaded in default.html (site-wide).
 */
(function () {
  const SUPABASE_URL  = 'https://zhncuebqgfjjssivzatu.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpobmN1ZWJxZ2ZqanNzaXZ6YXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTUxMzIsImV4cCI6MjA5NTU5MTEzMn0.6G-IOX4ONqowIZzseqak_UCXbVtlcaJPuxY8Y2909Kc';

  // ── Supabase client (shared with comments.js) ─────────────────────────────
  function getSb() {
    if (!window._jjSb && window.supabase) {
      window._jjSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    }
    return window._jjSb;
  }

  // ── Avatar helper ─────────────────────────────────────────────────────────
  function renderAvatar(el, user) {
    if (!el) return;
    const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'U';
    const url  = user?.user_metadata?.avatar_url;
    if (url) {
      el.innerHTML = `<img src="${url}" alt="${name[0].toUpperCase()}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      el.textContent = name[0].toUpperCase();
    }
  }

  // ── Update nav when auth state changes ───────────────────────────────────
  function updateNav(user) {
    const avatarLi = document.getElementById('nav-avatar-li');
    const loginLi  = document.getElementById('nav-login-li');
    if (!avatarLi) return;

    const portfolioLi = document.getElementById('nav-portfolio-li');
    if (user) {
      avatarLi.style.display = '';
      if (loginLi)     loginLi.style.display = 'none';
      if (portfolioLi) portfolioLi.style.display = '';
      renderAvatar(document.getElementById('navAvatarEl'), user);
      renderAvatar(document.getElementById('navAvatarMenuEl'), user);

      const name  = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
      const email = user?.email || '';
      const nameEl  = document.getElementById('navProfileName');
      const emailEl = document.getElementById('navProfileEmail');
      if (nameEl)  nameEl.textContent  = name;
      if (emailEl) emailEl.textContent = email;

      window._jjUser = user;
    } else {
      avatarLi.style.display = 'none';
      if (loginLi)     loginLi.style.display = '';
      if (portfolioLi) portfolioLi.style.display = 'none';
      window._jjUser = null;
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    const sb = getSb();
    if (!sb) { console.warn('[auth] Supabase SDK not ready'); return; }

    // React to auth changes (login, logout, token refresh)
    sb.auth.onAuthStateChange((_event, session) => {
      updateNav(session?.user ?? null);
      if (_event === 'SIGNED_IN') {
        navLoginModalClose();
      }
    });

    // Read current session on page load
    sb.auth.getSession().then(({ data: { session } }) => {
      updateNav(session?.user ?? null);
    });

    // Login modal
    setupLoginModal();

    // Sign-out button
    const signOutBtn = document.getElementById('navSignOutBtn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        await sb.auth.signOut();
        closeProfileMenu();
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('navProfileMenu');
      const btn  = document.getElementById('navAvatarBtn');
      if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
        closeProfileMenu();
      }
    });
  }

  // ── Public helpers ────────────────────────────────────────────────────────
  function closeProfileMenu() {
    const m = document.getElementById('navProfileMenu');
    if (m) m.classList.remove('open');
  }

  window.navToggleProfileMenu = function () {
    const m = document.getElementById('navProfileMenu');
    if (m) m.classList.toggle('open');
  };

  window.navLoginModalOpen = function () {
    const modal = document.getElementById('navLoginModal');
    if (modal) {
      modal.style.display = 'flex';
      const msg = document.getElementById('navModalMsg');
      const emailInput = document.getElementById('navModalEmail');
      const magicBtn = document.getElementById('navModalMagicBtn');
      if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
      if (emailInput) { emailInput.value = ''; }
      if (magicBtn) {
        magicBtn.disabled = false;
        magicBtn.innerHTML = '<span class="en-only">Send link</span><span class="ko-only">링크 전송</span>';
      }
    }
  };

  window.navLoginModalClose = function () {
    const modal = document.getElementById('navLoginModal');
    if (modal) modal.style.display = 'none';
  };

  function setupLoginModal() {
    const sb = getSb();
    if (!sb) return;

    const googleBtn = document.getElementById('navModalGoogleBtn');
    const magicBtn  = document.getElementById('navModalMagicBtn');
    const emailInput = document.getElementById('navModalEmail');

    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        const { error } = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.href }
        });
        if (error) alert(error.message);
      });
    }

    if (magicBtn && emailInput) {
      const send = async () => {
        const email = emailInput.value.trim();
        if (!email) { emailInput.focus(); return; }
        magicBtn.disabled = true;
        magicBtn.textContent = '전송 중…';
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.href }
        });
        const msg = document.getElementById('navModalMsg');
        if (error) {
          msg.textContent = error.message;
          msg.style.color = 'var(--accent-red, #f85149)';
          magicBtn.disabled = false;
          magicBtn.innerHTML = '<span class="en-only">Send link</span><span class="ko-only">링크 전송</span>';
        } else {
          msg.textContent = `${email} 로 링크를 보냈습니다. 이메일을 확인하세요!`;
          msg.style.color = 'var(--accent-green, #3fb950)';
        }
        msg.style.display = 'block';
      };
      magicBtn.addEventListener('click', send);
      emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
