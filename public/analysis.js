/* Analysis: wizard 4 bước — điền đủ bước này mới sang bước kế tiếp */
const LEVELS = ['Intern / Thực tập', 'Fresher', 'Junior', 'Middle', 'Senior', 'Team Lead', 'Supervisor', 'Manager', 'Senior Manager', 'Director', 'C-level (CEO/CFO/COO...)'];
const WSTEPS = [
  { name: 'Business Goal', sub: 'Ngữ cảnh & yêu cầu' },
  { name: 'Key Metrics', sub: 'Người xem, chỉ số, chiều' },
  { name: 'Import Data', sub: 'Transformation · Modeling' },
  { name: 'Dashboard (PBIP)', sub: 'Theme màu & template' },
];
const freshA = () => {
  let models = null; try { models = JSON.parse(localStorage.getItem('bie-models') || 'null'); } catch {}
  return {
    runId: null, step: 0,
    context: null, ctxText: '', req: { text: '', file: null },
    aud: { department: '', position: '', level: '', tenureCompany: '', tenureCareer: '' },
    metrics: [], periods: [], dimensions: [],
    sug: { metrics: { state: 'idle', items: [], key: '', err: '' }, dimensions: { state: 'idle', items: [], key: '', err: '' } },
    sugModel: 'haiku',
    data: null, sheets: [], pv: 0,
    colors: [], themeFile: null, template: null,
    models: models && models.length === 4 ? models : ['sonnet', 'sonnet', 'sonnet', 'sonnet'],
    timers: {},
  };
};
let A = freshA();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fsize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
const PERIODS = [
  { k: 'YoY', name: 'Year over Year', d: 'So với cùng kỳ năm trước' },
  { k: 'MoM', name: 'Month over Month', d: 'So với tháng trước' },
  { k: 'QoQ', name: 'Quarter over Quarter', d: 'So với quý trước' },
  { k: 'DoD', name: 'Day over Day', d: 'So với ngày trước' },
];
const REQ = '<span class="req" title="Bắt buộc">*</span>';

// ---------- validation ----------
const ok21 = () => !!(A.aud.department.trim() && A.aud.position.trim() && A.aud.level && A.aud.tenureCompany.trim());
const miss = [
  () => { const m = []; if (!A.context && !A.ctxText.trim()) m.push('Nhập ngữ cảnh công ty hoặc tải file'); if (!A.req.text.trim() && !A.req.file) m.push('Nhập yêu cầu phân tích hoặc tải file'); return m; },
  () => { const m = []; if (!ok21()) m.push('Điền đủ phần 2.1 (phòng ban, vị trí, level, thâm niên tại doanh nghiệp)'); else { if (!A.metrics.length) m.push('Chọn ít nhất 1 Key Metric'); else if (!A.dimensions.length) m.push('Chọn ít nhất 1 chiều phân tích'); } return m; },
  () => { const m = []; if (!A.data) m.push('Tải file CSV / Excel'); else if (!A.sheets.length) m.push('Chọn ít nhất 1 bảng'); return m; },
  () => (A.colors.length < 5 ? [`Cần đủ 5 mã màu (đang có ${A.colors.length}/5)`] : []),
];
const stepOk = (i) => miss[i]().length === 0;
const maxStep = () => { let i = 0; while (i < 3 && stepOk(i)) i++; return i; };

