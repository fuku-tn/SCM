/* Hero trang chủ (theo Template - SCM): thương hiệu Transporter + cảnh kho/xe giao hàng isometric dựng bằng SVG */
function transporterScene() {
  const S = 30, P = (x, y, z) => [((x - y) * 0.866 * S).toFixed(1), (((x + y) * 0.5) * S - z * S).toFixed(1)];
  const poly = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
  // khối hộp: top / mặt trái (y+d) / mặt phải (x+w)
  const box = (x, y, z, w, d, h, c) => {
    const [t, l, r] = c;
    return poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], t)
      + poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], l)
      + poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], r);
  };
  const W = ['#FFFFFF', '#F3EFEA', '#E2DBD2'], O = ['#FF9A57', '#F26A1B', '#D9540A'], D = ['#4a423b', '#352e29', '#2a2420'], T = ['#E9C9A0', '#D7A872', '#B98650'];
  const face = (x, y, z, w, h, fill) => poly([P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)], fill);   // mặt phẳng song song trục x
  const tree = (x, y) => `${box(x, y, 0.6, 1.4, 1.4, 0.5, W)}<ellipse cx="${P(x + 0.7, y + 0.7, 2.2)[0]}" cy="${P(x + 0.7, y + 0.7, 2.2)[1]}" rx="30" ry="36" fill="#5f8a3c"/><ellipse cx="${+P(x + 0.7, y + 0.7, 2.6)[0] - 8}" cy="${+P(x + 0.7, y + 0.7, 2.6)[1] - 8}" rx="16" ry="20" fill="#7aa64f"/>`;
  const txt = (x, y, z, s, size, fill, skew) => { const [px, py] = P(x, y, z); return `<text transform="translate(${px} ${py}) matrix(0.866 ${skew} 0 1 0 0)" font-family="Quicksand,Segoe UI,sans-serif" font-weight="800" font-size="${size}" fill="${fill}">${s}</text>`; };
  const bx = (x, y, z, s = 0.9) => box(x, y, z, s, s, s, T);
  let g = '';
  g += box(0, 0, 0, 17, 12, 0.6, W);                                    // nền
  g += box(1, 8.6, 0.6, 15, 2, 0.12, D);                                 // băng chuyền
  g += poly([P(1, 8.6, 0.72), P(16, 8.6, 0.72), P(16, 8.9, 0.72), P(1, 8.9, 0.72)], '#F26A1B');
  g += tree(0.6, 1.2) + tree(12.4, 0.8);
  g += box(9.4, 1.6, 0.6, 0.6, 4.2, 5.6, O);                             // tấm cam phía sau
  g += box(3, 1.4, 0.6, 6.4, 6, 5, W);                                   // kho
  g += poly([P(3.9, 7.4, 0.6), P(8.5, 7.4, 0.6), P(8.5, 7.4, 3.4), P(3.9, 7.4, 3.4)], '#F26A1B');   // cửa cam
  g += poly([P(3.9, 7.4, 0.6), P(8.5, 7.4, 0.6), P(8.5, 7.4, 1.9), P(3.9, 7.4, 1.9)], '#FFB07A', 'opacity=".55"');
  g += bx(4.2, 7.0, 0.6, 1.0) + bx(5.5, 6.7, 0.6, 1.1) + bx(5.0, 6.9, 1.6, 0.8);
  g += txt(3.5, 7.4, 4.6, 'transporter.', 20, '#14110F', 0.5);
  g += tree(8.4, 0.2 + 7.2).replace(/$/, '');
  g += bx(1.6, 9.0, 0.72, 1.0) + bx(3.1, 9.1, 0.72, 0.8);
  // xe van
  g += `<ellipse cx="${P(12.2, 10, 0.6)[0]}" cy="${P(12.2, 10, 0.6)[1] + 6}" rx="80" ry="16" fill="#000" opacity=".16"/>`;
  g += box(9.6, 9.0, 0.85, 4.2, 1.7, 1.9, W);
  g += box(13.8, 9.0, 0.85, 1.3, 1.7, 1.3, W);
  g += poly([P(15.1, 9.15, 1.4), P(15.1, 10.55, 1.4), P(15.1, 10.55, 2.05), P(15.1, 9.15, 2.05)], '#27313a');
  g += poly([P(13.9, 10.7, 1.6), P(14.9, 10.7, 1.6), P(14.9, 10.7, 2.05), P(13.9, 10.7, 2.05)], '#27313a');
  g += face(9.6, 10.7, 1.45, 4.2, 0.3, '#F26A1B');
  g += txt(10.2, 10.7, 2.45, 'transporter', 17, '#F26A1B', 0.5);
  [[10.9, 10.7], [14.2, 10.7]].forEach(([x, y]) => { const [a, b] = P(x, y, 0.85); g += `<circle cx="${a}" cy="${b}" r="11" fill="#1c1815"/><circle cx="${a}" cy="${b}" r="5" fill="#bdb5ab"/>`; });
  g += bx(14.6, 3.4, 0.6, 1.4) + bx(15.6, 4.6, 0.6, 1.0);
  return `<svg class="tp-scene" viewBox="-330 -140 790 600" role="img" aria-label="Kho và xe giao hàng Transporter" preserveAspectRatio="xMidYMid meet">${g}</svg>`;
}

function homeHero() {
  let n = ''; try { n = localStorage.getItem('bie-user') || ''; } catch {}
  const first = n ? n.split(' ')[0] : '';
  const imgs = ['truck-1', 'truck-2', 'dock-3'];
  const globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
  return `<section class="lp">
    <header class="lp-nav"><a class="lp-logo" href="#home">transporter<b>.</b></a>
      <nav><a class="on" href="#home">Home</a><a href="#analysis">Services</a><a href="#skills">Fleet</a><a href="#memory">About</a><a href="#history">Cases</a></nav>
      <a class="lp-quote" href="#analysis">Get a Quote</a></header>
    <div class="lp-body">
      <div class="lp-copy"><div class="lp-eye">${first ? 'Welcome back, ' + esc(first) : 'Logistics solutions'}</div>
        <h2>Delivering more than cargo. <em>Delivering trust.</em><a class="lp-go" href="#analysis" aria-label="Bắt đầu">↗</a></h2>
        <p>Safe driving. Smart logistics. Strong partnerships. Moving businesses forward, every mile.</p>
        <div class="lp-stats">
          <div class="lp-stat">${globe}<strong>Nationwide Coverage</strong><span>Delivering across 50+ states</span></div>
          <div class="lp-stat"><b>99.6%</b><strong>On-Time Delivery Rate</strong><span>Reliability you can count on</span></div></div></div>
      <div class="lp-art" id="lp-art">${imgs.map((s, k) => `<img src="/assets/hero/${s}.jpg" alt="" class="${k ? '' : 'on'}">`).join('')}
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
