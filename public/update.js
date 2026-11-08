/* Thông báo "có phiên bản mới" (so với GitHub) + nút Cập nhật: server mở terminal trên máy này chạy update.ps1 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'bie-upd-dismissed';
  let st = null;
  const dismissed = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const fdate = (t) => { const d = new Date(t); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  function drawChip() {
    const b = $('#upd-btn'), v = $('#sc-ver'); if (!b) return;
    const has = !!(st && st.supported && !st.error && st.behind > 0);
    b.hidden = !has;
    if (has) { b.textContent = '⬆ Có bản mới'; b.title = `Có ${st.behind} thay đổi mới trên GitHub — bấm để xem và cập nhật`; b.classList.toggle('pulse', dismissed() !== st.latest); }
    if (v) v.textContent = st && st.current ? 'v ' + st.current.short : '';
  }
  function ask() {
    if (!st || !st.behind || document.querySelector('.modal-bg')) return;
    const bg = document.createElement('div'); bg.className = 'modal-bg'; document.body.appendChild(bg);
    const close = () => { document.onkeydown = null; bg.remove(); };
    const draw = (busy, msg, err) => {
      const dirty = st.dirty && st.dirty.length;
      bg.innerHTML = '<div class="modal warn updmodal" role="dialog" aria-modal="true" aria-labelledby="upd-t"><div class="modal-h"><div><span class="pill">Cập nhật</span><h3 id="upd-t">Có phiên bản mới của BIE</h3></div><button class="icon-btn" data-x aria-label="Đóng">✕</button></div><div class="modal-b">' +
        '<p class="sub" style="margin:0 0 10px">Bạn đang dùng <b>' + escH(st.current.short) + '</b> (' + escH(fdate(st.current.date)) + '). Trên GitHub có <b>' + st.behind + ' thay đổi mới</b>' + (st.latest ? ' (mới nhất <b>' + escH(st.latest) + '</b>)' : '') + ':</p>' +
        '<ul class="updlist">' + (st.commits || []).map((c) => '<li><code>' + escH(c.hash) + '</code><span>' + escH(c.subject) + '</span><small>' + escH(fdate(c.date)) + '</small></li>').join('') + '</ul>' +
        '<p class="sub" style="margin:10px 0 0">Bấm <b>Cập nhật ngay</b>: BIE mở một cửa sổ terminal, tải bản mới (<code>git pull</code>), cài thư viện nếu cần rồi <b>khởi động lại</b> ứng dụng (khoảng 10–30 giây). Dữ liệu và kết quả các lần chạy của bạn được giữ nguyên.</p>' +
        (dirty ? '<div class="vwarn" style="margin-top:10px"><b>⚠ Bạn đã sửa file trong thư mục BIE</b><p>' + st.dirty.map(escH).join('<br>') + '<br>Cập nhật tự động sẽ dừng lại vì có thể ghi đè thay đổi của bạn.</p></div>' : '') +
        (msg ? '<div class="vres" style="margin-top:10px"><b>' + escH(msg) + '</b></div>' : '') + (err ? '<div class="err-box" style="margin-top:10px">' + escH(err) + '</div>' : '') +
        '</div><div class="modal-f"><button class="btn ghost" data-later>Để sau</button><button class="btn acc" data-go ' + (busy ? 'disabled' : '') + '>' + (busy ? '<span class="spin"></span> Đang mở terminal…' : '⬆ Cập nhật ngay') + '</button></div></div>';
    };
    draw();
    bg.onclick = async (e) => {
      if (e.target === bg || e.target.closest('[data-x]')) return close();
      if (e.target.closest('[data-later]')) { try { localStorage.setItem(KEY, st.latest || ''); } catch {} drawChip(); return close(); }
      if (e.target.closest('[data-go]')) {
        draw(true);
        try {
          const r = await fetch('/api/update/run', { method: 'POST' }); const j = await r.json().catch(() => ({}));
          if (!r.ok) { draw(false, '', (j.error || r.statusText) + (j.manual ? '\nChạy tay: ' + j.manual : '')); return; }
          draw(false, 'Đã mở cửa sổ terminal. Trang này sẽ mất kết nối trong giây lát — khi ứng dụng khởi động lại, tải lại trang (F5) nếu trình duyệt không tự mở.');
          bg.querySelector('[data-go]').disabled = true;
        } catch (er) { draw(false, '', er.message); }
      }
    };
    document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  }
  async function check(force) {
    try { const r = await fetch('/api/update/status' + (force ? '?force=1' : ''), { cache: 'no-store' }); if (!r.ok) return; st = await r.json(); } catch { return; }
    drawChip();
    if (st && st.supported && st.behind > 0 && dismissed() !== st.latest && !document.documentElement.classList.contains('locked')) ask();   // chỉ tự hiện khi chưa bấm "Để sau" cho bản này
  }
  const b = $('#upd-btn'); if (b) b.onclick = () => { if (st && st.behind) ask(); else check(true); };
  window.addEventListener('bie-login', () => setTimeout(() => check(false), 600));
  setTimeout(() => check(false), 2500);
  setInterval(() => check(false), 20 * 60 * 1000);
  window.checkUpdate = check;
})();
