/* Trang chủ: Workflow các chặng (node graph + hiệu ứng truyền dữ liệu) */
const NS_ICON = { pending: '○', running: '', done: '✓', error: '!' };
const ST_TEXT = { pending: 'Đang chờ', running: 'Đang xử lý…', done: 'Hoàn thành', error: 'Lỗi' };

function closeModal() { document.querySelectorAll('.modal-bg').forEach((m) => m.remove()); document.onkeydown = null; }

function showError(r, i) {
  closeModal();
  const s = r.stages[i], d = s.errorDetail || {};
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  const block = (title, txt) => (txt ? `<div class="m-sec"><b>${title}</b><pre>${esc(txt)}</pre></div>` : '');
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <div class="modal-h"><div><span class="pill err">Lỗi chặng ${i + 1}</span><h3>${esc(s.name)} thất bại</h3></div><button class="icon-btn" data-x aria-label="Đóng">✕</button></div>
    <div class="modal-b">
      <div class="err-box" style="font-size:13px">${esc(s.error || 'Không rõ nguyên nhân')}</div>
      <div class="meta kv"><span>Model <b>${esc(s.model)}</b></span><span>Thời điểm <b>${d.at ? new Date(d.at).toLocaleString('vi-VN') : '—'}</b></span><span>Exit code <b>${d.exitCode ?? '—'}</b></span><span>Prompt ước tính <b>~${fmt(s.promptTokensEst)}</b> token</span><span>Thời gian <b>${dur((s.endedAt || 0) - (s.startedAt || 0))}</b></span></div>
      ${block('Lệnh gọi', d.command)}${block('stderr', d.stderr)}${block('stdout', d.stdout)}${block('Stack', d.stack)}
      <div class="m-sec"><b>File chi tiết</b><div class="files"><a href="/api/runs/${r.id}/stages/${s.id}/error.json" target="_blank">error.json</a><a href="/api/runs/${r.id}/stages/${s.id}/prompt.md" target="_blank">prompt.md</a></div></div>
    </div>
    <div class="modal-f"><select data-model style="width:auto">${modelOptions(s.model)}</select>
      <button class="btn ghost sm" data-copy>Sao chép lỗi</button><button class="btn acc sm" data-retry>↻ Chạy lại từ chặng này</button></div></div>`;
  document.body.appendChild(bg);
  const close = () => closeModal();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelector('[data-x]').onclick = close;
  document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  bg.querySelector('[data-copy]').onclick = () => { navigator.clipboard?.writeText([s.error, d.stderr, d.stdout].filter(Boolean).join('\n\n')); toast('Đã sao chép'); };
  bg.querySelector('[data-retry]').onclick = async () => {
    try { await jsend(`/api/runs/${r.id}/stages/${i}/rerun`, 'POST', { model: bg.querySelector('[data-model]').value, only: false }); close(); location.hash = '#home/' + r.id; vHome(r.id); }
    catch (e) { toast(e.message); }
  };
  bg.querySelector('.modal').focus?.();
}

const fmtDT = (t) => { const d = new Date(t); if (isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

async function vHome(id) {
  stopPoll();
  $('#title').textContent = 'Trang chủ · Workflow';
  const runs = await jget('/api/runs');
  if (!id && runs.length) id = runs[0].id;
  const nodes = [{ k: 'in', name: 'Dữ liệu đầu vào' }, ...META.stages.map((s) => ({ k: s.id, name: s.name })), { k: 'out', name: 'Output' }];
  const N = nodes.length;
  view.innerHTML = homeHero() + `
  <div class="card homebar">
    <div class="hb-strip">
      <div class="hb-cur"><span class="hb-lbl">Lần chạy hiện tại</span><b id="hb-title">Chưa có lần chạy nào</b><span id="hb-sub">Tải file dữ liệu để bắt đầu.</span></div>
      <div class="hb-ctl">
        <span id="hb-pill"></span>
        ${runs.length ? `<label class="hb-sel"><span>Chuyển lần chạy</span><select id="runsel" aria-label="Chuyển lần chạy">${runs.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${fmtDT(x.createdAt)} · ${esc(x.file || 'chưa có file')}${{ done: ' · ✓', error: ' · ✗', running: ' · …' }[x.status] || ''}</option>`).join('')}</select></label>` : ''}
        <a class="btn acc sm" href="#analysis" style="text-decoration:none">＋ Analysis mới</a></div>
    </div>
  </div>
  <div class="grid4" id="hstats"></div>
  <div class="card flowcard"><div class="flow" id="flow"><svg id="edges" aria-hidden="true"></svg><button type="button" class="vchip" id="vchip" hidden></button>
    <div class="nodes" id="nodes">${nodes.map((n, i) => `
      <div class="fnode pending ${i % 2 ? 'low' : ''}" data-i="${i}" ${i > 0 && i < N - 1 ? 'tabindex="0" role="button"' : ''}>
        <div class="fn-h"><span class="fn-badge">${i === 0 ? '⇩' : i === N - 1 ? '⎘' : i}</span><b>${esc(n.name)}</b><span class="fn-ico"></span></div>
        <div class="fn-m"></div><div class="fn-s"></div><div class="fn-x"></div><button class="fn-err" hidden>Xem lỗi chi tiết</button>
      </div>`).join('')}</div></div>
    <div class="legend"><span><i class="lg pending"></i>Chờ</span><span><i class="lg running"></i>Đang chạy</span><span><i class="lg done"></i>Hoàn thành</span><span><i class="lg error"></i>Lỗi (bấm để xem)</span></div></div>
  <div class="card"><h2>Tổng quan các chặng</h2><p class="sub">Cập nhật theo thời gian thực.</p><div style="overflow:auto"><table class="tbl" id="htbl"></table></div></div>`;

  const flow = $('#flow'), svg = $('#edges'), nodeEls = [...view.querySelectorAll('.fnode')];
  let run = null, prev = {}, lastStates = [], lastSig = '';
  const states = (r) => nodes.map((n, i) => {
    if (i === 0) return r ? 'done' : 'pending';
    if (i === N - 1) return r && r.status === 'done' ? 'done' : 'pending';
    return r?.stages?.[i - 1]?.status || 'pending';
  });
  const drawEdges = () => {
    svg.setAttribute('width', 0); svg.setAttribute('height', 0);   // đo lại nội dung thật (không để svg cũ làm tăng scrollWidth)
    const fr = flow.getBoundingClientRect(); svg.setAttribute('width', flow.scrollWidth); svg.setAttribute('height', flow.scrollHeight);
    let h = '<defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
    for (let i = 0; i < N - 1; i++) {
      const a = nodeEls[i].getBoundingClientRect(), b = nodeEls[i + 1].getBoundingClientRect();
      const sa = nodeEls[i].querySelector('.fsub:last-child'), sb = nodeEls[i + 1].querySelector('.fsub'), ra = (sa || nodeEls[i]).getBoundingClientRect(), rb = (sb || nodeEls[i + 1]).getBoundingClientRect();
      const x1 = a.right - fr.left + flow.scrollLeft, y1 = ra.top + ra.height / 2 - fr.top + flow.scrollTop, x2 = b.left - fr.left + flow.scrollLeft, y2 = rb.top + rb.height / 2 - fr.top + flow.scrollTop;
      const dx = (x2 - x1) * 0.5, d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      h += `<g class="edge idle" data-e="${i}"><path class="base" d="${d}"/><path class="glow" d="${d}" filter="url(#gl)"/>
        ${[0, 0.5].map((o) => [0, 1, 2, 3].map((k) => `<circle class="dot t${k}" r="${[3.4, 2.8, 2.2, 1.6][k]}"><animateMotion dur="2.1s" begin="${(o * 2.1 + k * 0.07).toFixed(2)}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .35 1" path="${d}"/><animate attributeName="opacity" dur="2.1s" begin="${(o * 2.1 + k * 0.07).toFixed(2)}s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;.12;.88;1"/></circle>`).join('')).join('')}
        <circle class="amb" r="3.2" filter="url(#gl)"><animateMotion dur="${2.4 + (i % 3) * 0.4}s" begin="${i * 0.6}s" repeatCount="indefinite" path="${d}"/></circle>
        <circle class="pt" cx="${x1}" cy="${y1}" r="4"/><circle class="pt" cx="${x2}" cy="${y2}" r="4"/>
        <text class="lbl" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 10}" text-anchor="middle"></text></g>`;
    }
    // Vòng kiểm tra Version: Data (ETL) → quay lại Key Metrics (chỉ khi người dùng chọn so sánh Version)
    const vs = run?.form?.versions || [], vc = run?.versionCheck || null, chip = $('#vchip');
    flow.classList.toggle('has-loop', vs.length > 0);
    if (vs.length && nodeEls[2] && nodeEls[3]) {
      const a = nodeEls[3].getBoundingClientRect(), b = nodeEls[2].getBoundingClientRect();
      const xa = a.left + a.width / 2 - fr.left + flow.scrollLeft, ya = a.bottom - fr.top + flow.scrollTop, xb = b.left + b.width / 2 - fr.left + flow.scrollLeft, yb = b.bottom - fr.top + flow.scrollTop;
      const botY = Math.max(a.bottom, b.bottom) - fr.top + flow.scrollTop, dip = 58, d = `M${xa},${ya} C${xa},${botY + dip} ${xb},${botY + dip} ${xb},${yb + 2}`;   // đi vòng dưới cả hai nhóm
      const st = vc?.status === 'needs_data' ? 'wait' : ['ok', 'applied'].includes(vc?.status) ? 'done' : ['skipped', 'partial'].includes(vc?.status) ? 'skip' : (lastStates[3] === 'done' ? 'ready' : 'idle');
      h += `<g class="vloop ${st}"><path class="base" d="${d}"/><path class="glow" d="${d}" filter="url(#gl)"/>${[0, 0.5].map((o) => `<circle class="dot" r="4.5" filter="url(#gl)"><animateMotion dur="1.8s" begin="${o * 1.8}s" repeatCount="indefinite" path="${d}"/></circle>`).join('')}<path class="arrow" d="M${xb - 6},${yb + 12} L${xb},${yb + 2} L${xb + 6},${yb + 12}"/></g>`;
      const my = ya * 0.125 + yb * 0.125 + (botY + dip) * 0.75;
      chip.hidden = false; chip.className = 'vchip ' + st; chip.style.left = (xa + xb) / 2 + 'px'; chip.style.top = my + 'px';
      chip.innerHTML = { wait: '⚠ Version check — cần bổ sung dữ liệu', done: '✓ Version check — đã có dữ liệu', skip: '⚠ Version check — chạy không có dữ liệu', ready: '⟲ Version check', idle: '⟲ Version check' }[st];
      chip.title = 'Kiểm tra dữ liệu Version (' + vs.join(', ') + ') sau Data (ETL), quay lại Key Metrics';
    } else if (chip) chip.hidden = true;
    svg.innerHTML = h; applyEdges();
  };
  const applyEdges = () => {
    const st = lastStates; if (!st.length) return;
    svg.querySelectorAll('.edge').forEach((g) => {
      const i = +g.dataset.e, a = st[i], b = st[i + 1]; let c = 'idle';
      if (b === 'running' && a === 'done') c = 'flow';
      else if (b === 'error' || (a === 'error')) c = 'err';
      else if (a === 'done' && b === 'done') c = 'done';
      else if (a === 'done') c = 'ready';
      g.setAttribute('class', 'edge ' + c);
      const t = g.querySelector('.lbl'); const src = run?.stages?.[i - 1];
      t.textContent = '';
    });
  };
  const update = (r) => {
    run = r; lastStates = states(r); const now = Date.now();
    nodeEls.forEach((el, i) => {
      const s = lastStates[i], st = i > 0 && i < N - 1 ? r?.stages?.[i - 1] : null;
      el.className = `fnode ${s} ${i % 2 ? 'low' : ''}` + (prev[i] && prev[i] !== 'done' && s === 'done' && i > 0 ? ' pop' : '') + (prev[i] && prev[i] !== 'error' && s === 'error' ? ' shake' : '');
      $('.fn-ico', el).innerHTML = s === 'running' ? '<span class="spin"></span>' : NS_ICON[s];
      let m = '', x = '';
      if (i === 0) { m = r ? esc(r.file) : 'Chưa chọn file'; x = r ? 'Đã đọc & profile' : ''; el.querySelector('.fn-s').textContent = r ? 'Sẵn sàng' : 'Đang chờ'; }
      else if (i === N - 1) { m = r ? `output/${esc(r.id.slice(0, 14))}…` : 'output/'; el.querySelector('.fn-s').textContent = s === 'done' ? 'Đã xuất kết quả' : 'Đang chờ'; x = s === 'done' ? `${fmt(r.totals.total)} token tổng` : ''; }
      else {
        m = esc(st?.model || '—'); const sec = st?.startedAt && s === 'running' ? ` · ${Math.floor((now - st.startedAt) / 1000)}s` : '';
        el.querySelector('.fn-s').textContent = ST_TEXT[s] + sec;
        if (s === 'done') x = `${fmt(st.usage.input + st.usage.output + st.usage.cacheRead + st.usage.cacheCreate)} token · ${dur(st.ms)}`;
        if (s === 'error') x = esc((st.error || '').slice(0, 60));
      }
      $('.fn-m', el).innerHTML = m; $('.fn-x', el).innerHTML = x;
      const eb = $('.fn-err', el); eb.hidden = s !== 'error'; eb.onclick = (e) => { e.stopPropagation(); showError(r, i - 1); };
      el.onclick = () => { if (!r) return; if (s === 'error') showError(r, i - 1); else if (s === 'done' || i === N - 1) location.hash = '#run/' + r.id; };
      if (el.className.includes(' pop') || el.className.includes(' shake')) setTimeout(() => el.classList.remove('pop', 'shake'), 1400);
      prev[i] = s;
    });
    { const sig = nodeEls.map((e) => e.offsetHeight).join(','); if (sig !== lastSig) { lastSig = sig; requestAnimationFrame(drawEdges); } else applyEdges(); }   // chỉ vẽ lại đường nối khi bố cục đổi (giữ hiệu ứng chạy liên tục)
    if (r && r.status === 'waiting' && r.versionCheck?.status === 'needs_data' && window.openVersionModal) window.openVersionModal(r, { auto: true, refresh: () => window.__homeRefresh && window.__homeRefresh() });
    const chip = $('#vchip'); if (chip) chip.onclick = () => window.openVersionModal && window.openVersionModal(run, { refresh: () => window.__homeRefresh && window.__homeRefresh() });
    const t = r?.totals; setMeter(t);
    $('#hb-title').textContent = r ? (String(r.form?.requirement || '').replace(/^\[file\]\s*/, '').trim() || r.file || 'Lần chạy không tên') : 'Chưa có lần chạy nào';
    $('#hb-sub').textContent = r ? [r.file, fmtDT(r.startedAt || r.createdAt), `${(r.stages || []).filter((x) => x.status === 'done').length}/${(r.stages || []).length || 4} chặng xong`].filter(Boolean).join(' · ') : 'Tải file dữ liệu để bắt đầu.';
    $('#hb-pill').innerHTML = r ? statusPill(r.running ? 'running' : r.status) : '';
    const pct = t?.contextWindow ? Math.min(100, (t.maxContext / t.contextWindow) * 100) : 0;
    const setH = (el, html) => { if (el.__h !== html) { el.__h = html; el.innerHTML = html; } };
    setH($('#hstats'), `
      <div class="stat"><div class="k">Tổng token</div><div class="v">${fmt(t?.total)}</div><div class="s">in ${fmt(t?.input)} · out ${fmt(t?.output)} · cache ${fmt((t?.cacheRead || 0) + (t?.cacheCreate || 0))}</div></div>
      <div class="stat"><div class="k">Context Window</div><div class="v">${pct.toFixed(1)}%</div><div class="ctxbar"><i style="width:${pct}%"></i></div><div class="s">${fmt(t?.maxContext)} / ${fmt(t?.contextWindow)}</div></div>
      <div class="stat"><div class="k">Chặng hoàn thành</div><div class="v">${r ? r.stages.filter((s) => s.status === 'done').length : 0}/${META.stages.length}</div><div class="s">${r?.stages?.some((s) => s.status === 'error') ? '<span style="color:var(--err)">Có chặng lỗi</span>' : 'Không lỗi'}${r && r.stages.some((s) => s.evaluation) ? ` · Evaluator đạt ${r.stages.filter((s) => s.evaluation && s.evaluation.verdict === 'PASS').length}/${r.stages.filter((s) => s.evaluation).length}` : ''}</div></div>
      <div class="stat"><div class="k">Chi phí · Thời gian</div><div class="v">$${(t?.cost || 0).toFixed(3)}</div><div class="s">${dur(t?.ms)} model</div></div>`);
    setH($('#htbl'), `<tr><th>Chặng</th><th>Model</th><th>Trạng thái</th><th>Input</th><th>Output</th><th>Context</th><th>Thời gian</th></tr>` +
      META.stages.map((sg, i) => { const s = r?.stages?.[i]; const u = s?.usage; const ctx = u ? u.input + u.output + u.cacheRead + u.cacheCreate : 0;
        return `<tr class="${s?.status === 'error' ? 'click' : ''}" data-err="${i}"><td><b>${i + 1}. ${esc(sg.name)}</b></td><td>${esc(s?.model || '—')}</td><td>${statusPill(s?.status || 'pending')}</td><td>${u ? fmt(u.input + u.cacheRead + u.cacheCreate) : '—'}</td><td>${u ? fmt(u.output) : '—'}</td><td>${u ? ((ctx / s.contextWindow) * 100).toFixed(1) + '%' : '—'}</td><td>${s?.ms ? dur(s.ms) : '—'}</td></tr>`; }).join(''));
    view.querySelectorAll('#htbl tr[data-err].click').forEach((tr) => (tr.onclick = () => showError(r, +tr.dataset.err)));
  };
  { const f = $('#tp-form'); if (f) f.onsubmit = (e) => { e.preventDefault(); location.hash = '#analysis'; };
    const lo = $('#tp-login'); if (lo) lo.onclick = () => { try { sessionStorage.removeItem('bie-in'); } catch {} location.reload(); };
    const th = $('#tp-theme'); if (th) th.onclick = () => $('#theme').click(); }
  const rs = $('#runsel'); if (rs) rs.onchange = () => (location.hash = '#home/' + rs.value);
  window.onresize = drawEdges;
  const fetchRun = async () => { const r = await jget('/api/runs/' + id); update(r); return r; };
  drawEdges();
  if (!id) { update(null); return; }
  let r = await fetchRun(); requestAnimationFrame(drawEdges);
  const startPoll = () => { stopPoll(); poll = setInterval(async () => { try { const x = await fetchRun(); if (!x.running) stopPoll(); } catch { stopPoll(); } }, 1000); };
  window.__homeRefresh = async () => { const x = await fetchRun(); if (x.running) startPoll(); requestAnimationFrame(drawEdges); return x; };
  if (r.running) startPoll();
}
