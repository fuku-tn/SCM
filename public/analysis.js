/* Analysis: 4 bước điền thông tin theo thứ tự tuỳ ý; chạy từng chặng hoặc tất cả; thiếu thông tin thì hiện bảng cảnh báo để chọn "Vẫn chạy" hoặc "Quay lại bổ sung" */
const LEVELS = ['Intern / Thực tập', 'Fresher', 'Junior', 'Middle', 'Senior', 'Team Lead', 'Supervisor', 'Manager', 'Senior Manager', 'Director', 'C-level (CEO/CFO/COO...)'];
const GENDERS = ['Nam', 'Nữ', 'Khác / không muốn nêu'];
const EDUCATIONS = ['THPT', 'Trung cấp / Cao đẳng', 'Đại học', 'Thạc sĩ / MBA', 'Tiến sĩ'];
const WSTEPS = [
  { name: 'Business Context', sub: 'Ngữ cảnh & yêu cầu' },
  { name: 'Key Metrics', sub: 'Người xem, chỉ số, chiều' },
  { name: 'Import Data', sub: 'Transformation · Modeling' },
  { name: 'Dashboard (PBIP)', sub: 'Template & màu theme' },
];
const freshA = () => {
  let models = null; try { models = JSON.parse(localStorage.getItem('bie-models') || 'null'); } catch {}
  return {
    runId: null, step: 0,
    context: null, ctxText: '', req: { text: '', file: null },
    aud: { department: '', position: '', level: '', gender: '', education: '', tenureCompany: '', tenureCareer: '' },   // người xem TRỰC TIẾP (Direct) — bắt buộc
    indirect: [], audFile: { direct: null, indirect: null },                                                            // người xem GIÁN TIẾP (Indirect) — không bắt buộc
    tplMode: 'sample', pbix: null, plan: null, planKey: '', planApproved: false, planModel: 'sonnet',
    metrics: [], periods: [], versions: [], dimensions: [],
    sug: { metrics: { state: 'idle', items: [], key: '', err: '' }, dimensions: { state: 'idle', items: [], key: '', err: '' } },
    sugModel: 'haiku',
    data: null, sheets: [], pv: 0,
    colors: [], themeFile: null, tpl: null, tplList: null, colorMode: 'template',
    lang: (() => { try { return localStorage.getItem('bie-lang') === 'vi' ? 'vi' : 'en'; } catch { return 'en'; } })(),
    models: models && models.length === 4 ? models : ['sonnet', 'sonnet', 'sonnet', 'sonnet'],
    gate: (() => { try { const g = JSON.parse(localStorage.getItem('bie-gate') || 'null'); if (g && typeof g === 'object') return { enabled: !!g.enabled, model: g.model || 'sonnet' }; } catch {} return { enabled: false, model: 'sonnet' }; })(),
    timers: {},
  };
};
let A = freshA();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fsize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
// Kỳ so sánh: 3 nhóm dropdown (chọn nhiều). periods → measure time intelligence (script sinh DAX); versions → cần thêm dữ liệu ở bước Import Data
const CMP_GROUPS = [
  { id: 'ver', store: 'versions', title: 'Version', sub: 'So với kế hoạch / dự báo', items: [
    { k: 'BUD', name: 'Budget', d: 'Ngân sách' }, { k: 'TGT', name: 'Target', d: 'Mục tiêu' }, { k: 'FCST', name: 'Forecast', d: 'Dự báo' },
    { k: 'RFCST', name: 'Rolling Forecast', d: 'Dự báo cuốn chiếu' }, { k: 'OUT6', name: 'Outlook (6 tháng)', d: 'Triển vọng 6 tháng tới' }] },
  { id: 'same', store: 'periods', title: 'Cùng kỳ', sub: 'Cùng giai đoạn của kỳ trước', items: [
    { k: 'YoY', name: 'Năm trước', d: 'Cùng kỳ năm trước (YoY)' }, { k: 'QoQ', name: 'Quý trước', d: 'Cùng kỳ quý trước (QoQ)' }, { k: 'MoM', name: 'Tháng trước', d: 'Cùng kỳ tháng trước (MoM)' }] },
  { id: 'prev', store: 'periods', title: 'So với liền trước', sub: 'Cả kỳ liền kề trước đó', items: [
    { k: 'PY', name: 'Năm liền trước', d: 'Toàn bộ năm trước' }, { k: 'PQ', name: 'Quý liền trước', d: 'Toàn bộ quý trước' }, { k: 'PM', name: 'Tháng liền trước', d: 'Toàn bộ tháng trước' }] },
];
const verWarn = () => (A.versions.length ? `⚠ Bạn chọn so sánh với <b>${A.versions.map((k) => CMP_GROUPS[0].items.find((i) => i.k === k).name).join(', ')}</b> — nhớ cung cấp thêm dữ liệu này ở bước <b>3 · Import Data</b> (thêm cột hoặc sheet Budget/Target/Forecast… vào file CSV/Excel). BIE không thể tự tạo số kế hoạch; thiếu dữ liệu thì phần so sánh Version sẽ không làm được.` : '');
const REQ = '<span class="req" title="Bắt buộc">*</span>';

