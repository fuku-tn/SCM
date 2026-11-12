/* Thanh điều hướng ngang dùng chung cho mọi trang (Home nằm trong hero, các trang khác nằm ở đầu trang) */
const NAV_ITEMS = [['home', 'Home'], ['analysis', 'Analysis'], ['run', 'Results'], ['skills', 'Stages & SKILLs'], ['memory', 'Memory'], ['history', 'History']];
function navHTML(active) {
  return `<header class="lp-nav"><a class="lp-logo" href="#home" aria-label="Transporter"><img class="lp-wide" src="/assets/logo/transporter-dark.png" alt="Transporter"><img class="lp-mark" src="/assets/logo/transporter-icon.png" alt=""></a>
    <nav>${NAV_ITEMS.map(([v, t]) => `<a href="#${v}" data-v="${v}" class="${v === active ? 'on' : ''}">${esc(t)}</a>`).join('')}</nav>
    <a class="lp-quote" href="#analysis">+ New Analysis</a></header>`;
}
function homeHero() {
  let n = ''; try { n = localStorage.getItem('bie-user') || ''; } catch {}
  const first = n ? n.split(' ')[0] : '';
  const imgs = ['truck-1', 'truck-2', 'truck-3'], pos = ['78% 50%', '62% 50%', '58% 50%'];
  const flow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>';
  return `<section class="lp">
    ${navHTML('home')}
    <div class="lp-body">
      <div class="lp-copy"><div class="lp-eye">${first ? 'Welcome back, ' + esc(first) : 'SCM Dashboard'}</div>
        <h2>From supply chain data to <em>decision-ready dashboards.</em><a class="lp-go" href="#analysis" aria-label="Bắt đầu">↗</a></h2>
        <p>Upload your logistics, inventory or procurement data. BIE guides you from business context to a ready-to-use Power BI dashboard.</p>
        <div class="lp-stats">
          <div class="lp-stat">${flow}<strong>4-Stage Pipeline</strong><span>Context → Metrics → Data → Dashboard</span></div>
          <div class="lp-stat"><b>4–6</b><strong>KPIs per Page</strong><span>Clear, focused view for every audience</span></div></div></div>
      <div class="lp-art" id="lp-art">${imgs.map((s, k) => `<img src="/assets/hero/${s}.jpg" alt="" style="object-position:${pos[k]}" class="${k ? '' : 'on'}">`).join('')}
        <div class="lp-dots">${imgs.map((s, k) => `<button type="button" aria-label="Ảnh ${k + 1}" class="${k ? '' : 'on'}"></button>`).join('')}</div></div>
    </div></section>`;
}
window.__lpSlider = function () {
  const art = document.getElementById('lp-art'); if (!art || art.__s) return; art.__s = 1;
  const im = [...art.querySelectorAll('img')], dt = [...art.querySelectorAll('.lp-dots button')]; let k = 0, tm;
  const show = (j) => { k = j; im.forEach((x, q) => x.classList.toggle('on', q === j)); dt.forEach((x, q) => x.classList.toggle('on', q === j)); };
  const reset = () => { clearInterval(tm); tm = setInterval(() => { if (!art.isConnected) return clearInterval(tm); if (!document.hidden) show((k + 1) % im.length); }, 5000); };
  dt.forEach((b, q) => (b.onclick = () => { show(q); reset(); }));
  reset();
};

/* Hiệu ứng thanh nav: viên vàng trượt mượt sang mục mới (FLIP) + viên mờ đi theo con trỏ khi rê chuột */
function initNavs() {
  document.querySelectorAll('.lp-nav nav').forEach((nav) => {
    const links = [...nav.querySelectorAll('a')], cur = nav.querySelector('a.on');
    const pill = document.createElement('span'); pill.className = 'nav-pill';
    const ghost = document.createElement('span'); ghost.className = 'nav-ghost';
    nav.prepend(ghost, pill);
    const put = (el, a) => { el.style.width = a.offsetWidth + 'px'; el.style.height = a.offsetHeight + 'px'; el.style.transform = `translate(${a.offsetLeft}px,${a.offsetTop}px)`; };
    if (cur) {
      const prev = window.__navPrev, nr = nav.getBoundingClientRect();
      if (prev && prev.width) {
        pill.style.transition = 'none'; pill.style.width = prev.width + 'px'; pill.style.height = cur.offsetHeight + 'px';
        pill.style.transform = `translate(${prev.left - nr.left}px,${cur.offsetTop}px)`; void pill.offsetWidth; pill.style.transition = '';
      }
      requestAnimationFrame(() => put(pill, cur));
    } else pill.style.opacity = 0;
    links.forEach((a) => { a.onmouseenter = () => { put(ghost, a); ghost.style.opacity = 1; }; });
    nav.onmouseleave = () => { ghost.style.opacity = 0; };
  });
  window.__navPrev = null;
}
