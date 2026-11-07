/* Trang đăng nhập: chưa có mật khẩu — "Enter Engine" vào thẳng ứng dụng (chỉ nhớ tên để chào, trong trình duyệt này) */
(function () {
  const root = document.documentElement, go = document.getElementById('lg-go');
  const nameEl = document.getElementById('lg-name'), mailEl = document.getElementById('lg-mail');
  try { nameEl.value = localStorage.getItem('bie-user') || ''; mailEl.value = localStorage.getItem('bie-mail') || ''; } catch {}
  function enter() {
    try { localStorage.setItem('bie-user', nameEl.value.trim()); localStorage.setItem('bie-mail', mailEl.value.trim()); sessionStorage.setItem('bie-in', '1'); } catch {}
    const lg = document.getElementById('login'); lg.classList.add('leaving');
    setTimeout(() => { root.classList.remove('locked'); lg.classList.remove('leaving'); if (window.route) try { window.route(); } catch {} }, 420);
  }
  // bầu trời sao (vị trí cố định theo seed để mỗi lần mở giống nhau)
  (function stars() {
    const g = document.getElementById('stars'); if (!g) return;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, NS = 'http://www.w3.org/2000/svg', out = [];
    for (let i = 0; i < 520; i++) {
      const x = (rnd() * 1080).toFixed(1), y = (rnd() * 720).toFixed(1), big = rnd() > 0.95, r = (big ? 1.8 + rnd() * 1.2 : 0.6 + rnd() * 1.0).toFixed(2);
      const o = (0.18 + rnd() * 0.42).toFixed(2), tint = rnd() > 0.8 ? '#F3D391' : rnd() > 0.6 ? '#BFD2F5' : '#FFFFFF', tw = rnd() > 0.55;
      out.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + tint + '" opacity="' + o + '"' + (tw ? ' class="tw" style="--o:' + o + ';animation-delay:-' + (rnd() * 4).toFixed(1) + 's;animation-duration:' + (2.6 + rnd() * 3).toFixed(1) + 's"' : '') + '/>');
      if (big) out.push('<circle cx="' + x + '" cy="' + y + '" r="' + (r * 5).toFixed(1) + '" fill="url(#sg)" opacity=".22"/>');
    }
    g.innerHTML = out.join('');
  })();
  // sao băng: thỉnh thoảng một vệt sáng mờ lướt chéo qua nền (chỉ khi trang đăng nhập đang hiện)
  (function meteors() {
    const box = document.getElementById('meteors'); if (!box || !box.animate) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fly = () => {
      if (document.hidden || !root.classList.contains('locked')) return;
      const W = innerWidth, H = innerHeight, el = document.createElement('div'); el.className = 'meteor';
      const ang = 22 + Math.random() * 18, rad = ang * Math.PI / 180, dist = 420 + Math.random() * 420;
      const x0 = Math.random() * W * 0.75, y0 = -20 + Math.random() * H * 0.35, x1 = x0 + Math.cos(rad) * dist, y1 = y0 + Math.sin(rad) * dist;
      box.appendChild(el);
      const a = el.animate([
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) rotate(' + ang + 'deg)', opacity: 0 },
        { opacity: 0.55, offset: 0.2 }, { opacity: 0.4, offset: 0.7 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) rotate(' + ang + 'deg)', opacity: 0 }], { duration: 1000 + Math.random() * 700, easing: 'ease-in' });
      a.onfinish = () => el.remove();
    };
    const loop = () => { fly(); setTimeout(loop, 3500 + Math.random() * 5500); };
    setTimeout(loop, 1500);
  })();
  go.onclick = enter;
  [nameEl, mailEl].forEach((e) => (e.onkeydown = (ev) => { if (ev.key === 'Enter') enter(); }));
  if (root.classList.contains('locked')) setTimeout(() => { try { nameEl.focus(); } catch {} }, 300);
})();