// ---------- validation ----------
const ok21 = () => !!(A.aud.department.trim() && A.aud.position.trim() && A.aud.level && A.aud.gender && A.aud.tenureCompany.trim());
const tplId = () => (A.tplMode === 'upload' ? (A.pbix ? 'upload' : '') : A.tpl || '');
const planKeyNow = () => JSON.stringify({ m: A.metrics, d: A.dimensions, t: tplId(), n: A.pbix?.name || '', l: A.lang, s: A.sheets, a: A.aud.level });
const planStale = () => !!A.plan && A.planKey !== planKeyNow();
const miss = [
  () => { const m = []; if (!A.context && !A.ctxText.trim()) m.push('Nhập ngữ cảnh công ty hoặc tải file'); if (!A.req.text.trim() && !A.req.file) m.push('Nhập yêu cầu phân tích hoặc tải file'); return m; },
  () => { const m = []; if (!ok21()) m.push('Điền đủ phần 2.1 người xem trực tiếp (phòng ban, vị trí, level, giới tính, thâm niên tại doanh nghiệp)'); else { if (!A.metrics.length) m.push('Chọn ít nhất 1 Key Metric'); else if (!A.dimensions.length) m.push('Chọn ít nhất 1 chiều phân tích'); } return m; },
  () => { const m = []; if (!A.data) m.push('Tải file CSV / Excel'); else if (!A.sheets.length) m.push('Chọn ít nhất 1 bảng'); return m; },
  () => {
    const m = [];
    if (A.tplMode === 'upload') { if (!A.pbix) m.push('Tải file template .pbix của bạn (hoặc chuyển sang "Template mẫu")'); } else if (!A.tpl) m.push('Chọn 1 template Power BI');
    if (A.colorMode === 'own' && A.colors.length < 5) m.push(`Cần đủ 5 mã màu (đang có ${A.colors.length}/5) hoặc chọn "Giữ màu của template"`);
    if (tplId()) { if (!A.plan) m.push('Chưa xem và duyệt bố cục dashboard (bấm "Đề xuất bố cục" ở mục 4.3) — nếu bỏ qua, chặng 4 sẽ tự thiết kế'); else if (planStale()) m.push('Bố cục đã duyệt không còn khớp (bạn đã đổi chỉ số/chiều/template/ngôn ngữ) — đề xuất lại ở mục 4.3'); else if (!A.planApproved) m.push('Bố cục mới ở dạng nháp — bấm "Xem & chỉnh bố cục" rồi "Duyệt"'); }
    return m;
  },
];
const stepOk = (i) => miss[i]().length === 0;
// Thông tin mỗi chặng cần (chỉ số bước trong WSTEPS): Key Metrics và các chặng sau đều cần cả dữ liệu để đối chiếu cột
const NEED = [[0], [0, 1, 2], [0, 1, 2], [0, 1, 2, 3]];
const missingFor = (which) => {
  const steps = which === 'all' ? [0, 1, 2, 3] : NEED[which];
  return steps.map((i) => ({ step: i, name: WSTEPS[i].name, items: miss[i]() })).filter((g) => g.items.length);
};

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
    if (o.maxMB && f.size >= o.maxMB * 1048576) { err = `"${f.name}" nặng ${fsize(f.size)} — file phải nhỏ hơn ${o.maxMB}MB`; draw(); toast(err); return; }
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
  // các bước mở tự do: ✓ khi đủ thông tin, "!" khi còn thiếu (không khóa)
  st.innerHTML = WSTEPS.map((s, i) => { const done = stepOk(i), cls = i === A.step ? 'active' : done ? 'done' : '';
    return `<button class="stp ${cls}" data-i="${i}"><span class="stp-n">${done && i !== A.step ? '✓' : i + 1}</span><span class="stp-t"><b>${s.name}</b><small>${s.sub}${done ? '' : ' · <span class="warn-dot" title="Còn thiếu thông tin">còn thiếu</span>'}</small></span></button>`; }).join('');
  const m = miss[A.step](), hint = $('#wz-hint');
  if (hint) hint.innerHTML = m.length ? `<span class="warn">Còn thiếu:</span> ${m.map(esc).join(' · ')}` : '<span class="good">✓ Bước này đã đủ thông tin</span>';
  if (A.step === 1) { drawSug('metrics'); drawSug('dimensions'); autoSuggest(); }
  if (A.step === 3) drawSummary();
}
function go(i) { if (i < 0 || i > 3) return; A.step = i; render(); }

