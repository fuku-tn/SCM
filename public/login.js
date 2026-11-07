/* Trang đăng nhập: chưa kiểm tra tài khoản/mật khẩu (chưa có hệ thống đăng nhập) — "Sign in" hoặc "Continue as guest" đều vào thẳng ứng dụng.
   Chỉ nhớ tên tài khoản (để chào) trong trình duyệt này; mật khẩu KHÔNG được lưu ở bất kỳ đâu. */
(function () {
  const root = document.documentElement;
  const go = document.getElementById('lg-go'), guest = document.getElementById('lg-guest');
  const accEl = document.getElementById('lg-name'), passEl = document.getElementById('lg-pass');
  try { accEl.value = localStorage.getItem('bie-user') || ''; } catch {}
  function enter(asGuest) {
    try { localStorage.setItem('bie-user', asGuest ? '' : accEl.value.trim()); sessionStorage.setItem('bie-in', '1'); } catch {}
    passEl.value = '';
    window.dispatchEvent(new Event('bie-login'));
    const lg = document.getElementById('login'); lg.classList.add('leaving');
    setTimeout(() => { root.classList.remove('locked'); lg.classList.remove('leaving'); if (window.route) try { window.route(); } catch {} }, 420);
  }
  go.onclick = () => enter(false);
  guest.onclick = () => enter(true);
  [accEl, passEl].forEach((e) => (e.onkeydown = (ev) => { if (ev.key === 'Enter') enter(false); }));
  if (root.classList.contains('locked')) setTimeout(() => { try { accEl.focus(); } catch {} }, 300);
})();
