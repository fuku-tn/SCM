/* BIE front-end (vanilla JS) */
const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const fmt = (n) => (n || 0).toLocaleString('vi-VN');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (u, o) => { const r = await fetch(u, o); if (!r.ok) { let m; try { m = (await r.json()).error; } catch {} throw new Error(m || r.statusText); } return r; };
const jget = async (u) => (await api(u)).json();
const jsend = (u, method, body) => api(u, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }
const dur = (ms) => (ms ? (ms / 1000).toFixed(1) + 's' : '—');

let META = { stages: [], models: [] };
let poll = null;
const stopPoll = () => { clearInterval(poll); poll = null; };

// ---- Form state (giữ khi chuyển trang) ----
const S = {
  runId: null, profile: null, sheet: 0,
  form: { requirement: '', metrics: [], dimensions: [], audience: { position: '', title: '', seniority: '', degree: '' }, context: '' },
  models: JSON.parse(localStorage.getItem('bie-models') || 'null') || ['sonnet', 'sonnet', 'sonnet', 'sonnet'],
};

// ---- Theme ----
$('#theme').onclick = () => {
  const d = document.documentElement; const t = d.dataset.theme === 'dark' ? 'light' : 'dark';
  d.dataset.theme = t; try { localStorage.setItem('bie-theme', t); } catch {}
};

// ---- Meter (token + context window) ----
function setMeter(t) {
  if (!t || !t.total) { $('#m-tok').textContent = '0'; $('#m-fill').style.width = '0'; $('#m-ctx').textContent = 'Context —'; return; }
  $('#m-tok').textContent = fmt(t.total);
  const pct = t.contextWindow ? Math.min(100, (t.maxContext / t.contextWindow) * 100) : 0;
  $('#m-fill').style.width = pct + '%';
  $('#m-ctx').textContent = `Context ${fmt(t.maxContext)} / ${fmt(t.contextWindow)} (${pct.toFixed(1)}%)`;
}