// Thanh chạy: chạy riêng chặng đang xem, hoặc chạy tất cả; chọn model cho từng chặng
function foot() {
  const i = A.step, name = WSTEPS[i].name;
  return `<div class="runbar" id="runbar">
      <div class="rb-l"><span class="rb-t">Chạy chặng ${i + 1} · ${name}</span>
        <label class="rb-m">Model <select data-m="${i}">${modelOptions(A.models[i])}</select></label>
        <details class="rb-all"><summary>Model cho cả 4 chặng</summary>
          <div class="models">${META.stages.map((s, k) => `<div class="f" style="margin:0"><label>${k + 1}. ${esc(s.name)}</label><select data-m="${k}">${modelOptions(A.models[k])}</select></div>`).join('')}</div>
          <div class="f" style="margin:10px 0 0;max-width:320px"><label>Áp dụng một model cho cả 4 chặng</label><select id="allm"><option value="">— chọn để áp dụng —</option>${modelOptions('')}</select></div></details>
        <div class="rb-gate"><label class="rb-chk" title="Sau mỗi chặng, một model độc lập chấm theo tiêu chí nghiệm thu (AC). Trượt tiêu chí critical thì chặng tự chạy lại tối đa 2 lần kèm phản hồi. Tốn thêm token."><input type="checkbox" id="gate-on" ${A.gate.enabled ? 'checked' : ''}> Kiểm chứng độc lập &amp; tự sửa (Evaluator)</label>
          <label class="rb-m" id="gate-m" ${A.gate.enabled ? '' : 'hidden'}>Model đánh giá <select id="gate-model">${modelOptions(A.gate.model)}</select></label></div></div>
      <div class="rb-r"><button class="btn" id="run-one" type="button">▶ Chạy chặng ${i + 1}</button><button class="btn acc" id="run-all" type="button">▶ Chạy tất cả 4 chặng</button></div></div>
    <div class="wz-foot"><button class="btn ghost" id="wz-back" ${i === 0 ? 'disabled' : ''}>← Quay lại</button><div class="wz-hint" id="wz-hint"></div>
    ${i === 3 ? '' : '<button class="btn ghost" id="wz-next">Tiếp tục →</button>'}</div>`;
}
function bindFoot() {
  $('#wz-back').onclick = () => go(A.step - 1);
  const nx = $('#wz-next'); if (nx) nx.onclick = () => go(A.step + 1);
  $('#run-one').onclick = () => runStages(A.step);
  $('#run-all').onclick = () => runStages('all');
  const save = () => { try { localStorage.setItem('bie-models', JSON.stringify(A.models)); } catch {} };
  $('#runbar').querySelectorAll('select[data-m]').forEach((s) => (s.onchange = () => { A.models[+s.dataset.m] = s.value; save(); $('#runbar').querySelectorAll(`select[data-m="${s.dataset.m}"]`).forEach((o) => (o.value = s.value)); }));
  const saveGate = () => { try { localStorage.setItem('bie-gate', JSON.stringify(A.gate)); } catch {} };
  $('#gate-on').onchange = (e) => { A.gate.enabled = e.target.checked; $('#gate-m').hidden = !A.gate.enabled; saveGate(); };
  $('#gate-model').onchange = (e) => { A.gate.model = e.target.value; saveGate(); };
  $('#allm').onchange = (e) => { if (!e.target.value) return; A.models = A.models.map(() => e.target.value); save(); $('#runbar').querySelectorAll('select[data-m]').forEach((s) => (s.value = e.target.value)); };
}