// ---------- API helpers ----------
async function ensureRun() { if (!A.runId) A.runId = (await (await api('/api/runs', { method: 'POST' })).json()).runId; return A.runId; }
async function postSlot(slot, file) {
  const id = await ensureRun(); const fd = new FormData(); fd.append('file', file, file.name);
  const r = await fetch(`/api/runs/${id}/files/${slot}`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}

// ---------- generic drop zone ----------
function dz(host, o) {
  let err = '';
  const draw = () => {
    const cur = o.get();
    if (cur?.busy) {
      host.innerHTML = `<div class="fcard busy"><div class="fc-ico"><span class="spin"></span></div><div class="fc-main"><b>${esc(cur.name)}</b><span>${esc(o.busyText || 'Đang tải & đọc file…')}</span><div class="bar"><i></i></div></div></div>`; return;
    }
    if (cur) {
      const ico = cur.url && cur.kind === 'image' ? `<img src="${cur.url}" alt="">` : `<span class="ext">${esc((cur.ext || '').toUpperCase())}</span>`;
      host.innerHTML = `<div class="fcard"><div class="fc-ico">${ico}</div><div class="fc-main"><b>${esc(cur.name)}</b><span>${o.meta ? o.meta(cur) : fsize(cur.size)}</span>${cur.preview ? `<div class="fc-prev">${esc(cur.preview)}</div>` : ''}</div><button class="icon-btn sm" data-rm title="Gỡ file" aria-label="Gỡ file">✕</button></div>`;
      host.querySelector('[data-rm]').onclick = remove; return;
    }
    host.innerHTML = `<div class="drop" tabindex="0" role="button"><b>${o.title}</b><span>${esc(o.hint)}</span></div><input type="file" hidden accept="${o.exts.map((e) => '.' + e).join(',')}">${err ? `<div class="dz-err">${esc(err)}</div>` : ''}`;
    const d = host.querySelector('.drop'), inp = host.querySelector('input');
    d.onclick = () => inp.click(); d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = () => inp.files[0] && handle(inp.files[0]);
    d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
    d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]); };
  };
  const handle = async (f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!o.exts.includes(ext)) { err = `"${f.name}" không hợp lệ — chỉ nhận ${o.exts.map((e) => '.' + e).join(', ')}`; draw(); toast(err); return; }
    err = ''; o.set({ busy: true, name: f.name, size: f.size }); draw(); const t0 = Date.now();
    try {
      const res = await postSlot(o.slot, f); const wait = (o.minBusy || 0) - (Date.now() - t0); if (wait > 0) await sleep(wait);
      o.set({ ...res, ext, url: o.thumb ? URL.createObjectURL(f) : undefined }); o.onChange?.(res);
    } catch (e) { o.set(null); err = e.message; toast('Lỗi: ' + e.message); o.onChange?.(null); }
    draw(); refresh();
  };
  const remove = async () => { try { await fetch(`/api/runs/${A.runId}/files/${o.slot}`, { method: 'DELETE' }); } catch {} o.set(null); o.onChange?.(null); draw(); refresh(); };
  draw();
}
const textMeta = (c) => `${fsize(c.size)} · ${fmt(c.chars)} ký tự · ~${fmt(c.tokens)} token${c.truncated ? ' · <b style="color:var(--err)">đã cắt bớt (file quá dài)</b>' : ''}`;

// ---------- tag list ----------
function tagList(host, list, onChange, ph) {
  const draw = () => {
    host.innerHTML = `<div class="tags">${list.map((t, i) => `<span class="t">${esc(t)}<button data-i="${i}" title="Xóa" aria-label="Xóa ${esc(t)}">×</button></span>`).join('')}<input type="text" placeholder="${list.length ? 'Thêm…' : esc(ph)}"></div>`;
    const inp = host.querySelector('input');
    const add = (v) => { v = v.trim(); if (v && !list.includes(v)) { list.push(v); onChange(); draw(); host.querySelector('input').focus(); } else inp.value = ''; };
    host.onclick = (e) => { if (e.target.closest('.tags') && e.target.tagName !== 'BUTTON') inp.focus(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inp.value); } else if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); onChange(); draw(); host.querySelector('input').focus(); } };
    inp.onblur = () => { if (inp.value.trim()) add(inp.value); };
    host.querySelectorAll('.t button').forEach((b) => (b.onclick = () => { list.splice(+b.dataset.i, 1); onChange(); draw(); }));
  };
  draw(); return draw;
}

