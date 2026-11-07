/* Cổng Version: cửa sổ bổ sung dữ liệu Budget / Target / Forecast… khi flow dừng sau Data (ETL).
   Tải file mẫu → điền → tải lên → tiếp tục; hoặc tiếp tục không có dữ liệu (kèm cảnh báo số liệu không chính xác). */
(function () {
  const shown = {};   // chỉ tự mở một lần cho mỗi lần dừng
  window.openVersionModal = async function (run, opts) {
    opts = opts || {};
    if (!run || !run.id) return;
    const sig = run.id + ':' + ((run.versionCheck && run.versionCheck.askedAt) || 0);
    if (opts.auto) { if (shown[sig]) return; shown[sig] = true; }
    if (document.querySelector('.modal-bg')) return;   // đang có cửa sổ khác
    let info;
    try { info = await jget('/api/runs/' + run.id + '/version'); } catch (e) { toast(e.message); return; }
    const names = info.names || {}, nm = (k) => names[k] || k;
    let vc = info.versionCheck || {}, upload = vc.upload || null, step = 'main', busy = '', err = '';
    const waiting = info.status === 'waiting';

    const bg = document.createElement('div'); bg.className = 'modal-bg'; document.body.appendChild(bg);
    const close = () => { document.onkeydown = null; bg.remove(); };
    const chip = (k) => {
      const found = (vc.found && vc.found[k]) || null;
      const inUp = !!upload && !(upload.stillMissing || []).includes(k);
      if (found) return '<span class="vc ok" title="' + esc(found.join(', ')) + '">✓ ' + esc(nm(k)) + ' — có trong dữ liệu</span>';
      if (inUp) return '<span class="vc ok">✓ ' + esc(nm(k)) + ' — có trong file đã tải</span>';
      return '<span class="vc miss">✗ ' + esc(nm(k)) + ' — thiếu dữ liệu</span>';
    };
    const missingNow = () => (upload ? (upload.missing || []) : (vc.missing || info.versions));
    const draw = () => {
      const miss = missingNow();
      let body, foot;
      if (step === 'confirm') {
        const withData = step === 'confirm' && opts._confirmMode === 'with-data';
        body = '<div class="vwarn"><b>⚠ Dữ liệu sẽ không chính xác</b><p>' + (withData
          ? 'File bạn tải lên chưa có dữ liệu cho: <b>' + miss.map(nm).map(esc).join(', ') + '</b>.'
          : 'Bạn chưa cung cấp dữ liệu cho: <b>' + miss.map(nm).map(esc).join(', ') + '</b>.') +
          '</p><p>Nếu chạy tiếp, dashboard sẽ <b>không có số liệu so sánh</b> với các Version này (hoặc nếu có hiển thị thì không đáng tin). Bạn vẫn có thể bổ sung dữ liệu sau rồi chạy lại chặng Dashboard.</p></div>';
        foot = '<button class="btn ghost" data-back>← Quay lại bổ sung</button><button class="btn acc" data-go2>Vẫn chạy tiếp</button>';
      } else {
        body = '<p class="sub" style="margin:0 0 10px">Ở bước <b>Key Metrics</b> bạn đã chọn so sánh với Version, nhưng sau bước <b>Data (ETL)</b> dữ liệu chưa có phần này. Flow đang <b>tạm dừng</b> trước Dashboard.</p>' +
          '<div class="vcs">' + info.versions.map(chip).join('') + '</div>' +
          '<ol class="vsteps"><li><b>Tải file mẫu</b> — đã điền sẵn tên chỉ số và Version bạn chọn.<br><a class="btn ghost sm" href="/api/samples/version-data?run=' + encodeURIComponent(run.id) + '" download>⬇ Tải file mẫu Version (.xlsx)</a></li>' +
          '<li><b>Điền số liệu kế hoạch</b> vào sheet “Versions” (mỗi dòng = một kỳ của một Version).</li>' +
          '<li><b>Tải file đã điền lên</b>:<div class="vdrop" id="vdrop" tabindex="0" role="button"><b>' + (busy ? '<span class="spin"></span> ' + esc(busy) : 'Kéo thả hoặc bấm để chọn file') + '</b><span>.xlsx · .xls · .csv</span></div><input type="file" id="vfile" hidden accept=".xlsx,.xls,.xlsm,.csv"></li></ol>' +
          (err ? '<div class="err-box">' + esc(err) + '</div>' : '') +
          (upload ? '<div class="vres"><b>✓ Đã đọc file “' + esc(upload.name) + '”</b><span>' + upload.rows + ' dòng · ' + Object.entries(upload.versions || {}).map(([k, v]) => esc(k) + ' (' + v + ')').join(', ') + ' · chỉ số: ' + (upload.metrics || []).map(esc).join(', ') + ' · ' + esc(upload.dateMin || '') + ' → ' + esc(upload.dateMax || '') + '</span>' +
            (upload.warnings && upload.warnings.length ? '<ul>' + upload.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') + '</div>' : '') +
          '<p class="sub" style="margin:10px 0 0">Số Version được so với thực tế <b>theo thời gian</b> (Calendar). Chưa có dữ liệu? Bạn có thể chạy tiếp, nhưng kết quả so sánh Version sẽ không có hoặc không chính xác.</p>';
        foot = '<button class="btn ghost" data-close title="Flow vẫn tạm dừng — mở lại từ nhãn Version check trên workflow">Đóng</button><button class="btn ghost" data-skip>Tiếp tục không có dữ liệu</button><button class="btn acc" data-use ' + (upload && !busy ? '' : 'disabled') + '>Tiếp tục với dữ liệu đã tải →</button>';
      }
      bg.innerHTML = '<div class="modal warn vmodal" role="dialog" aria-modal="true" aria-labelledby="vm-t"><div class="modal-h"><div><span class="pill">Version check</span><h3 id="vm-t">Cần bổ sung dữ liệu Version</h3></div><button class="icon-btn" data-close aria-label="Đóng">✕</button></div><div class="modal-b">' + body + '</div><div class="modal-f">' + foot + '</div></div>';
      bind();
    };
    async function send(mode) {
      busy = 'Đang tiếp tục…'; draw();
      try {
        await jsend('/api/runs/' + run.id + '/version/continue', 'POST', { mode });
        close(); toast(mode === 'skip' ? 'Chạy tiếp không có dữ liệu Version — số so sánh Version sẽ không có' : 'Đã nạp dữ liệu Version — đang chạy Dashboard');
        if (opts.refresh) await opts.refresh();
        if (window.refreshActivity) window.refreshActivity();
      } catch (e) { busy = ''; err = e.message; step = 'main'; draw(); }
    }
    async function upload1(file) {
      if (!file) return;
      busy = 'Đang đọc ' + file.name + '…'; err = ''; draw();
      try {
        const fd = new FormData(); fd.append('file', file, file.name);
        const r = await fetch('/api/runs/' + run.id + '/version/upload', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText);
        upload = j; vc = Object.assign({}, vc, { missing: j.missing }); busy = '';
      } catch (e) { busy = ''; err = e.message; }
      draw();
    }
    function bind() {
      bg.onclick = (e) => {
        if (e.target === bg || e.target.closest('[data-close]')) return close();
        if (e.target.closest('[data-back]')) { step = 'main'; return draw(); }
        if (e.target.closest('[data-skip]')) { opts._confirmMode = 'skip'; step = 'confirm'; return draw(); }
        if (e.target.closest('[data-use]')) { if (!upload) return; if (missingNow().length) { opts._confirmMode = 'with-data'; step = 'confirm'; return draw(); } return send('with-data'); }
        if (e.target.closest('[data-go2]')) return send(opts._confirmMode === 'with-data' ? 'with-data' : 'skip');
        if (e.target.closest('#vdrop')) { const f = bg.querySelector('#vfile'); if (f) f.click(); }
      };
      const f = bg.querySelector('#vfile'); if (f) f.onchange = () => upload1(f.files[0]);
      const d = bg.querySelector('#vdrop');
      if (d) {
        d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f.click(); } };
        d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
        d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); upload1(e.dataTransfer.files[0]); };
      }
      document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
    }
    if (!waiting && !opts.auto) {
      // mở lại từ chip khi flow không còn dừng: chỉ hiện trạng thái
      draw(); bg.querySelector('.modal-f').innerHTML = '<button class="btn ghost" data-close>Đóng</button>'; bg.querySelector('.modal-b').insertAdjacentHTML('afterbegin', '<div class="vwarn" style="margin-bottom:10px"><b>Flow không còn tạm dừng</b><p>Trạng thái hiện tại: ' + esc(String(vc.status || '—')) + '.</p></div>');
      bg.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close)); return;
    }
    draw();
  };
})();
