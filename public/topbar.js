/* Thanh trên cùng: đồng hồ, chuông thông báo flow (đang chạy / lỗi / xong) và thẻ trạng thái ở sidebar */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = document.documentElement;
  const two = (n) => String(n).padStart(2, '0');

  // ---------- đồng hồ ----------
  function tick() {
    const d = new Date();
    $('#clk-d').textContent = `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
    $('#clk-t').textContent = `${two(d.getHours())}:${two(d.getMinutes())}`;
  }
  tick(); setInterval(tick, 10000);

  // ---------- thẻ người dùng / trạng thái ở sidebar ----------
  function who() { let n = ''; try { n = localStorage.getItem('bie-user') || ''; } catch {} return n.trim(); }
  function drawUser() {
    const n = who() || 'Guest';
    $('#sc-name').textContent = n; $('#sc-av').textContent = (n[0] || 'G').toUpperCase();
  }
  drawUser(); window.addEventListener('bie-login', drawUser);

  // ---------- hoạt động & chuông ----------
  const SEEN_KEY = 'bie-seen';
  const getSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; } };
  const setSeen = (o) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch {} };
  const sig = (it) => it.status + ':' + it.at;
  let data = { items: [], running: 0 }, prev = null, open = false, online = false;

  const ago = (t) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 45) return 'vừa xong'; if (s < 3600) return Math.round(s / 60) + ' phút trước'; if (s < 86400) return Math.round(s / 3600) + ' giờ trước'; return Math.round(s / 86400) + ' ngày trước';
  };
  const stamp = (t) => { const d = new Date(t); return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`; };
  const nameOf = (it) => { const t = (it.title || '').replace(/^\[file\]\s*/, '').trim(); return (t || it.file || it.id).slice(0, 64); };
  const detail = (it) => {
    const s = it.stage;
    if (it.status === 'running') return `Đang chạy chặng ${s ? s.n + ' · ' + s.name : ''}${s && s.phase === 'evaluating' ? ' (đang kiểm chứng)' : ''}${s && s.attempt > 1 ? ' · lần ' + s.attempt : ''} — ${it.done}/${it.total} chặng xong`;
    if (it.status === 'waiting') return 'Dừng sau Data (ETL) — cần bổ sung dữ liệu Version' + (it.waitingFor && it.waitingFor.length ? ': ' + it.waitingFor.join(', ') : '') + ' để chạy tiếp Dashboard';
    if (it.status === 'error') return `Lỗi ở chặng ${s ? s.n + ' · ' + s.name : ''}${it.error ? ': ' + it.error : ''}`;
    if (it.status === 'done') return `Hoàn thành ${it.done}/${it.total} chặng`;
    return `Đã xong chặng ${it.doneStages.join(', ')} (${it.done}/${it.total})`;
  };
  const ICON = {
    running: '<span class="spin"></span>',
    error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    done: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
    waiting: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/></svg>',
    partial: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  };
  const LABEL = { waiting: 'Chờ dữ liệu', running: 'Đang chạy', error: 'Lỗi', done: 'Hoàn thành', partial: 'Xong một phần' };

  function unseenList() { const seen = getSeen(); return data.items.filter((it) => it.status === 'waiting' || (it.status !== 'running' && seen[it.id] !== sig(it))); }

  function drawBadge() {
    const un = unseenList(), n = un.length + data.running, b = $('#bell-badge');
    const hasErr = un.some((i) => i.status === 'error');
    b.hidden = n === 0; b.textContent = n > 9 ? '9+' : String(n);
    b.className = 'bell-badge ' + (hasErr ? 'err' : un.some((i) => i.status === 'waiting') ? 'warn' : data.running ? 'run' : 'ok');
    $('#bell').classList.toggle('ring', hasErr || un.some((i) => i.status === 'waiting'));
    $('#bell').title = n ? `${data.running} đang chạy · ${un.filter((i) => i.status === 'error').length} lỗi · ${un.filter((i) => i.status !== 'error').length} chưa xem` : 'Không có thông báo mới';
  }
  function drawCard() {
    $('#sc-dot').className = 'sc-dot ' + (online ? (data.running ? 'run' : 'ok') : 'off');
    $('#sc-state').textContent = online ? (data.running ? `${data.running} flow đang chạy` : 'Server online') : 'Server offline';
    $('#sc-mode').textContent = online ? (data.mock ? 'MOCK' : 'Live') : '';
    { const r = data.root || '', name = r.split(/[\\/]/).filter(Boolean).pop() || '', el = $('#sc-root'); if (el) { el.textContent = online && name ? '📁 ' + name + (data.port ? ' · :' + data.port : '') : ''; el.title = online ? 'BIE đang chạy từ thư mục:\n' + r : ''; } }
    $('#sc-runs').textContent = online ? data.total : '–'; $('#sc-act').textContent = online ? data.running : '–';
  }
  function drawPanel() {
    const host = $('#notif'); if (!open) return;
    const seen = getSeen();
    const items = data.items.slice().sort((a, b) => (b.status === 'running') - (a.status === 'running') || b.at - a.at).slice(0, 12);
    host.innerHTML = `<div class="nt-h"><b>Thông báo flow</b><button type="button" class="nt-mark" ${unseenList().length ? '' : 'disabled'}>Đánh dấu đã xem</button></div>
      <div class="nt-sum"><span class="r">${data.running} đang chạy</span><span class="e">${items.filter((i) => i.status === 'error').length} lỗi</span><span class="d">${items.filter((i) => i.status === 'done').length} hoàn thành</span>${items.some((i) => i.status === 'waiting') ? '<span class="w">' + items.filter((i) => i.status === 'waiting').length + ' chờ dữ liệu</span>' : ''}</div>
      <div class="nt-list">${items.length ? items.map((it) => `<a class="nt-i ${it.status} ${(it.status === 'waiting' || (it.status !== 'running' && seen[it.id] !== sig(it))) ? 'new' : ''}" href="#home/${escH(it.id)}" data-id="${escH(it.id)}">
        <span class="nt-ic">${ICON[it.status]}</span><span class="nt-b"><b>${escH(nameOf(it))}</b><small>${escH(detail(it))}</small><em>${LABEL[it.status]} · ${stamp(it.at)} · ${ago(it.at)}</em></span></a>`).join('') : '<div class="nt-empty">Chưa có flow nào chạy.<br>Hãy bắt đầu từ trang Analysis.</div>'}</div>
      <a class="nt-f" href="#history">Xem lịch sử</a>`;
    const mk = host.querySelector('.nt-mark'); if (mk) mk.onclick = () => { markSeen(); drawPanel(); };
    host.querySelectorAll('.nt-i').forEach((a) => (a.onclick = () => { markSeen([a.dataset.id]); toggle(false); }));
    host.querySelector('.nt-f').onclick = () => toggle(false);
  }
  function markSeen(ids) { const s = getSeen(); data.items.forEach((it) => { if (it.status !== 'running' && it.status !== 'waiting' && (!ids || ids.includes(it.id))) s[it.id] = sig(it); }); setSeen(s); drawBadge(); }
  function toggle(on) {
    open = on === undefined ? !open : on; const p = $('#notif'); p.hidden = !open; $('#bell').setAttribute('aria-expanded', String(open));
    if (open) drawPanel();
  }
  $('#bell').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => { if (open && !e.target.closest('.bell-wrap')) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });

  // ---------- thăm dò ----------
  async function poll() {
    try {
      const r = await fetch('/api/activity', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status);
      const j = await r.json(); online = true;
      // báo bằng toast khi một flow đổi trạng thái (không báo ở lần tải đầu)
      if (prev) for (const it of j.items) {
        const p = prev.get(it.id);
        if (p === 'running' && it.status === 'done' && window.toast) window.toast('✓ Flow hoàn thành: ' + nameOf(it));
        if (p === 'running' && it.status === 'error' && window.toast) window.toast('✗ Flow bị lỗi ở chặng ' + (it.stage ? it.stage.n : '?') + ': ' + nameOf(it));
        if (p === 'running' && it.status === 'waiting' && window.toast) window.toast('⚠ Flow dừng chờ dữ liệu Version: ' + nameOf(it));
        if (p === 'running' && it.status === 'partial' && window.toast) window.toast('✓ Đã chạy xong chặng: ' + nameOf(it));
      }
      prev = new Map(j.items.map((i) => [i.id, i.status])); data = j;
    } catch { online = false; }
    drawBadge(); drawCard(); if (open) drawPanel();
  }
  (function loop() { const go = () => { (document.hidden ? Promise.resolve() : poll()).finally(() => setTimeout(go, data.running ? 3000 : 8000)); }; go(); })();
  window.refreshActivity = poll;   // gọi ngay sau khi bấm chạy
})();