// ---------- AI suggestions ----------
const sugKey = (kind) => JSON.stringify({ a: A.aud, r: A.req.text, rf: A.req.file?.name, c: A.context?.name, ct: A.ctxText, m: kind === 'dimensions' ? A.metrics : 0 });
async function fetchSug(kind) {
  const s = A.sug[kind]; if (s.state === 'loading') return;
  s.state = 'loading'; s.err = ''; s.key = sugKey(kind); drawSug(kind);
  try {
    const j = await jsend(`/api/runs/${await ensureRun()}/suggest`, 'POST', { kind, model: A.sugModel, form: { audience: A.aud, requirement: A.req.text, context: A.ctxText, metrics: A.metrics } });
    s.items = j.items; s.state = 'done';
  } catch (e) { s.state = 'error'; s.err = e.message; }
  drawSug(kind);
}
function drawSug(kind) {
  const host = $('#sug-' + kind); if (!host) return;
  const s = A.sug[kind], list = A[kind], stale = s.state === 'done' && s.key !== sugKey(kind);
  const free = s.items.filter((x) => !list.includes(x.name));
  host.innerHTML = `<div class="sug-h"><b>✦ AI gợi ý</b><span class="sub" style="margin:0">bấm vào gợi ý để thêm</span><span style="flex:1"></span>
    <select data-sm title="Model dùng để gợi ý" style="width:auto;padding:5px 26px 5px 10px;font-size:12px">${META.models.map((m) => `<option value="${m.id}" ${m.id === A.sugModel ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
    <button class="btn ghost sm" data-re ${s.state === 'loading' ? 'disabled' : ''}>↻ ${s.state === 'idle' ? 'Gợi ý' : 'Gợi ý lại'}</button></div>
    ${s.state === 'loading' ? '<div class="sug-chips">' + '<i class="shim"></i>'.repeat(7) + '</div><div class="sub" style="margin:6px 0 0"><span class="spin"></span> AI đang phân tích ngữ cảnh…</div>' : ''}
    ${s.state === 'error' ? `<div class="err-box">${esc(s.err)}</div>` : ''}
    ${s.state === 'done' ? `<div class="sug-chips">${free.map((x) => `<button type="button" class="sc" data-n="${esc(x.name)}" title="${esc(x.reason)}">+ ${esc(x.name)}</button>`).join('') || '<span class="sub" style="margin:0">Đã thêm hết gợi ý.</span>'}</div>${stale ? '<div class="sub" style="margin:8px 0 0;color:var(--acct)">⚠ Thông tin phía trên đã thay đổi — bấm “Gợi ý lại” để cập nhật.</div>' : ''}` : ''}
    ${s.state === 'idle' ? '<div class="sub" style="margin:0">Sẽ tự gợi ý khi bạn điền xong phần trước. Bạn vẫn có thể tự nhập ở ô trên.</div>' : ''}`;
  host.querySelector('[data-re]').onclick = () => fetchSug(kind);
  host.querySelector('[data-sm]').onchange = (e) => (A.sugModel = e.target.value);
  host.querySelectorAll('.sc').forEach((b) => (b.onclick = () => { if (!list.includes(b.dataset.n)) list.push(b.dataset.n); A.redraw?.[kind]?.(); drawSug(kind); refresh(); }));
}
function autoSuggest() {
  if (A.step !== 1) return;
  const sched = (kind, cond, ms) => { clearTimeout(A.timers[kind]); if (cond && A.sug[kind].state === 'idle') A.timers[kind] = setTimeout(() => { if (A.step === 1 && A.sug[kind].state === 'idle') fetchSug(kind); }, ms); };
  sched('metrics', ok21(), 1400); sched('dimensions', ok21() && A.metrics.length > 0, 1000);
}

// ---------- wizard chrome ----------
const LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function refresh() {
  const st = $('#stepper'); if (!st) return;
  const mx = maxStep();
  st.innerHTML = WSTEPS.map((s, i) => { const done = stepOk(i), locked = i > mx, cls = i === A.step ? 'active' : done ? 'done' : locked ? 'locked' : '';
    return `<button class="stp ${cls}" data-i="${i}" ${locked ? 'aria-disabled="true"' : ''}><span class="stp-n">${done && i !== A.step ? '✓' : locked ? LOCK : i + 1}</span><span class="stp-t"><b>${s.name}</b><small>${s.sub}</small></span></button>`; }).join('');
  const m = miss[A.step](), next = $('#wz-next'), hint = $('#wz-hint');
  if (next) next.disabled = m.length > 0;
  if (hint) hint.innerHTML = m.length ? `<span class="warn">Còn thiếu:</span> ${m.map(esc).join(' · ')}` : '<span class="good">✓ Đã đủ thông tin</span>';
  if (A.step === 1) {
    const sec = (id, on, note) => { const el = $('#' + id); if (!el) return; el.classList.toggle('locked', !on); el.inert = !on; el.querySelector('.lock-note').textContent = on ? '' : note; };
    sec('sec-metrics', ok21(), 'Điền đủ phần 2.1 để mở khóa'); sec('sec-periods', ok21() && A.metrics.length > 0, 'Chọn ít nhất 1 Key Metric để mở khóa'); sec('sec-dims', ok21() && A.metrics.length > 0, 'Chọn ít nhất 1 Key Metric để mở khóa');
    drawSug('metrics'); drawSug('dimensions'); autoSuggest();
  }
  if (A.step === 3) drawSummary();
}
function go(i) { if (i > maxStep() || i < 0) return; A.step = i; render(); }

function foot(last) {
  return `<div class="wz-foot"><button class="btn ghost" id="wz-back" ${A.step === 0 ? 'disabled' : ''}>← Quay lại</button><div class="wz-hint" id="wz-hint"></div>
    ${last ? '<button class="btn acc" id="wz-next">▶ Chạy 4 chặng</button>' : '<button class="btn acc" id="wz-next">Tiếp tục →</button>'}</div>`;
}
function bindFoot() {
  $('#wz-back').onclick = () => go(A.step - 1);
  $('#wz-next').onclick = () => (A.step === 3 ? runAll() : go(A.step + 1));
}

// ---------- panels ----------
function panel0() {
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">1</span><div><h2>Business Goal</h2><p class="sub" style="margin:0">Cho BIE biết bối cảnh doanh nghiệp và bạn muốn phân tích điều gì.</p></div></div>
    <div class="f"><label>Ngữ cảnh công ty ${REQ} <small>— gõ trực tiếp hoặc tải file (.md, .pdf, .docx)</small></label>
      <textarea id="ctx" placeholder="VD: Công ty bán lẻ thời trang, 20 cửa hàng trên toàn quốc, doanh thu ~50 tỷ/năm, đang muốn cải thiện hiệu quả từng cửa hàng...">${esc(A.ctxText)}</textarea>
      <div class="or"><span>hoặc</span></div><div id="dz-context"></div></div>
    <div class="f"><label>Yêu cầu phân tích ${REQ} <small>— gõ trực tiếp hoặc tải file (.md, .pdf, .docx)</small></label>
      <textarea id="req" placeholder="VD: Theo dõi doanh thu & lợi nhuận theo khu vực, phát hiện sản phẩm tăng trưởng chậm...">${esc(A.req.text)}</textarea>
      <div class="or"><span>hoặc</span></div><div id="dz-req"></div></div>
    ${foot()}</div>`;
  dz($('#dz-context'), { slot: 'context', exts: ['md', 'pdf', 'docx'], title: 'Tải file ngữ cảnh công ty (không bắt buộc nếu đã điền)', hint: '.md · .pdf · .docx', get: () => A.context, set: (v) => (A.context = v), meta: textMeta, onChange: () => (A.sug.metrics.state = A.sug.metrics.state) });
  dz($('#dz-req'), { slot: 'requirement', exts: ['md', 'pdf', 'docx'], title: 'Tải file yêu cầu phân tích (không bắt buộc nếu đã điền)', hint: '.md · .pdf · .docx', get: () => A.req.file, set: (v) => (A.req.file = v), meta: textMeta });
  $('#req').oninput = (e) => { A.req.text = e.target.value; refresh(); };
  $('#ctx').oninput = (e) => { A.ctxText = e.target.value; refresh(); };
}

function panel1() {
  const a = A.aud, inp = (k, label, ph, req) => `<div class="f"><label>${label} ${req ? REQ : '<small>(không bắt buộc)</small>'}</label><input type="text" data-k="${k}" placeholder="${ph}" value="${esc(a[k])}"></div>`;
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">2</span><div><h2>Key Metrics</h2><p class="sub" style="margin:0">Khai báo người xem dashboard, sau đó chọn chỉ số và chiều cần phân tích.</p></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">2.1</span><b>Thông tin người xem dashboard</b></div>
      <div class="row2">${inp('department', 'Phòng ban', 'VD: Kinh doanh', 1)}${inp('position', 'Vị trí công việc hiện tại', 'VD: Trưởng nhóm bán hàng', 1)}
        <div class="f"><label>Level ${REQ}</label><select data-k="level"><option value="">— chọn level —</option>${LEVELS.map((l) => `<option ${l === a.level ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${inp('tenureCompany', 'Thâm niên tại doanh nghiệp hiện tại', 'VD: 3 năm 6 tháng', 1)}${inp('tenureCareer', 'Thâm niên kể từ khi đi làm', 'VD: 8 năm', 0)}</div></div>
    <div class="sec" id="sec-metrics"><div class="sec-h"><span class="sec-n">2.2</span><b>Key Metrics sẽ phân tích</b>${REQ}<span class="lock-note"></span></div>
      <div id="tags-metrics"></div><div id="sug-metrics" class="sug-box"></div></div>
    <div class="sec" id="sec-periods"><div class="sec-h"><span class="sec-n">2.3</span><b>Kỳ so sánh cần tính</b><small style="color:var(--mut)">chọn nhiều · không bắt buộc</small><span class="lock-note"></span></div>
      <div class="pcards">${PERIODS.map((p) => `<button type="button" class="pcard ${A.periods.includes(p.k) ? 'on' : ''}" data-p="${p.k}" aria-pressed="${A.periods.includes(p.k)}"><span class="pc-chk"></span><b>${p.k}</b><span class="pc-n">${p.name}</span><small>${p.d}</small></button>`).join('')}</div></div>
    <div class="sec" id="sec-dims"><div class="sec-h"><span class="sec-n">2.4</span><b>Các chiều (Dimension) đi cùng chỉ số</b>${REQ}<span class="lock-note"></span></div>
      <div id="tags-dims"></div><div id="sug-dimensions" class="sug-box"></div></div>
    ${foot()}</div>`;
  $('#panel').querySelectorAll('[data-k]').forEach((el) => { const h = () => { A.aud[el.dataset.k] = el.value; refresh(); }; el.oninput = h; el.onchange = h; });
  $('#panel').querySelectorAll('.pcard').forEach((b) => (b.onclick = () => {
    const k = b.dataset.p; A.periods = A.periods.includes(k) ? A.periods.filter((x) => x !== k) : PERIODS.map((p) => p.k).filter((x) => x === k || A.periods.includes(x));
    b.classList.toggle('on', A.periods.includes(k)); b.setAttribute('aria-pressed', String(A.periods.includes(k))); refresh();
  }));
  A.redraw = {
    metrics: tagList($('#tags-metrics'), A.metrics, refresh, 'Gõ chỉ số rồi Enter (VD: Doanh thu, Lợi nhuận gộp…) hoặc chọn gợi ý bên dưới'),
    dimensions: tagList($('#tags-dims'), A.dimensions, refresh, 'Gõ chiều rồi Enter (VD: Khu vực, Sản phẩm…) hoặc chọn gợi ý bên dưới'),
  };
}

function drawData() {
  const host = $('#data-view'); if (!host) return;
  if (!A.data || A.data.busy) { host.innerHTML = ''; return; }
  const P = A.data.profile, multi = P.sheets.length > 1, sh = P.sheets[Math.min(A.pv, P.sheets.length - 1)];
  host.innerHTML = `${multi ? `<div class="lbl" style="margin:14px 0 8px">Chọn các bảng / sheet sẽ dùng <small style="font-weight:400;color:var(--mut)">(bấm vào thẻ để xem dữ liệu mẫu, tick để chọn dùng)</small></div>
      <div class="sheets">${P.sheets.map((s, i) => `<div class="sheetcard ${i === A.pv ? 'on' : ''}" data-i="${i}"><label class="chk" title="Dùng bảng này"><input type="checkbox" data-c="${i}" ${A.sheets.includes(s.name) ? 'checked' : ''}><span></span></label><div><b>${esc(s.name)}</b><small>${fmt(s.rowCount)} dòng · ${s.columns.length} cột</small></div></div>`).join('')}</div>`
      : `<div class="fileinfo"><span class="pill ok">1 bảng</span><span>${fmt(sh.rowCount)} dòng · ${sh.columns.length} cột</span></div>`}
    <div class="lbl" style="margin:14px 0 6px">Dữ liệu mẫu — ${esc(sh.name)} <small style="font-weight:400;color:var(--mut)">(${Math.min(10, sh.sample.length)} / ${fmt(sh.rowCount)} dòng)</small></div>
    <div class="preview-tbl tall"><table><tr>${sh.columns.map((c) => `<th>${esc(c.name)}<br><small class="ty ${c.type}">${c.type}</small></th>`).join('')}</tr>${sh.sample.slice(0, 10).map((r) => `<tr>${sh.columns.map((c) => `<td>${esc(r[c.name] ?? '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${sh.columns.length || 1}" class="sub">Bảng không có dữ liệu</td></tr>`}</table></div>`;
  host.querySelectorAll('.sheetcard').forEach((c) => (c.onclick = (e) => { if (e.target.closest('.chk')) return; A.pv = +c.dataset.i; drawData(); }));
  host.querySelectorAll('[data-c]').forEach((c) => (c.onchange = () => { const n = P.sheets[+c.dataset.c].name; A.sheets = c.checked ? [...new Set([...A.sheets, n])] : A.sheets.filter((x) => x !== n); refresh(); }));
}
function panel2() {
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">3</span><div><h2>Import Data <small style="font-weight:500;color:var(--mut)">· Transformation · Modeling</small></h2><p class="sub" style="margin:0">Kéo thả hoặc chọn file CSV / Excel. Nếu có nhiều bảng, bạn chọn bảng sẽ dùng.</p></div></div>
    <div class="f"><label>File dữ liệu ${REQ} <small>— CSV hoặc Excel (.csv, .tsv, .xlsx, .xls)</small></label><div id="dz-data"></div></div><div id="data-view"></div>${foot()}</div>`;
  dz($('#dz-data'), {
    slot: 'data', exts: ['csv', 'tsv', 'xlsx', 'xls', 'xlsm'], title: 'Kéo thả file dữ liệu vào đây hoặc bấm để chọn', hint: '.csv · .tsv · .xlsx · .xls', minBusy: 1100, busyText: 'Đang tải và đọc dữ liệu…',
    get: () => A.data, set: (v) => { A.data = v; if (v && !v.busy) { A.sheets = v.profile.sheets.map((s) => s.name); A.pv = 0; } if (!v) A.sheets = []; drawData(); },
    meta: (c) => `${fsize(c.size)} · ${c.profile.sheets.length} bảng/sheet · ${fmt(c.profile.sheets.reduce((n, s) => n + s.rowCount, 0))} dòng`,
  });
  drawData();
}

const HEX6 = /^#?[0-9a-fA-F]{6}$/;
function drawColors() {
  const host = $('#colors'); if (!host) return;
  host.innerHTML = `<div class="palette">${Array.from({ length: 5 }, (_, i) => { const c = A.colors[i]; return c ? `<div class="pcol" style="--c:${c}"><i></i><b>${c}</b><button data-i="${i}" title="Xóa" aria-label="Xóa ${c}">✕</button></div>` : '<div class="pcol empty"><i></i><b>—</b></div>'; }).join('')}</div>
    <div class="cinput"><input type="text" id="hex" ${A.colors.length >= 5 ? 'disabled' : ''} placeholder="${A.colors.length >= 5 ? 'Đã đủ 5 mã màu' : 'Gõ mã màu 6 ký tự (VD: C8A96B) rồi Enter — có thể dán nhiều mã'}" maxlength="80"><span class="pill ${A.colors.length === 5 ? 'ok' : 'mut'}">${A.colors.length}/5</span></div><div class="dz-err" id="hex-err" hidden></div>`;
  host.querySelectorAll('.pcol button').forEach((b) => (b.onclick = () => { A.colors.splice(+b.dataset.i, 1); drawColors(); refresh(); }));
  const inp = $('#hex', host);
  const add = () => {
    const toks = inp.value.split(/[\s,;]+/).filter(Boolean), bad = []; let full = false;
    for (const t of toks) { if (!HEX6.test(t)) { bad.push(t); continue; } const c = '#' + t.replace('#', '').toUpperCase(); if (A.colors.includes(c)) continue; if (A.colors.length >= 5) { full = true; break; } A.colors.push(c); }
    const e = $('#hex-err', host);
    const msg = bad.length ? `“${bad.join(', ')}” không phải mã màu 6 ký tự hex (0-9, A-F)` : full ? 'Đã đủ 5 mã màu, các mã còn lại được bỏ qua' : '';
    drawColors(); refresh(); if (msg) { const e2 = $('#hex-err'); e2.textContent = msg; e2.hidden = false; }
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } };
  inp.onblur = () => { if (inp.value.trim()) add(); };
  inp.onpaste = () => setTimeout(() => { if (/[\s,;]/.test(inp.value.trim())) add(); }, 0);
}
function drawSummary() {
  const h = $('#summary'); if (!h) return;
  const row = (k, v) => `<div class="sm-r"><span>${k}</span><b>${v}</b></div>`;
  h.innerHTML = row('Ngữ cảnh', esc(A.context?.name || A.ctxText.trim().slice(0, 60) || '—')) + row('Yêu cầu', esc((A.req.text.trim().slice(0, 60) || (A.req.file ? '[file] ' + A.req.file.name : '—')))) +
    row('Người xem', esc([A.aud.department, A.aud.position, A.aud.level].filter(Boolean).join(' · ') || '—')) + row('Key Metrics', A.metrics.length + (A.periods.length ? ' · ' + A.periods.join(', ') : '')) + row('Dimensions', A.dimensions.length) +
    row('Dữ liệu', esc(A.data?.name || '—') + (A.data ? ` (${A.sheets.length}/${A.data.profile.sheets.length} bảng)` : '')) + row('Theme', A.colors.map((c) => `<i class="sw" style="background:${c}"></i>`).join(''));
}
function panel3() {
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">4</span><div><h2>Dashboard (PBIP)</h2><p class="sub" style="margin:0">Chọn theme màu và (tuỳ chọn) một template dashboard mẫu.</p></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.1</span><b>Theme màu</b>${REQ}<small style="color:var(--mut)">đúng 5 mã màu (6 ký tự hex)</small></div><div id="colors"></div>
      <div class="or"><span>hoặc tải file .txt chứa tối thiểu 5 mã màu</span></div><div id="dz-theme"></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.2</span><b>Template dashboard mẫu</b><small style="color:var(--mut)">không bắt buộc · PNG, JPG, PDF</small></div><div id="dz-tpl"></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">✓</span><b>Tóm tắt</b></div><div id="summary" class="summary"></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">⚙</span><b>Model cho từng chặng</b></div>
      <div class="models">${META.stages.map((s, i) => `<div class="f" style="margin:0"><label>${i + 1}. ${esc(s.name)}</label><select data-m="${i}">${modelOptions(A.models[i])}</select></div>`).join('')}</div>
      <div class="f" style="margin:10px 0 0;max-width:320px"><label>Áp dụng một model cho cả 4 chặng</label><select id="allm"><option value="">— chọn để áp dụng —</option>${modelOptions('')}</select></div></div>
    ${foot(true)}</div>`;
  drawColors();
  dz($('#dz-theme'), { slot: 'theme', exts: ['txt'], title: 'Kéo thả file .txt chứa mã màu vào đây', hint: 'Mỗi mã 6 ký tự hex; ít hơn 5 mã sẽ không được nhận', get: () => A.themeFile, set: (v) => (A.themeFile = v),
    meta: (c) => `${c.colors ? c.colors.length : 0} mã màu được nhận${c.total > 5 ? ` (file có ${c.total} mã, dùng 5 mã đầu)` : ''}`,
    onChange: (r) => { if (r?.colors) { A.colors = [...r.colors]; drawColors(); } } });
  dz($('#dz-tpl'), { slot: 'template', exts: ['png', 'jpg', 'jpeg', 'pdf'], title: 'Kéo thả ảnh / PDF template dashboard vào đây', hint: '.png · .jpg · .pdf', thumb: true, get: () => A.template, set: (v) => (A.template = v), meta: (c) => `${fsize(c.size)} · ${c.kind === 'pdf' ? 'PDF' : 'Hình ảnh'}` });
  $('#panel').querySelectorAll('select[data-m]').forEach((s) => (s.onchange = () => { A.models[+s.dataset.m] = s.value; try { localStorage.setItem('bie-models', JSON.stringify(A.models)); } catch {} }));
  $('#allm').onchange = (e) => { if (!e.target.value) return; A.models = A.models.map(() => e.target.value); try { localStorage.setItem('bie-models', JSON.stringify(A.models)); } catch {} $('#panel').querySelectorAll('select[data-m]').forEach((s) => (s.value = e.target.value)); };
}

async function runAll() {
  const b = $('#wz-next'); b.disabled = true;
  const t = A.template && !A.template.busy ? A.template : null;
  try {
    await jsend(`/api/runs/${A.runId}/start`, 'POST', {
      form: { requirement: A.req.text, requirementFileName: A.req.file?.name, contextFileName: A.context?.name, contextTyped: A.ctxText, templateFileName: t?.name, audience: A.aud, metrics: A.metrics, periods: A.periods, dimensions: A.dimensions, sheets: A.sheets, colors: A.colors },
      models: A.models,
    });
    const id = A.runId; Object.values(A.timers).forEach(clearTimeout); A = freshA(); location.hash = '#home/' + id;
  } catch (e) { toast(e.message); b.disabled = false; }
}

function render() {
  [panel0, panel1, panel2, panel3][A.step]();
  bindFoot(); refresh();
  if (A.step === 1) { drawSug('metrics'); drawSug('dimensions'); }
  window.scrollTo({ top: 0 });
}
function vAnalysis() {
  $('#title').textContent = 'Analysis'; setMeter(null);
  view.innerHTML = `<div class="stepper" id="stepper" role="tablist"></div><div id="panel"></div>`;
  $('#stepper').onclick = (e) => { const b = e.target.closest('.stp'); if (b) go(+b.dataset.i); };
  if (A.step > maxStep()) A.step = maxStep();
  render();
}
