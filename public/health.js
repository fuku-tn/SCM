/* Cảnh báo thiếu Claude Code CLI + nút "chế độ mượt" (tắt hiệu ứng khi màn hình giật) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = document.documentElement;

  // ----- chế độ mượt -----
  const lite = $('#lite-btn');
  const sync = () => { if (lite) { lite.setAttribute('aria-pressed', String(root.classList.contains('lite'))); lite.title = root.classList.contains('lite') ? 'Đang BẬT chế độ mượt (không hiệu ứng). Bấm để bật lại hiệu ứng.' : 'Chế độ mượt: tắt hiệu ứng chuyển động (dùng khi màn hình giật)'; } };
  if (lite) lite.onclick = () => { const on = !root.classList.contains('lite'); root.classList.toggle('lite', on); try { localStorage.setItem('bie-lite', on ? '1' : '0'); } catch {} sync(); if (window.toast) window.toast(on ? 'Đã bật chế độ mượt — tắt hiệu ứng chuyển động' : 'Đã bật lại hiệu ứng'); };
  sync();

  // ----- kiểm tra Claude Code CLI -----
  const bar = $('#health-bar');
  async function check(force) {
    if (!bar) return;
    let h; try { const r = await fetch('/api/health' + (force ? '?force=1' : ''), { cache: 'no-store' }); if (!r.ok) return; h = await r.json(); } catch { return; }
    if (h.mock || (h.claude && h.claude.found)) { bar.hidden = true; return; }
    const win = h.platform === 'win32', cmd = win ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash';
    bar.hidden = false;
    bar.innerHTML = '<span>⚠</span><div style="flex:1;min-width:260px"><b>Chưa tìm thấy Claude Code CLI trên máy này</b> — nên các chặng và nút “AI gợi ý” chưa chạy được.<br>' +
      (h.claude && h.claude.path ? escH(h.claude.message || '') : 'Cài: mở ' + (win ? 'PowerShell' : 'Terminal') + ' và chạy <code>' + escH(cmd) + '</code>, sau đó mở terminal mới, chạy lệnh <code>claude</code> một lần để đăng nhập rồi bấm “Kiểm tra lại”. (Đang dùng Claude Code trong VS Code? Hãy mở Terminal trong VS Code, chạy <code>claude</code> để chắc chắn đã đăng nhập, rồi khởi động lại BIE.)') +
      '</div><div class="hb-btns"><button class="btn ghost sm" id="hb-copy" type="button">Sao chép lệnh cài</button><button class="btn acc sm" id="hb-re" type="button">Kiểm tra lại</button></div>';
    $('#hb-copy').onclick = async () => { try { await navigator.clipboard.writeText(cmd); window.toast && window.toast('Đã sao chép lệnh cài'); } catch { window.toast && window.toast(cmd); } };
    $('#hb-re').onclick = async () => { $('#hb-re').disabled = true; await check(true); const b = $('#hb-re'); if (b) { b.disabled = false; if (!bar.hidden && window.toast) window.toast('Vẫn chưa tìm thấy Claude Code CLI'); } else if (window.toast) window.toast('✓ Đã tìm thấy Claude Code CLI'); };
  }
  check(false); setInterval(() => check(false), 5 * 60 * 1000);
  window.checkHealth = check;
})();