// ---------- panels ----------
function panel0() {
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">1</span><div><h2>Business Context</h2><p class="sub" style="margin:0">Cho BIE biết bối cảnh doanh nghiệp và bạn muốn phân tích điều gì.</p></div></div>
    <div class="sample-bar"><a class="btn ghost sm" href="/api/samples/business-context" download>⬇ Tải file mẫu Business Context (.docx)</a><span class="sub" style="margin:0">Điền file Word rồi tải lên một trong hai ô bên dưới — BIE tự tách phần “Ngữ cảnh” và “Yêu cầu phân tích”.</span></div>
    <div class="f"><label>Ngữ cảnh công ty ${REQ} <small>— gõ trực tiếp hoặc tải file (.md, .pdf, .docx)</small></label>
      <textarea id="ctx" placeholder="VD: Công ty bán lẻ thời trang, 20 cửa hàng trên toàn quốc, doanh thu ~50 tỷ/năm, đang muốn cải thiện hiệu quả từng cửa hàng...">${esc(A.ctxText)}</textarea>
      <div class="or"><span>hoặc</span></div><div id="dz-context"></div></div>
    <div class="f"><label>Yêu cầu phân tích ${REQ} <small>— gõ trực tiếp hoặc tải file (.md, .pdf, .docx)</small></label>
      <textarea id="req" placeholder="VD: Theo dõi doanh thu & lợi nhuận theo khu vực, phát hiện sản phẩm tăng trưởng chậm...">${esc(A.req.text)}</textarea>
      <div class="or"><span>hoặc</span></div><div id="dz-req"></div></div>
    ${foot()}</div>`;
  dz($('#dz-context'), { slot: 'context', exts: ['md', 'pdf', 'docx'], title: 'Tải file ngữ cảnh công ty (không bắt buộc nếu đã điền)', hint: '.md · .pdf · .docx', get: () => A.context, set: (v) => (A.context = v), meta: textMeta,
    onChange: (res) => { if (res && res.alsoRequirement && !A.req.file && !A.req.text.trim()) { A.req.file = { ...res.alsoRequirement, ext: 'docx' }; toast('Đã tách phần “Yêu cầu phân tích” từ file mẫu'); panel0(); bindFoot(); refresh(); } } });
  dz($('#dz-req'), { slot: 'requirement', exts: ['md', 'pdf', 'docx'], title: 'Tải file yêu cầu phân tích (không bắt buộc nếu đã điền)', hint: '.md · .pdf · .docx', get: () => A.req.file, set: (v) => (A.req.file = v), meta: textMeta });
  $('#req').oninput = (e) => { A.req.text = e.target.value; refresh(); };
  $('#ctx').oninput = (e) => { A.ctxText = e.target.value; refresh(); };
}

function panel1() {
  const a = A.aud, inp = (k, label, ph, req) => `<div class="f"><label>${label} ${req ? REQ : '<small>(không bắt buộc)</small>'}</label><input type="text" data-k="${k}" placeholder="${ph}" value="${esc(a[k])}"></div>`;
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">2</span><div><h2>Key Metrics</h2><p class="sub" style="margin:0">Khai báo người xem dashboard, sau đó chọn chỉ số và chiều cần phân tích.</p></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">2.1</span><b>Người xem trực tiếp (Direct)</b>${REQ}<small style="color:var(--mut)">người đọc và ra quyết định từ dashboard — dashboard được thiết kế cho họ</small></div>
      <div class="sample-bar"><a class="btn ghost sm" href="/api/samples/audience-direct" download>⬇ Tải file mẫu Direct (.docx)</a><span class="sub" style="margin:0">Điền file mẫu rồi tải lên: BIE tự điền sẵn form bên dưới và đọc phần ghi chú về người đọc.</span></div>
      <div class="row2">${inp('department', 'Phòng ban', 'VD: Kinh doanh', 1)}${inp('position', 'Vị trí công việc hiện tại', 'VD: Trưởng nhóm bán hàng', 1)}
        <div class="f"><label>Level ${REQ}</label><select data-k="level"><option value="">— chọn level —</option>${LEVELS.map((l) => `<option ${l === a.level ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="f"><label>Giới tính ${REQ}</label><select data-k="gender"><option value="">— chọn —</option>${GENDERS.map((l) => `<option ${l === a.gender ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="f"><label>Học vấn <small>(không bắt buộc)</small></label><select data-k="education"><option value="">— không khai báo —</option>${EDUCATIONS.map((l) => `<option ${l === a.education ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${inp('tenureCompany', 'Thâm niên tại doanh nghiệp hiện tại', 'VD: 3 năm 6 tháng', 1)}${inp('tenureCareer', 'Thâm niên kể từ khi đi làm', 'VD: 8 năm', 0)}</div>
      <div class="f" style="margin-top:6px"><label>Ghi chú về người đọc <small>(không bắt buộc — tải file .docx / .md / .pdf)</small></label><div id="dz-aud-direct"></div></div></div>
    <div class="sec" id="sec-indirect"><div class="sec-h"><span class="sec-n">2.2</span><b>Người xem gián tiếp (Indirect)</b><small style="color:var(--mut)">không bắt buộc · nhận kết quả hoặc bị ảnh hưởng, không trực tiếp dùng dashboard</small></div>
      <div class="sample-bar"><a class="btn ghost sm" href="/api/samples/audience-indirect" download>⬇ Tải file mẫu Indirect (.docx)</a><span class="sub" style="margin:0">Có thể có nhiều người: điền bảng trong file mẫu (mỗi hàng một người/nhóm) rồi tải lên — BIE tự tạo thẻ cho từng người. File khác định dạng vẫn được đọc làm ghi chú.</span></div>
      <div id="ind-list"></div>
      <div class="ind-add"><button type="button" class="btn ghost sm" id="ind-add">＋ Thêm người xem gián tiếp</button></div>
      <div class="f" style="margin-top:10px"><label>Hoặc tải file mô tả người xem gián tiếp <small>(.docx / .md / .pdf)</small></label><div id="dz-aud-indirect"></div></div></div>
    <div class="sec" id="sec-metrics"><div class="sec-h"><span class="sec-n">2.3</span><b>Key Metrics sẽ phân tích</b>${REQ}<span class="lock-note"></span></div>
      <div id="tags-metrics"></div><div id="sug-metrics" class="sug-box"></div></div>
    <div class="sec" id="sec-periods"><div class="sec-h"><span class="sec-n">2.4</span><b>Kỳ so sánh cần tính</b><small style="color:var(--mut)">chọn nhiều · không bắt buộc</small><span class="lock-note"></span></div>
      <div class="cmp-grid">${CMP_GROUPS.map((g) => `<div class="f" style="margin:0"><label>${g.title} <small>— ${g.sub}</small></label>
        <details class="dd" data-g="${g.id}"><summary><span class="dd-v" data-sum="${g.id}"></span></summary>
          <div class="dd-menu">${g.items.map((i) => `<label class="dd-o"><input type="checkbox" data-st="${g.store}" data-pk="${i.k}" ${A[g.store].includes(i.k) ? 'checked' : ''}><span><b>${i.name}</b><small>${i.d}</small></span></label>`).join('')}</div></details></div>`).join('')}</div>
      <div class="warn-box" id="ver-warn" ${A.versions.length ? '' : 'hidden'}>${verWarn()}</div></div>
    <div class="sec" id="sec-dims"><div class="sec-h"><span class="sec-n">2.5</span><b>Các chiều (Dimension) đi cùng chỉ số</b>${REQ}<span class="lock-note"></span></div>
      <div id="tags-dims"></div><div id="sug-dimensions" class="sug-box"></div></div>
    ${foot()}</div>`;
  $('#panel').querySelectorAll('[data-k]').forEach((el) => { const h = () => { A.aud[el.dataset.k] = el.value; refresh(); }; el.oninput = h; el.onchange = h; });
  const fillDirect = (res) => {
    if (res && res.blank) toast('File mẫu chưa được điền — chưa đọc được thông tin nào');
    const f = res && res.parsed && res.parsed.fields; if (!f) return;
    let n = 0; for (const [k, v] of Object.entries(f)) if (k !== 'name' && v && !String(A.aud[k] || '').trim()) { A.aud[k] = v; n++; }
    if (n) { toast(`Đã điền sẵn ${n} trường từ file`); panel1(); bindFoot(); refresh(); }
  };
  dz($('#dz-aud-direct'), { slot: 'audienceDirect', exts: ['docx', 'md', 'pdf'], title: 'Tải file ghi chú về người xem trực tiếp (không bắt buộc)', hint: '.docx · .md · .pdf — nên dùng file mẫu ở trên', get: () => A.audFile.direct, set: (v) => (A.audFile.direct = v), meta: textMeta, onChange: fillDirect });
  const drawInd = () => {
    const host = $('#ind-list'); if (!host) return;
    const sel = (k, i, opts, v, ph) => `<select data-ik="${k}" data-i="${i}"><option value="">${ph}</option>${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const inpI = (k, i, v, ph) => `<input type="text" data-ik="${k}" data-i="${i}" placeholder="${ph}" value="${esc(v || '')}">`;
    host.innerHTML = A.indirect.length ? A.indirect.map((p, i) => `<div class="ind-card"><div class="ind-h"><b>Người xem gián tiếp ${i + 1}</b><button class="icon-btn sm" data-rm="${i}" title="Xóa" aria-label="Xóa người xem ${i + 1}">✕</button></div>
      <div class="ind-grid">${inpI('name', i, p.name, 'Họ tên / nhóm (VD: Giám đốc Kinh doanh)')}${inpI('department', i, p.department, 'Phòng ban')}${inpI('position', i, p.position, 'Vị trí')}
        ${sel('level', i, LEVELS, p.level, 'Level')}${sel('gender', i, GENDERS, p.gender, 'Giới tính')}${sel('education', i, EDUCATIONS, p.education, 'Học vấn')}
        ${inpI('tenureCompany', i, p.tenureCompany, 'Thâm niên tại DN')}${inpI('tenureCareer', i, p.tenureCareer, 'Thâm niên đi làm')}${inpI('note', i, p.note, 'Họ cần gì từ dashboard?')}</div></div>`).join('') : '<div class="sub" style="margin:0 0 8px">Chưa có người xem gián tiếp nào — bỏ qua cũng được.</div>';
    host.querySelectorAll('[data-ik]').forEach((el) => { const h = () => { A.indirect[+el.dataset.i][el.dataset.ik] = el.value; refresh(); }; el.oninput = h; el.onchange = h; });
    host.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { A.indirect.splice(+b.dataset.rm, 1); drawInd(); refresh(); }));
  };
  $('#ind-add').onclick = () => { A.indirect.push({}); drawInd(); };
  dz($('#dz-aud-indirect'), { slot: 'audienceIndirect', exts: ['docx', 'md', 'pdf'], title: 'Tải file mô tả người xem gián tiếp (không bắt buộc)', hint: '.docx · .md · .pdf — bảng nhiều người theo file mẫu sẽ tự tạo thẻ',
    get: () => A.audFile.indirect, set: (v) => (A.audFile.indirect = v), meta: (c) => textMeta(c) + (c.people ? ` · ${c.people.length} người đọc được từ bảng` : ''),
    onChange: (res) => { if (res && res.blank) toast('File mẫu chưa được điền — chưa đọc được người nào'); if (res && res.people && res.people.length) { A.indirect = A.indirect.filter((p) => Object.values(p).some((x) => String(x || '').trim())).concat(res.people); drawInd(); toast(`Đã tạo ${res.people.length} thẻ người xem gián tiếp từ file`); } } });
  drawInd();
  const drawSum = () => CMP_GROUPS.forEach((g) => { const el = $(`[data-sum="${g.id}"]`); if (!el) return; const on = g.items.filter((i) => A[g.store].includes(i.k)); el.textContent = on.length ? on.map((i) => i.name).join(', ') : '— chưa chọn —'; el.classList.toggle('empty', !on.length); });
  drawSum();
  $('#panel').querySelectorAll('.dd input[data-pk]').forEach((c) => (c.onchange = () => {
    const st = c.dataset.st, k = c.dataset.pk; A[st] = c.checked ? [...new Set([...A[st], k])] : A[st].filter((x) => x !== k);
    drawSum(); const w = $('#ver-warn'); if (w) { w.innerHTML = verWarn(); w.hidden = !A.versions.length; } refresh();
  }));
  document.onclick = (e) => { if (!e.target.closest('.dd')) document.querySelectorAll('.dd[open]').forEach((d) => d.removeAttribute('open')); };
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
    ${A.versions.length ? `<div class="warn-box">${verWarn()}</div>` : ''}
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
    row('Người xem trực tiếp', esc([A.aud.department, A.aud.position, A.aud.level, A.aud.education].filter(Boolean).join(' · ') || '—')) + row('Người xem gián tiếp', A.indirect.filter(indFilled).length ? A.indirect.filter(indFilled).length + ' người/nhóm' : (A.audFile.indirect ? 'từ file' : 'không có')) + row('Key Metrics', A.metrics.length + (A.periods.length ? ' · ' + A.periods.join(', ') : '') + (A.versions.length ? ' · Version: ' + A.versions.join(', ') : '')) + row('Dimensions', A.dimensions.length) +
    row('Dữ liệu', esc(A.data?.name || '—') + (A.data ? ` (${A.sheets.length}/${A.data.profile.sheets.length} bảng)` : '')) + row('Template', esc(A.tplMode === 'upload' ? (A.pbix?.template ? A.pbix.template.name + ' (của bạn)' : '—') : ((A.tplList && (A.tplList.find((t) => t.id === A.tpl) || {}).name) || '—'))) + row('Bố cục dashboard', !A.plan ? 'chưa đề xuất' : planStale() ? 'không còn khớp' : (A.planApproved ? '✓ đã duyệt · ' : 'nháp · ') + planCounts(A.plan).pages + ' trang · ' + planCounts(A.plan).visuals + ' biểu đồ') + row('Ngôn ngữ dashboard', A.lang === 'vi' ? 'Tiếng Việt' : 'English') + row('Màu theme', A.colorMode === 'own' ? A.colors.map((c) => `<i class="sw" style="background:${c}"></i>`).join('') : 'Giữ màu của template');
}
async function drawTemplates() {
  const host = $('#tpl-list'); if (!host) return;
  if (!A.tplList) {
    host.innerHTML = '<div class="tplgrid">' + '<div class="tplcard skel"><i class="shim" style="width:100%;height:170px;border-radius:14px"></i></div>'.repeat(2) + '</div>';
    try { A.tplList = await jget('/api/templates'); } catch (e) { host.innerHTML = `<div class="err-box">Không đọc được danh sách template: ${esc(e.message)}</div>`; return; }
    if (!$('#tpl-list')) return;
  }
  if (!A.tplList.length) { host.innerHTML = '<div class="err-box">Chưa có template nào. Hãy đặt file .pbix vào thư mục <code>templates/</code> rồi tải lại trang.</div>'; return; }
  const sel = A.tplList.find((t) => t.id === A.tpl);
  host.innerHTML = `<div class="tplgrid" role="radiogroup" aria-label="Template Power BI">${A.tplList.map((t) => `
    <button type="button" role="radio" aria-checked="${t.id === A.tpl}" class="tplcard ${t.id === A.tpl ? 'on' : ''}" data-t="${esc(t.id)}">
      <span class="tpl-prev" ${t.hasPreview ? `style="background-image:url('/api/templates/${encodeURIComponent(t.id)}/preview')"` : ''}><img src="/api/templates/${encodeURIComponent(t.id)}/wireframe.svg" alt="Sơ đồ bố cục ${esc(t.name)}" loading="lazy"><span class="tpl-chk">✓</span></span>
      <span class="tpl-body"><b>${esc(t.name)}</b>
        <span class="tpl-meta">${t.pages.length} trang · ${t.dataVisuals} biểu đồ dữ liệu · ${t.sizeMB} MB</span>
        <span class="tpl-pages">${t.pages.map((p) => `<i>${esc(p.name)}</i>`).join('')}</span>
        <span class="tpl-sw">${(t.themeColors || []).map((c) => `<i style="background:${c}" title="${c}"></i>`).join('')}</span></span>
    </button>`).join('')}</div>`;
  host.querySelectorAll('.tplcard').forEach((b) => (b.onclick = () => { A.tpl = b.dataset.t; drawTemplates(); drawPlanBox(); refresh(); }));
  if (sel) { const s = $('#tpl-sel'); if (s) s.textContent = sel.name; }
}
function panel3() {
  $('#panel').innerHTML = `<div class="card wz-card"><div class="wz-title"><span class="fn-badge">4</span><div><h2>Dashboard (PBIP)</h2><p class="sub" style="margin:0">Chọn 1 template Power BI — file đầu ra sẽ có giao diện giống template, dữ liệu là của bạn.</p></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.1</span><b>Template Power BI</b>${REQ}</div>
      <div class="seg" role="radiogroup" aria-label="Nguồn template">
        <button type="button" role="radio" data-tm="sample" class="${A.tplMode === 'sample' ? 'on' : ''}" aria-checked="${A.tplMode === 'sample'}"><b>Dùng template mẫu</b><small>Chọn 1 trong các template có sẵn của BIE</small></button>
        <button type="button" role="radio" data-tm="upload" class="${A.tplMode === 'upload' ? 'on' : ''}" aria-checked="${A.tplMode === 'upload'}"><b>Tải template của bạn</b><small>File .pbix (định dạng PBIR), nhỏ hơn 100MB</small></button></div>
      <div id="tpl-sample" ${A.tplMode === 'sample' ? '' : 'hidden'} style="margin-top:14px"><div id="tpl-list"></div></div>
      <div id="tpl-upload" ${A.tplMode === 'upload' ? '' : 'hidden'} style="margin-top:14px"><div id="dz-pbix"></div><div id="pbix-view"></div>
        <p class="sub" style="margin:10px 0 0">Template có thể chỉ 1 trang — BIE sẽ nhân bản trang để đủ phân tích mọi chỉ số, mỗi trang giữ đúng số biểu đồ của trang template. Bookmark, drillthrough và custom visual không được mang theo.</p></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.2</span><b>Ngôn ngữ dashboard</b><small style="color:var(--mut)">tên measure, tiêu đề trang/biểu đồ, nhãn hiển thị trong file Power BI</small></div>
      <div class="seg" role="radiogroup" aria-label="Ngôn ngữ dashboard">
        <button type="button" role="radio" data-lang="en" class="${A.lang === 'en' ? 'on' : ''}" aria-checked="${A.lang === 'en'}"><b>English</b><small>Toàn bộ chữ trên dashboard bằng tiếng Anh</small></button>
        <button type="button" role="radio" data-lang="vi" class="${A.lang === 'vi' ? 'on' : ''}" aria-checked="${A.lang === 'vi'}"><b>Tiếng Việt</b><small>Chữ trên dashboard bằng tiếng Việt</small></button></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.3</span><b>Bố cục dashboard</b><small style="color:var(--mut)">xem trước các trang &amp; biểu đồ, góp ý rồi duyệt — trước khi chạy chặng 4</small></div>
      <div id="plan-box"></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">4.4</span><b>Màu theme</b></div>
      <div class="seg" role="radiogroup" aria-label="Màu theme">
        <button type="button" role="radio" data-cm="template" class="${A.colorMode === 'template' ? 'on' : ''}" aria-checked="${A.colorMode === 'template'}"><b>Giữ màu của template</b><small>Giống template nhất (khuyến nghị)</small></button>
        <button type="button" role="radio" data-cm="own" class="${A.colorMode === 'own' ? 'on' : ''}" aria-checked="${A.colorMode === 'own'}"><b>Dùng 5 màu của tôi</b><small>Thay bảng màu dữ liệu của template</small></button></div>
      <div id="own-colors" ${A.colorMode === 'own' ? '' : 'hidden'}>
        <div class="sec-h" style="margin:16px 0 10px"><b>5 mã màu</b>${REQ}<small style="color:var(--mut)">đúng 5 mã (6 ký tự hex)</small></div><div id="colors"></div>
        <div class="or"><span>hoặc tải file .txt chứa tối thiểu 5 mã màu</span></div><div id="dz-theme"></div></div></div>
    <div class="sec"><div class="sec-h"><span class="sec-n">✓</span><b>Tóm tắt</b></div><div id="summary" class="summary"></div></div>
    ${foot()}</div>`;
  drawColors();
  dz($('#dz-theme'), { slot: 'theme', exts: ['txt'], title: 'Kéo thả file .txt chứa mã màu vào đây', hint: 'Mỗi mã 6 ký tự hex; ít hơn 5 mã sẽ không được nhận', get: () => A.themeFile, set: (v) => (A.themeFile = v),
    meta: (c) => `${c.colors ? c.colors.length : 0} mã màu được nhận${c.total > 5 ? ` (file có ${c.total} mã, dùng 5 mã đầu)` : ''}`,
    onChange: (r) => { if (r?.colors) { A.colors = [...r.colors]; drawColors(); } } });
  drawTemplates();
  drawPbix(); drawPlanBox();
  $('#panel').querySelectorAll('[data-tm]').forEach((b) => (b.onclick = () => {
    A.tplMode = b.dataset.tm; $('#panel').querySelectorAll('[data-tm]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    $('#tpl-sample').hidden = A.tplMode !== 'sample'; $('#tpl-upload').hidden = A.tplMode !== 'upload'; drawPlanBox(); refresh();
  }));
  $('#panel').querySelectorAll('[data-lang]').forEach((b) => (b.onclick = () => { A.lang = b.dataset.lang; try { localStorage.setItem('bie-lang', A.lang); } catch {} drawPlanBox(); $('#panel').querySelectorAll('[data-lang]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); }));
  $('#panel').querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => { A.colorMode = b.dataset.cm; $('#panel').querySelectorAll('[data-cm]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); }); $('#own-colors').hidden = A.colorMode !== 'own'; refresh(); }));
}

// ---------- chạy ----------
const indFilled = (p) => Object.values(p).some((x) => String(x || '').trim());
const buildForm = () => ({ requirement: A.req.text, requirementFileName: A.req.file?.name, contextFileName: A.context?.name, contextTyped: A.ctxText, template: A.tplMode === 'upload' ? '' : A.tpl, templateSource: A.tplMode === 'upload' ? 'upload' : 'sample', colorMode: A.colorMode, dashboardLanguage: A.lang, audience: A.aud, indirect: A.indirect.filter(indFilled), metrics: A.metrics, periods: A.periods, versions: A.versions, dimensions: A.dimensions, sheets: A.sheets, colors: A.colorMode === 'own' ? A.colors : [] });

// Bảng cảnh báo khi thiếu thông tin: người dùng chọn "Vẫn chạy" hoặc "Quay lại bổ sung"
function showMissing(groups, label) {
  return new Promise((resolve) => {
    closeModal();
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal warn" role="dialog" aria-modal="true" aria-labelledby="mm-t">
      <div class="modal-h"><div><span class="pill">Thiếu thông tin</span><h3 id="mm-t">Chưa điền đủ thông tin để chạy ${esc(label)}</h3></div><button class="icon-btn" data-x aria-label="Đóng">✕</button></div>
      <div class="modal-b"><p class="sub" style="margin:0 0 12px">Bạn có thể chạy ngay với thông tin hiện có — kết quả có thể kém chính xác hoặc chặng có thể báo lỗi — hoặc quay lại bổ sung.</p>
        ${groups.map((g) => `<div class="m-sec"><b>Bước ${g.step + 1} · ${esc(g.name)}</b><ul class="miss">${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
      <div class="modal-f"><button class="btn ghost" data-back>← Quay lại bổ sung</button><button class="btn acc" data-go>▶ Vẫn chạy</button></div></div>`;
    document.body.appendChild(bg);
    const done = (v) => { closeModal(); resolve(v); };
    bg.onclick = (e) => { if (e.target === bg) done('back'); };
    bg.querySelector('[data-x]').onclick = () => done('back');
    bg.querySelector('[data-back]').onclick = () => done('back');
    bg.querySelector('[data-go]').onclick = () => done('go');
    document.onkeydown = (e) => { if (e.key === 'Escape') done('back'); };
    bg.querySelector('[data-back]').focus();
  });
}

async function runStages(which) {
  const label = which === 'all' ? 'cả 4 chặng' : `chặng ${which + 1} (${WSTEPS[which].name})`;
  const groups = missingFor(which);
  if (groups.length) {
    const c = await showMissing(groups, label);
    if (c === 'back') { go(groups[0].step); toast(`Quay lại Bước ${groups[0].step + 1} để bổ sung`); return; }
  }
  const btns = [$('#run-one'), $('#run-all')].filter(Boolean); btns.forEach((b) => (b.disabled = true));
  try {
    const id = await ensureRun();
    if (planStale()) { await fetch(`/api/runs/${id}/plan`, { method: 'DELETE' }).catch(() => {}); A.plan = null; A.planApproved = false; }   // bố cục cũ không còn khớp → không dùng
    else if (A.plan && !A.planApproved) await fetch(`/api/runs/${id}/plan`, { method: 'DELETE' }).catch(() => {});                          // bản nháp chưa duyệt → chặng 4 tự thiết kế
    await jsend(`/api/runs/${id}/start`, 'POST', { form: buildForm(), models: A.models, gate: A.gate, only: which === 'all' ? null : [which] });
    A.started = true;
    if (which === 'all') { Object.values(A.timers).forEach(clearTimeout); A = freshA(); }   // chạy tất cả → phiên mới sau đó
    location.hash = '#home/' + id;                                                          // chạy 1 chặng → giữ phiên để chạy tiếp chặng sau
  } catch (e) { toast(e.message); btns.forEach((b) => (b.disabled = false)); }
}

async function drawSession() {
  const host = $('#sessionbar'); if (!host) return;
  if (!A.runId || !A.started) { host.hidden = true; return; }
  let r = null; try { r = await jget('/api/runs/' + A.runId); } catch {}
  if (!$('#sessionbar')) return;
  host.hidden = false;
  host.innerHTML = `<div class="sb-l"><b>Đang làm việc trên phiên</b> <code>${esc(A.runId)}</code>${r ? ' ' + r.stages.map((s, i) => `<span class="pill ${s.status === 'done' ? 'ok' : s.status === 'error' ? 'err' : s.status === 'running' ? 'run' : 'mut'}" title="${esc(s.name)}">${i + 1} ${{ done: '✓', error: '✗', running: '…', pending: '—' }[s.status] || '—'}</span>`).join(' ') : ''}</div>
    <div class="sb-r"><a class="btn ghost sm" href="#home/${esc(A.runId)}" style="text-decoration:none">Xem Workflow</a><button class="btn ghost sm" id="sb-new">＋ Phiên mới</button></div>`;
  $('#sb-new').onclick = () => { if (!confirm('Bắt đầu phiên mới? Thông tin đang điền sẽ bị xóa.')) return; Object.values(A.timers).forEach(clearTimeout); A = freshA(); vAnalysis(); };
}

function render() {
  [panel0, panel1, panel2, panel3][A.step]();
  bindFoot(); refresh();
  if (A.step === 1) { drawSug('metrics'); drawSug('dimensions'); }
  window.scrollTo({ top: 0 });
}
function vAnalysis() {
  $('#title').textContent = 'Analysis'; setMeter(null);
  view.innerHTML = `<div class="sessionbar card" id="sessionbar" hidden></div><div class="stepper" id="stepper" role="tablist"></div><div id="panel"></div>`;
  $('#stepper').onclick = (e) => { const b = e.target.closest('.stp'); if (b) go(+b.dataset.i); };
  render(); drawSession();
}
