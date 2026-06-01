/*
 * Supabase Comment System
 *
 * Required Supabase table (run in SQL Editor):
 * ─────────────────────────────────────────────
 * CREATE TABLE public.comments (
 *   id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
 *   post_id    TEXT        NOT NULL,
 *   user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   user_email TEXT        NOT NULL,
 *   user_name  TEXT,
 *   content    TEXT        NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "read_all"   ON public.comments FOR SELECT USING (true);
 * CREATE POLICY "insert_own" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "delete_own" ON public.comments FOR DELETE USING (auth.uid() = user_id);
 */

(function () {
  const SUPABASE_URL     = 'https://zhncuebqgfjjssivzatu.supabase.co';
  const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpobmN1ZWJxZ2ZqanNzaXZ6YXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTUxMzIsImV4cCI6MjA5NTU5MTEzMn0.6G-IOX4ONqowIZzseqak_UCXbVtlcaJPuxY8Y2909Kc';

  if (!window.supabase) {
    console.error('[comments] Supabase SDK not loaded');
    return;
  }
  // Reuse shared client created by auth.js if available
  const sb = window._jjSb || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  if (!window._jjSb) window._jjSb = sb;
  const postId = window.location.pathname;

  // ── Helpers ──────────────────────────────────────────────────
  function esc(text) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
  }
  function $(id) { return document.getElementById(id); }
  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('ko-KR', { year:'numeric', month:'short', day:'numeric' });
  }
  function initial(name, email) {
    return (name || email || '?')[0].toUpperCase();
  }

  // ── Auth UI ───────────────────────────────────────────────────
  function renderLoginButtons() {
    $('comment-form-container').innerHTML = '';
    $('auth-container').innerHTML = `
      <div class="cmt-login-box">
        <p class="cmt-login-msg">
          <span class="en-only">Log in to leave a comment</span>
          <span class="ko-only">댓글을 달려면 로그인하세요</span>
        </p>
        <div class="cmt-login-row">
          <button class="cmt-btn cmt-btn-google" id="btn-google">
            <svg width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:6px">
              <path fill="#4285F4" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20 20-8.9 20-20c0-1.5-.2-3-.4-4.5z"/>
              <path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.6 15.9 19 13 24 13c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5c-7.7 0-14.3 4.4-17.7 9.7z"/>
              <path fill="#FBBC05" d="M24 45c4.9 0 9.3-1.8 12.7-4.7l-5.9-5c-1.7 1.2-3.9 2-6.8 2-5.3 0-9.7-3.5-11.3-8.1L6 33.9C9.3 40.1 16.1 45 24 45z"/>
              <path fill="#EA4335" d="M43.6 20.5H42V20H24v8h11.3c-0.7 2-2 3.7-3.7 5l5.9 5c-.4.4 6.5-4.7 6.5-13 0-1.5-.2-3-.4-4.5z"/>
            </svg>
            <span class="en-only">Sign in with Google</span>
            <span class="ko-only">Google로 로그인</span>
          </button>
        </div>
        <div class="cmt-divider"><span>or</span></div>
        <div class="cmt-email-row">
          <input type="email" id="magic-email" class="cmt-input" placeholder="you@example.com" />
          <button class="cmt-btn cmt-btn-email" id="btn-magic">
            <span class="en-only">Send magic link</span>
            <span class="ko-only">이메일로 로그인</span>
          </button>
        </div>
        <p id="magic-msg" class="cmt-magic-msg" style="display:none;"></p>
      </div>`;

    $('btn-google').addEventListener('click', loginWithGoogle);
    $('btn-magic').addEventListener('click', sendMagicLink);
    $('magic-email').addEventListener('keydown', e => { if (e.key === 'Enter') sendMagicLink(); });
  }

  function renderUserBar(user) {
    const name = user.user_metadata?.full_name || user.email;
    $('auth-container').innerHTML = `
      <div class="cmt-user-bar">
        <span class="cmt-avatar-sm">${initial(user.user_metadata?.full_name, user.email)}</span>
        <span class="cmt-user-name">${esc(name)}</span>
        <button class="cmt-btn cmt-btn-sm cmt-btn-logout" id="btn-logout">
          <span class="en-only">Sign out</span><span class="ko-only">로그아웃</span>
        </button>
      </div>`;
    $('btn-logout').addEventListener('click', logout);
  }

  function renderCommentForm(user) {
    renderUserBar(user);
    $('comment-form-container').innerHTML = `
      <div class="cmt-form">
        <textarea id="cmt-input" class="cmt-textarea"
          placeholder="댓글을 입력하세요… / Write a comment…" rows="3"></textarea>
        <div class="cmt-form-footer">
          <span id="cmt-char" class="cmt-char">0 / 500</span>
          <button class="cmt-btn cmt-btn-submit" id="btn-submit">
            <span class="en-only">Post comment</span><span class="ko-only">댓글 달기</span>
          </button>
        </div>
        <p id="cmt-error" class="cmt-error" style="display:none;"></p>
      </div>`;

    const input = $('cmt-input');
    input.addEventListener('input', () => {
      $('cmt-char').textContent = `${input.value.length} / 500`;
    });
    $('btn-submit').addEventListener('click', () => submitComment(user));
    input.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitComment(user);
    });
  }

  // ── Auth Actions ──────────────────────────────────────────────
  async function loginWithGoogle() {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    });
    if (error) alert(error.message);
  }

  async function sendMagicLink() {
    const email = ($('magic-email')?.value || '').trim();
    if (!email) { $('magic-email').focus(); return; }
    const btn = $('btn-magic');
    btn.disabled = true;
    btn.textContent = '전송 중…';
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href }
    });
    const msg = $('magic-msg');
    if (error) {
      msg.textContent = error.message;
      msg.style.color = 'var(--accent-red, #f85149)';
      btn.disabled = false;
      btn.innerHTML = '<span class="ko-only">이메일로 로그인</span>';
    } else {
      msg.textContent = `${email} 로 링크를 보냈습니다. 이메일을 확인하세요!`;
      msg.style.color = 'var(--accent-green)';
    }
    msg.style.display = 'block';
  }

  async function logout() {
    await sb.auth.signOut();
  }

  // ── Comments CRUD ─────────────────────────────────────────────
  async function submitComment(user) {
    const input = $('cmt-input');
    const content = (input?.value || '').trim();
    const errEl = $('cmt-error');
    errEl.style.display = 'none';
    if (!content) { input.focus(); return; }
    if (content.length > 500) {
      errEl.textContent = '댓글은 500자 이하로 입력해주세요.';
      errEl.style.display = 'block'; return;
    }
    const btn = $('btn-submit');
    btn.disabled = true;
    const { error } = await sb.from('comments').insert({
      post_id:    postId,
      user_id:    user.id,
      user_email: user.email,
      user_name:  user.user_metadata?.full_name || user.email,
      content
    });
    btn.disabled = false;
    if (error) {
      errEl.textContent = error.message;
      errEl.style.display = 'block';
    } else {
      input.value = '';
      $('cmt-char').textContent = '0 / 500';
      await loadComments();
    }
  }

  async function deleteComment(id) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    const { error } = await sb.from('comments').delete().eq('id', id);
    if (!error) await loadComments();
    else alert(error.message);
  }
  window._cmtDelete = deleteComment; // expose for onclick

  async function loadComments() {
    const listEl = $('comments-list');
    listEl.innerHTML = '<p class="cmt-loading">로딩 중…</p>';

    const [{ data: comments, error }, { data: { session } }] = await Promise.all([
      sb.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: false }),
      sb.auth.getSession()
    ]);

    if (error) {
      listEl.innerHTML = `<p class="cmt-error">${esc(error.message)}</p>`;
      return;
    }
    if (!comments?.length) {
      listEl.innerHTML = `
        <p class="cmt-empty">
          <span class="en-only">No comments yet. Be the first!</span>
          <span class="ko-only">아직 댓글이 없습니다. 첫 번째 댓글을 남겨보세요!</span>
        </p>`;
      return;
    }

    const uid = session?.user?.id;
    listEl.innerHTML = comments.map(c => `
      <div class="cmt-item" id="cmt-${c.id}">
        <div class="cmt-item-header">
          <span class="cmt-avatar">${initial(c.user_name, c.user_email)}</span>
          <span class="cmt-item-author">${esc(c.user_name || c.user_email)}</span>
          <span class="cmt-item-date">${fmtDate(c.created_at)}</span>
          ${uid === c.user_id ? `<button class="cmt-btn cmt-btn-delete" onclick="window._cmtDelete('${c.id}')">삭제</button>` : ''}
        </div>
        <div class="cmt-item-body">${esc(c.content)}</div>
      </div>`).join('');
  }

  // ── Init ─────────────────────────────────────────────────────
  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      renderCommentForm(session.user);
    } else {
      renderLoginButtons();
    }
    await loadComments();

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN'  && session) renderCommentForm(session.user);
      if (event === 'SIGNED_OUT')             renderLoginButtons();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