// ---- tiny markdown ----
function md(src) {
  const blocks = []; let s = esc(src).replace(/```(\w*)\n([\s\S]*?)```/g, (_, l, c) => { blocks.push(`<pre><code>${c}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t) => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
  const lines = s.split('\n'); let out = '', list = null, tbl = [];
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushTbl = () => {
    if (!tbl.length) return;
    const rows = tbl.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
    out += '<table>' + rows.map((r, i) => '<tr>' + r.map((c) => `<${i ? 'td' : 'th'}>${c}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'; tbl = [];
  };
  for (const ln of lines) {
    if (/^\s*\|.*\|\s*$/.test(ln)) { closeList(); tbl.push(ln); continue; } else flushTbl();
    let m;
    if ((m = ln.match(/^(#{1,4})\s+(.*)/))) { closeList(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = ln.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { closeList(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; }
    else if ((m = ln.match(/^\s*\d+\.\s+(.*)/))) { if (list !== 'ol') { closeList(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; }
    else if (/^\u0000\d+\u0000$/.test(ln.trim())) { closeList(); out += ln.trim(); }
    else if (ln.trim() === '') closeList();
    else { closeList(); out += `<p>${inline(ln)}</p>`; }
  }
  closeList(); flushTbl();
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

// ---- Tag input (multi-select + free text) ----
function tagInput(host, key, suggestions) {
  const list = S.form[key];
  const draw = () => {
    host.innerHTML = `<div class="tags">${list.map((t, i) => `<span class="t">${esc(t)}<button data-i="${i}" title="Xóa">×</button></span>`).join('')}<input type="text" placeholder="${list.length ? '' : 'Chọn gợi ý bên dưới hoặc gõ rồi Enter'}"></div>
      <div class="sug">${suggestions.filter((s) => !list.includes(s)).map((s) => `<button type="button" data-s="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>`;
    const inp = $('input', host);
    host.onclick = (e) => { if (e.target.closest('.tags') && e.target.tagName !== 'BUTTON') inp.focus(); };
    const add = (v) => { v = v.trim(); if (v && !list.includes(v)) { list.push(v); draw(); $('input', host).focus(); } };
    inp.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inp.value); } else if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); draw(); $('input', host).focus(); } };
    inp.onblur = () => { if (inp.value.trim()) add(inp.value); };
    host.querySelectorAll('.t button').forEach((b) => (b.onclick = () => { list.splice(+b.dataset.i, 1); draw(); }));
    host.querySelectorAll('.sug button').forEach((b) => (b.onclick = () => add(b.dataset.s)));
  };
  draw();
}

const modelOptions = (sel) => META.models.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
const statusPill = (s) => ({ done: '<span class="pill ok">Hoàn thành</span>', running: '<span class="pill run"><span class="spin"></span> Đang chạy</span>', error: '<span class="pill err">Lỗi</span>', pending: '<span class="pill mut">Chờ</span>', partial: '<span class="pill mut">Dừng giữa chừng</span>', draft: '<span class="pill mut">Nháp</span>' }[s] || '');

// ================= VIEW: RUN =================
const openState = {};
async function vRun(id) {
  stopPoll();
  $('#title').textContent = 'Kết quả chạy';
  if (!id) {
    const runs = await jget('/api/runs');
    if (runs.length) { location.replace('#run/' + runs[0].id); return; }
    view.innerHTML = '<div class="card empty">Chưa có lần chạy nào. Hãy tạo <a href="#analysis">Analysis</a>.</div>'; setMeter(null); return;
  }
  const draw = async () => {
    let r; try { r = await jget('/api/runs/' + id); } catch { view.innerHTML = '<div class="card empty">Không tìm thấy lần chạy.</div>'; stopPoll(); return; }
    const t = r.totals; setMeter(t);
    const pct = t.contextWindow ? Math.min(100, (t.maxContext / t.contextWindow) * 100) : 0;
    const prevScroll = window.scrollY;
    view.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h2 style="margin:0">${esc(r.form?.requirement?.slice(0, 120) || r.file)}</h2><div class="sub" style="margin:4px 0 0">Run <code>${esc(r.id)}</code> · file <b>${esc(r.file)}</b> · output/${esc(r.id)}/</div></div>
      <div>${statusPill(r.running ? 'running' : r.status)}</div></div>
    <div class="grid4">
      <div class="stat"><div class="k">Tổng token</div><div class="v">${fmt(t.total)}</div><div class="s">in ${fmt(t.input)} · out ${fmt(t.output)} · cache ${fmt(t.cacheRead + t.cacheCreate)}</div></div>
      <div class="stat"><div class="k">Context Window (chặng lớn nhất)</div><div class="v">${pct.toFixed(1)}%</div><div class="ctxbar"><i style="width:${pct}%"></i></div><div class="s">${fmt(t.maxContext)} / ${fmt(t.contextWindow)} token</div></div>
      <div class="stat"><div class="k">Chi phí ước tính</div><div class="v">$${(t.cost || 0).toFixed(4)}</div><div class="s">theo số liệu từ CLI</div></div>
      <div class="stat"><div class="k">Thời gian model</div><div class="v">${dur(t.ms)}</div><div class="s">${r.stages.filter((s) => s.status === 'done').length}/${r.stages.length} chặng xong</div></div>
    </div>
    ${r.stages.map((s, i) => stageCard(r, s, i)).join('')}`;
    window.scrollTo(0, prevScroll);
    bindRun(r);
    if (!r.running) stopPoll();
  };
  await draw();
  poll = setInterval(draw, 1500);
}
function stageCard(r, s, i) {
  const u = s.usage; const ctx = u ? u.input + u.cacheRead + u.cacheCreate + u.output : 0;
  const open = openState[r.id + s.id] ?? (s.status === 'done' && i === r.stages.length - 1);
  return `<div class="card stg" data-sid="${s.id}">
    <div class="stg-h"><div class="l"><div class="step" style="padding:0;background:none"><div class="n">${i + 1}</div></div><div><b style="font-size:16px">${esc(s.name)}</b><div class="sub" style="margin:0">output/${esc(r.id)}/${esc(s.id)}/</div></div></div>
      <div style="display:flex;gap:8px;align-items:center">${statusPill(s.status)}
        <select data-model="${i}" style="width:auto;padding:5px 28px 5px 10px;font-size:12px" ${r.running ? 'disabled' : ''}>${modelOptions(s.model)}</select>
        <button class="btn ghost sm" data-rerun="${i}" ${r.running ? 'disabled' : ''}>↻ Chạy lại chặng này</button></div></div>
    ${s.status === 'done' ? `<div class="meta"><span>Model <b>${esc(s.usedModel || s.model)}</b></span><span>Input <b>${fmt(u.input)}</b></span><span>Output <b>${fmt(u.output)}</b></span><span>Cache <b>${fmt(u.cacheRead + u.cacheCreate)}</b></span><span>Context <b>${fmt(ctx)} / ${fmt(s.contextWindow)}</b> (${((ctx / s.contextWindow) * 100).toFixed(1)}%)</span><span>Thời gian <b>${dur(s.ms)}</b></span><span>$<b>${(s.cost || 0).toFixed(4)}</b></span></div>` : ''}
    ${s.status === 'running' ? `<div class="meta"><span class="spin"></span><span>Prompt ước tính ~<b>${fmt(s.promptTokensEst)}</b> token — đang chờ model...</span></div>` : ''}
    ${s.error ? `<div class="err-box">${esc(s.error)}</div>` : ''}
    ${s.status === 'done' ? `<div class="files">${s.files.map((f) => `<a href="#" data-file="${f}" data-sid="${s.id}" class="${f === 'result.md' && open ? 'on' : ''}">${f}</a>`).join('')}<a href="/api/runs/${r.id}/stages/${s.id}/result.md?download=1">⬇ tải result.md</a></div>
      <div class="md" data-view="${s.id}" ${open ? '' : 'hidden'}></div>
      <button class="btn ghost sm" data-toggle="${s.id}" style="margin-top:8px">${open ? 'Thu gọn' : 'Xem kết quả'}</button>` : ''}
  </div>`;
}
function bindRun(r) {
  const load = async (sid, f) => {
    const box = $(`[data-view="${sid}"]`, view); if (!box) return;
    const txt = await (await api(`/api/runs/${r.id}/stages/${sid}/${f}`)).text();
    box.innerHTML = f.endsWith('.md') ? md(txt) : `<pre style="white-space:pre-wrap;margin:0">${esc(txt)}</pre>`; box.hidden = false;
    view.querySelectorAll(`[data-sid="${sid}"][data-file]`).forEach((a) => a.classList.toggle('on', a.dataset.file === f));
  };
  view.querySelectorAll('[data-view]').forEach((b) => { if (!b.hidden) load(b.dataset.view, 'result.md'); });
  view.querySelectorAll('[data-file]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); openState[r.id + a.dataset.sid] = true; load(a.dataset.sid, a.dataset.file); }));
  view.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => { const sid = b.dataset.toggle; const box = $(`[data-view="${sid}"]`, view); const show = box.hidden; openState[r.id + sid] = show; box.hidden = !show; b.textContent = show ? 'Thu gọn' : 'Xem kết quả'; if (show) load(sid, 'result.md'); }));
  view.querySelectorAll('[data-rerun]').forEach((b) => (b.onclick = async () => {
    const i = +b.dataset.rerun; const model = $(`select[data-model="${i}"]`, view).value;
    const later = r.stages.length - i - 1;
    const only = later > 0 ? !confirm(`Chạy lại chặng "${r.stages[i].name}" và ${later} chặng sau nó?\n\nOK = chạy từ chặng này đến hết · Hủy = chỉ chạy riêng chặng này`) : true;
    try { await jsend(`/api/runs/${r.id}/stages/${i}/rerun`, 'POST', { model, only }); vRun(r.id); } catch (e) { toast(e.message); }
  }));
}

// ================= VIEW: SKILLS =================
// Gom file từ thao tác thả (hỗ trợ cả thư mục) -> [{file, path}]
async function collectDropped(dt) {
  const out = [];
  const walk = (entry, prefix) => new Promise((resolve) => {
    if (entry.isFile) entry.file((f) => { out.push({ file: f, path: prefix + entry.name }); resolve(); }, resolve);
    else if (entry.isDirectory) {
      const reader = entry.createReader(); const all = [];
      const more = () => reader.readEntries(async (es) => {
        if (!es.length) { await Promise.all(all.map((e) => walk(e, prefix + entry.name + '/'))); resolve(); } else { all.push(...es); more(); }
      }, resolve);
      more();
    } else resolve();
  });
  const entries = [...(dt.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean); // phải gọi đồng bộ
  if (entries.length) await Promise.all(entries.map((e) => walk(e, '')));
  else [...dt.files].forEach((f) => out.push({ file: f, path: f.name }));
  return out;
}
async function uploadSkill(stageId, items) {
  const fd = new FormData();
  items.forEach((it) => { fd.append('paths', it.path); fd.append('files', it.file, it.file.name); });
  const r = await fetch(`/api/skills/${stageId}/upload`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j;
}
const kb = (n) => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB');

async function vSkills() {
  $('#title').textContent = 'Chặng & SKILL'; setMeter(null);
  let skills = await jget('/api/skills'); let cur = 0; const busy = {};
  const draw = () => {
    view.innerHTML = `
    <div class="card"><h2>Nạp SKILL cho từng chặng</h2>
      <p class="sub" style="margin:0">Giống nạp skill trong Claude chat: kéo thả vào ô của chặng một file <b>.zip / .skill</b>, một <b>thư mục skill</b> (có SKILL.md) hoặc trực tiếp file <b>SKILL.md</b>. Bản cũ được sao lưu tại <code>skills/_backup/</code>.</p></div>
    <div class="slots">${skills.map((s, i) => {
      const nm = s.meta.title || s.meta.name || s.name; const extra = s.files.filter((f) => f.path !== 'SKILL.md');
      const ph = s.content.includes('PLACEHOLDER');
      return `<div class="slot ${i === cur ? 'sel' : ''}" data-i="${i}">
        <div class="slot-h"><span class="fn-badge">${i + 1}</span><div><b>${esc(s.name)}</b><div class="sub" style="margin:0">skills/${esc(s.id)}/</div></div>${busy[s.id] ? '<span class="spin" style="margin-left:auto"></span>' : `<span class="pill ${ph ? 'mut' : 'ok'}" style="margin-left:auto">${ph ? 'Mẫu giữ chỗ' : 'Đã nạp'}</span>`}</div>
        <div class="slot-body"><div class="sk-name">✦ ${esc(nm)}</div><div class="sk-desc">${esc(s.meta.description || 'Chưa có mô tả (thêm vào frontmatter của SKILL.md)')}</div>
          <div class="sk-chips"><span class="pill">~${fmt(s.tokens + s.extraTokens)} token</span><span class="pill mut">${s.files.length} file</span></div>
          ${extra.length ? `<div class="sk-files">${extra.slice(0, 6).map((f) => `<span title="${kb(f.size)}">${esc(f.path)}</span>`).join('')}${extra.length > 6 ? `<span>+${extra.length - 6}…</span>` : ''}</div>` : ''}</div>
        <div class="slot-drop"><b>Thả SKILL vào đây</b><span>.zip · .skill · thư mục · SKILL.md</span>
          <div class="slot-btns"><button class="btn ghost sm" data-pick="file">Chọn file</button><button class="btn ghost sm" data-pick="dir">Chọn thư mục</button><button class="btn sm" data-edit="${i}">Sửa SKILL.md</button></div></div>
      </div>`; }).join('')}</div>
    <input type="file" id="pf" hidden multiple accept=".zip,.skill,.md,.txt"><input type="file" id="pd" hidden webkitdirectory multiple>
    <div class="card" id="editor"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px"><div><b>Soạn trực tiếp: skills/${esc(skills[cur].id)}/SKILL.md</b><div class="sub" style="margin:0">Nội dung này được nạp vào prompt khi chạy chặng ${esc(skills[cur].name)}.</div></div><button class="btn acc sm" id="save">Lưu</button></div>
      <textarea class="editor" id="ed" spellcheck="false">${esc(skills[cur].content)}</textarea></div>`;
    bind();
  };
  const doUpload = async (i, items) => {
    if (!items.length) return;
    const s = skills[i]; busy[s.id] = true; draw();
    try { const r = await uploadSkill(s.id, items); skills[i] = r.skill; cur = i; toast(`Đã nạp SKILL cho "${s.name}" (${r.count} file) ✓`); }
    catch (e) { toast('Lỗi: ' + e.message); }
    busy[s.id] = false; draw();
  };
  const bind = () => {
    let target = 0;
    view.querySelectorAll('.slot').forEach((el) => {
      const i = +el.dataset.i;
      el.ondragover = (e) => { e.preventDefault(); el.classList.add('over'); };
      el.ondragleave = (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); };
      el.ondrop = async (e) => { e.preventDefault(); el.classList.remove('over'); doUpload(i, await collectDropped(e.dataTransfer)); };
      el.onclick = (e) => { if (e.target.closest('button')) return; cur = i; draw(); };
      el.querySelector('[data-pick=file]').onclick = () => { target = i; $('#pf').click(); };
      el.querySelector('[data-pick=dir]').onclick = () => { target = i; $('#pd').click(); };
      el.querySelector('[data-edit]').onclick = () => { cur = i; draw(); $('#editor').scrollIntoView({ behavior: 'smooth' }); };
    });
    $('#pf').onchange = (e) => { doUpload(target, [...e.target.files].map((f) => ({ file: f, path: f.name }))); e.target.value = ''; };
    $('#pd').onchange = (e) => { doUpload(target, [...e.target.files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }))); e.target.value = ''; };
    $('#save').onclick = async () => { const s = skills[cur]; await jsend('/api/skills/' + s.id, 'PUT', { content: $('#ed').value }); skills = await jget('/api/skills'); toast('Đã lưu SKILL ✓'); draw(); };
  };
  window.ondragover = (e) => e.preventDefault();
  window.ondrop = (e) => { if (!e.target.closest('.slot')) e.preventDefault(); }; // chặn trình duyệt mở file khi thả trượt
  draw();
}

// ================= VIEW: MEMORY =================
async function vMemory() {
  $('#title').textContent = 'Bộ nhớ & Quy định'; setMeter(null);
  const docs = { claude: (await jget('/api/docs/claude')).content, memory: (await jget('/api/docs/memory')).content }; let cur = 'claude';
  const names = { claude: 'CLAUDE.md', memory: 'MEMORY.md' };
  const desc = { claude: 'Quy định của web app — nạp vào mọi chặng.', memory: 'Bộ nhớ tích lũy — tự ghi thêm sau mỗi lần chạy xong, bạn có thể sửa.' };
  const draw = () => {
    view.innerHTML = `<div class="card"><div class="tabs">${Object.keys(names).map((k) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${names[k]}</button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap"><div class="sub" style="margin:0">${desc[cur]}</div><button class="btn acc sm" id="save">Lưu</button></div>
      <textarea class="editor" id="ed" spellcheck="false">${esc(docs[cur])}</textarea></div>`;
    view.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { docs[cur] = $('#ed').value; cur = b.dataset.k; draw(); }));
    $('#save').onclick = async () => { docs[cur] = $('#ed').value; await jsend('/api/docs/' + cur, 'PUT', { content: docs[cur] }); toast('Đã lưu ' + names[cur] + ' ✓'); };
  };
  draw();
}

// ================= VIEW: HISTORY =================
async function vHistory() {
  $('#title').textContent = 'Lịch sử'; setMeter(null);
  const runs = await jget('/api/runs');
  view.innerHTML = `<div class="card">${runs.length ? `<table class="tbl"><tr><th>Thời gian</th><th>File</th><th>Yêu cầu</th><th>Token</th><th>Trạng thái</th></tr>${runs.map((r) => `<tr class="click" data-id="${r.id}"><td>${new Date(r.createdAt).toLocaleString('vi-VN')}</td><td>${esc(r.file)}</td><td>${esc(r.requirement.slice(0, 70))}</td><td>${fmt(r.total)}</td><td>${statusPill(r.status)}</td></tr>`).join('')}</table>` : '<div class="empty">Chưa có lần chạy nào.</div>'}</div>`;
  view.querySelectorAll('tr.click').forEach((tr) => (tr.onclick = () => (location.hash = '#run/' + tr.dataset.id)));
}


// ---- Router ----
async function route() {
  stopPoll(); window.onresize = null; window.ondragover = null; window.ondrop = null; closeModal();
  const [v, arg] = (location.hash.slice(1) || 'home').split('/');
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.v === v));
  try {
    if (v === 'home') await vHome(arg);
    else if (v === 'analysis' || v === 'new') { if (v === 'new') { location.replace('#analysis'); return; } vAnalysis(); }
    else if (v === 'run') await vRun(arg);
    else if (v === 'skills') await vSkills();
    else if (v === 'memory') await vMemory();
    else if (v === 'history') await vHistory();
    else location.hash = '#new';
  } catch (e) { view.innerHTML = `<div class="card"><div class="err-box">${esc(e.message)}</div></div>`; }
}
window.addEventListener('hashchange', route);
(async () => { META = await jget('/api/meta'); if (META.mock) document.title += ' (MOCK)'; route(); })();

// ---- Sidebar collapse ----
(() => {
  const root = document.documentElement, btn = $('#collapse');
  const apply = (on, save) => {
    root.classList.toggle('side-collapsed', on);
    btn.setAttribute('aria-expanded', String(!on)); btn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar'); btn.title = on ? 'Expand sidebar' : 'Collapse sidebar';
    if (save) try { localStorage.setItem('bie-side', on ? '1' : '0'); } catch {}
    setTimeout(() => window.onresize && window.onresize(), 300); // vẽ lại đường nối Workflow theo bề rộng mới
  };
  apply(root.classList.contains('side-collapsed'), false);
  btn.onclick = () => apply(!root.classList.contains('side-collapsed'), true);
})();
