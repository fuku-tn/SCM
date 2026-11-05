// BIE - Business Intelligence Engine (Node.js)
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 6688;
const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'output');
const SKILLS = path.join(ROOT, 'skills');
const DOCS = { claude: path.join(ROOT, 'CLAUDE.md'), memory: path.join(ROOT, 'MEMORY.md') };
const SCRATCH = path.join(os.tmpdir(), 'bie-cli-cwd'); // cwd trung tính cho claude CLI (tránh tự nạp CLAUDE.md lần 2)
fs.mkdirSync(OUTPUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const STAGES = [
  { id: '01-business-goal', name: 'Business Goal' },
  { id: '02-key-metrics', name: 'Key Metrics' },
  { id: '03-data-etl', name: 'Data (ETL)' },
  { id: '04-dashboard-pbip', name: 'Dashboard (PBIP)' },
];
const MODELS = [
  { id: 'sonnet', label: 'Sonnet (alias mới nhất)' },
  { id: 'opus', label: 'Opus (alias mới nhất)' },
  { id: 'haiku', label: 'Haiku (alias mới nhất)' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
];
const MOCK = process.env.BIE_MOCK === '1';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const rd = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };
const estTokens = (s) => Math.ceil((s || '').length / 3.6); // ước lượng thô trước khi gọi
const runDir = (id) => path.join(OUTPUT, id);
const loadRun = (id) => { try { return JSON.parse(rd(path.join(runDir(id), 'run.json'))); } catch { return null; } };
const saveRun = (run) => wr(path.join(runDir(run.id), 'run.json'), JSON.stringify(run, null, 2));
const safeId = (s) => /^[\w\-]+$/.test(s);

// ---------- Data profiling ----------
function profileData(buf, filename) {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, raw: false });
  const sheets = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const columns = cols.map((c) => {
      const vals = rows.map((r) => r[c]);
      const nn = vals.filter((v) => v !== null && v !== '');
      const uniq = new Set(nn.map((v) => (v instanceof Date ? v.toISOString() : String(v))));
      const num = nn.filter((v) => typeof v === 'number').length;
      const dt = nn.filter((v) => v instanceof Date).length;
      let type = 'text';
      if (nn.length && num / nn.length > 0.9) type = 'number';
      else if (nn.length && dt / nn.length > 0.9) type = 'date';
      const info = { name: c, type, nulls: rows.length - nn.length, distinct: uniq.size };
      if (type === 'number') {
        const ns = nn.filter((v) => typeof v === 'number');
        info.min = Math.min(...ns); info.max = Math.max(...ns);
        info.sum = Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;
      } else info.examples = [...uniq].slice(0, 5);
      return info;
    });
    const sample = rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v])));
    return { name, rowCount: rows.length, columns, sample };
  });
  return { filename, sheets };
}

// ---------- API: meta / docs / skills ----------
app.get('/api/meta', (req, res) => res.json({ stages: STAGES, models: MODELS, mock: MOCK, port: PORT }));

app.get('/api/docs/:k', (req, res) => {
  if (!DOCS[req.params.k]) return res.sendStatus(404);
  res.json({ content: rd(DOCS[req.params.k]) });
});
app.put('/api/docs/:k', (req, res) => {
  if (!DOCS[req.params.k]) return res.sendStatus(404);
  wr(DOCS[req.params.k], String(req.body.content ?? ''));
  res.json({ ok: true });
});

// ---- Skill helpers ----
const AdmZip = require('adm-zip');
const TEXT_EXT = /\.(md|txt|json|csv|py|m|pq|dax|yml|yaml|sql|js|ts|tmdl|xml|sh|ps1|html|css|tsv)$/i;
function parseFront(c) {
  const m = c.match(/^---\r?\n([\s\S]*?)\r?\n---/); const o = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^(\w[\w-]*):\s*(.*)$/); if (k) o[k[1]] = k[2].replace(/^["']|["']$/g, ''); }
  return o;
}
function listFiles(dir, base = dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFiles(p, base));
    else out.push({ path: path.relative(base, p).replace(/\\/g, '/'), size: fs.statSync(p).size });
  }
  return out;
}
function resourceText(id) {
  const dir = path.join(SKILLS, id); let total = 0, out = '', tree = '';
  const files = listFiles(dir).filter((f) => f.path !== 'SKILL.md').sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) {
    if (!TEXT_EXT.test(f.path)) { tree += `- ${f.path} (${f.size}B, không nạp nội dung: không phải file chữ)\n`; continue; }
    if (f.size > 15000 || total > 40000) { tree += `- ${f.path} (${f.size}B, không nạp nội dung: quá lớn)\n`; continue; }
    const t = rd(path.join(dir, f.path)); total += t.length; tree += `- ${f.path} (đã nạp bên dưới)\n`; out += '\n\n## Tài nguyên: ' + f.path + '\n' + t;
  }
  if (!files.length) return '';
  return '\n\n## Cấu trúc thư mục của SKILL (references/assets/scripts)\nLưu ý: bạn không thể chạy script hay mở file; chỉ dùng nội dung đã nạp.\n' + tree + out;
}
const skillInfo = (s) => {
  const dir = path.join(SKILLS, s.id), c = rd(path.join(dir, 'SKILL.md'));
  return { ...s, content: c, tokens: estTokens(c), meta: parseFront(c), files: listFiles(dir), extraTokens: estTokens(resourceText(s.id)) };
};
const cleanRel = (p) => String(p).replace(/\\/g, '/').split('/').filter((x) => x && x !== '.' && x !== '..' && !/^[a-zA-Z]:$/.test(x)).join('/');
const IGNORED = /(^|\/)(node_modules|\.git|__MACOSX|\.DS_Store)(\/|$)/;

app.get('/api/skills', (req, res) => res.json(STAGES.map(skillInfo)));
app.put('/api/skills/:id', (req, res) => {
  if (!STAGES.find((s) => s.id === req.params.id)) return res.sendStatus(404);
  wr(path.join(SKILLS, req.params.id, 'SKILL.md'), String(req.body.content ?? ''));
  res.json({ ok: true });
});
// Kéo thả: .zip/.skill, thư mục (nhiều file kèm đường dẫn tương đối) hoặc 1 file SKILL.md
app.post('/api/skills/:id/upload', upload.array('files', 400), (req, res) => {
  const st = STAGES.find((s) => s.id === req.params.id);
  if (!st) return res.sendStatus(404);
  if (!req.files?.length) return res.status(400).json({ error: 'Chưa có file' });
  try {
    const paths = [].concat(req.body.paths || []);
    const nameOf = (f) => Buffer.from(f.originalname, 'latin1').toString('utf8');
    let entries = [];
    if (req.files.length === 1 && /\.(zip|skill)$/i.test(nameOf(req.files[0]))) {
      const zip = new AdmZip(req.files[0].buffer); let tot = 0;
      for (const z of zip.getEntries()) {
        if (z.isDirectory || IGNORED.test(z.entryName)) continue;
        tot += z.header.size; if (tot > 50 * 1024 * 1024) throw new Error('Gói giải nén quá lớn (>50MB)');
        entries.push({ rel: cleanRel(z.entryName), data: z.getData() });
      }
    } else {
      entries = req.files.map((f, i) => ({ rel: cleanRel(paths[i] || nameOf(f)), data: f.buffer })).filter((e) => e.rel && !IGNORED.test(e.rel));
    }
    let skill = entries.filter((e) => /(^|\/)skill\.md$/i.test(e.rel)).sort((a, b) => a.rel.split('/').length - b.rel.split('/').length)[0];
    if (!skill && entries.length === 1 && /\.(md|txt)$/i.test(entries[0].rel)) { skill = entries[0]; skill.rel = 'SKILL.md'; }
    if (!skill) throw new Error('Không tìm thấy SKILL.md trong những gì bạn thả vào');
    const prefix = skill.rel.includes('/') ? skill.rel.slice(0, skill.rel.lastIndexOf('/') + 1) : '';
    const files = entries.filter((e) => e.rel.startsWith(prefix)).map((e) => ({ rel: /^skill\.md$/i.test(e.rel.slice(prefix.length)) ? 'SKILL.md' : e.rel.slice(prefix.length), data: e.data }));
    const dir = path.join(SKILLS, st.id);
    if (fs.existsSync(dir)) { // sao lưu bản cũ trước khi thay
      const bk = path.join(SKILLS, '_backup', st.id + '-' + Date.now());
      fs.mkdirSync(path.dirname(bk), { recursive: true }); fs.cpSync(dir, bk, { recursive: true }); fs.rmSync(dir, { recursive: true, force: true });
    }
    for (const e of files) { const p = path.join(dir, e.rel); if (!p.startsWith(dir)) continue; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); }
    res.json({ ok: true, skill: skillInfo(st), count: files.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- API: Analysis (wizard) — tạo run nháp, nhận file theo "slot", gợi ý AI ----------
const SLOTS = {
  context: { ext: ['md', 'pdf', 'docx'], text: true, label: 'Ngữ cảnh công ty' },
  requirement: { ext: ['md', 'pdf', 'docx'], text: true, label: 'Yêu cầu phân tích' },
  data: { ext: ['csv', 'tsv', 'xlsx', 'xls', 'xlsm'], label: 'Dữ liệu' },
  theme: { ext: ['txt'], label: 'Theme màu' },
  template: { ext: ['png', 'jpg', 'jpeg', 'pdf'], label: 'Template dashboard' },
};
const MAX_TEXT = 60000;
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
async function extractText(ext, buf) {
  if (ext === 'md' || ext === 'txt') return buf.toString('utf8');
  if (ext === 'docx') {
    const xml = new AdmZip(buf).readAsText('word/document.xml');
    if (!xml) throw new Error('File .docx không hợp lệ');
    return decodeXml(xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').split('</w:p>').map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n'));
  }
  if (ext === 'pdf') { const pdf = require('pdf-parse/lib/pdf-parse.js'); return (await pdf(buf)).text; }
  throw new Error('Định dạng không hỗ trợ');
}
const newRunId = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + Math.random().toString(36).slice(2, 6);

app.post('/api/runs', (req, res) => {
  const id = newRunId();
  fs.mkdirSync(path.join(runDir(id), '00-input'), { recursive: true });
  saveRun({ id, status: 'draft', createdAt: new Date().toISOString(), file: '', stages: [] });
  res.json({ runId: id });
});

app.post('/api/runs/:id/files/:slot', upload.single('file'), async (req, res) => {
  const { id, slot } = req.params;
  if (!safeId(id) || !SLOTS[slot]) return res.sendStatus(400);
  const run = loadRun(id); if (!run) return res.sendStatus(404);
  if (!req.file) return res.status(400).json({ error: 'Chưa có file' });
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = path.extname(name).slice(1).toLowerCase();
  const cfg = SLOTS[slot];
  if (!cfg.ext.includes(ext)) return res.status(400).json({ error: `${cfg.label}: chỉ nhận file ${cfg.ext.map((e) => '.' + e).join(', ')}` + (ext === 'doc' ? ' (file .doc cũ hãy lưu lại thành .docx)' : '') });
  if (slot === 'template' && req.file.size > 20 * 1024 * 1024) return res.status(400).json({ error: 'Template tối đa 20MB' });
  const inDir = path.join(runDir(id), '00-input');
  try {
    const dir = path.join(inDir, slot);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), req.file.buffer);
    const base = { name, size: req.file.size };
    if (cfg.text) {
      let text = (await extractText(ext, req.file.buffer)).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('Không đọc được nội dung chữ trong file (PDF dạng ảnh scan?)');
      const truncated = text.length > MAX_TEXT; if (truncated) text = text.slice(0, MAX_TEXT);
      wr(path.join(inDir, slot + '.txt'), text);
      return res.json({ ...base, chars: text.length, tokens: estTokens(text), truncated, preview: text.slice(0, 500) });
    }
    if (slot === 'data') {
      const profile = profileData(req.file.buffer, name);
      if (!profile.sheets.length) throw new Error('File không có bảng dữ liệu');
      wr(path.join(inDir, 'profile.json'), JSON.stringify(profile, null, 2));
      run.file = name; saveRun(run);
      return res.json({ ...base, profile });
    }
    if (slot === 'theme') {
      const txt = req.file.buffer.toString('utf8');
      const all = [...new Set([...txt.matchAll(/(?<![0-9a-zA-Z])#?([0-9a-fA-F]{6})(?![0-9a-zA-Z])/g)].map((m) => '#' + m[1].toUpperCase()))];
      if (all.length < 5) throw new Error(`File chỉ có ${all.length} mã màu hợp lệ (6 ký tự hex), cần tối thiểu 5 mã`);
      wr(path.join(inDir, 'theme.json'), JSON.stringify(all.slice(0, 5)));
      return res.json({ ...base, colors: all.slice(0, 5), total: all.length });
    }
    return res.json({ ...base, kind: ext === 'pdf' ? 'pdf' : 'image' }); // template
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/runs/:id/files/:slot', (req, res) => {
  const { id, slot } = req.params;
  if (!safeId(id) || !SLOTS[slot] || !loadRun(id)) return res.sendStatus(400);
  const inDir = path.join(runDir(id), '00-input');
  fs.rmSync(path.join(inDir, slot), { recursive: true, force: true });
  for (const f of [slot + '.txt', slot === 'data' ? 'profile.json' : '', slot === 'theme' ? 'theme.json' : '']) if (f) fs.rmSync(path.join(inDir, f), { force: true });
  res.json({ ok: true });
});

// Gợi ý Key Metrics / Dimensions bằng AI (dựa trên ngữ cảnh + yêu cầu + người xem)
app.post('/api/runs/:id/suggest', async (req, res) => {
  const { id } = req.params; const run = safeId(id) && loadRun(id);
  if (!run) return res.sendStatus(404);
  const { kind, model, form = {} } = req.body;
  if (!['metrics', 'dimensions'].includes(kind)) return res.sendStatus(400);
  const inDir = path.join(runDir(id), '00-input'); const a = form.audience || {};
  const ctx = [form.context, rd(path.join(inDir, 'context.txt'))].filter(Boolean).join('\n\n').slice(0, 8000);
  const req2 = [form.requirement, rd(path.join(inDir, 'requirement.txt'))].filter(Boolean).join('\n').slice(0, 5000);
  const chosen = (form.metrics || []).join(', ');
  const prompt = [
    'Bạn là chuyên gia Business Intelligence. Trả lời bằng tiếng Việt; thuật ngữ chuyên ngành (KPI, measure, dimension...) giữ tiếng Anh.',
    '## Ngữ cảnh doanh nghiệp\n' + (ctx || '(không có)'),
    '## Yêu cầu phân tích\n' + (req2 || '(không có)'),
    `## Người xem dashboard\n- Phòng ban: ${a.department || '?'}\n- Vị trí: ${a.position || '?'}\n- Level: ${a.level || '?'}\n- Thâm niên tại doanh nghiệp hiện tại: ${a.tenureCompany || '?'}\n- Thâm niên từ khi đi làm: ${a.tenureCareer || '(không khai báo)'}`,
    kind === 'metrics'
      ? '## Nhiệm vụ\nGợi ý 8–10 chỉ số (Key Metrics / measure để viết DAX) phù hợp nhất với người xem và yêu cầu trên. Sắp xếp từ quan trọng nhất.'
      : `## Các chỉ số đã chọn\n${chosen || '(chưa có)'}\n\n## Nhiệm vụ\nGợi ý 8–10 chiều phân tích (dimension) phù hợp để cắt lát các chỉ số đã chọn. Sắp xếp từ quan trọng nhất.`,
    '## Định dạng\nChỉ trả về DUY NHẤT một JSON array, không markdown, không giải thích ngoài JSON: [{"name":"tên ngắn gọn","reason":"lý do trong 1 câu"}]',
  ].join('\n\n');
  try {
    const mock = JSON.stringify(kind === 'metrics'
      ? [{ name: 'Doanh thu (Revenue)', reason: 'Chỉ số cốt lõi' }, { name: 'Lợi nhuận gộp (Gross Profit)', reason: 'Đo hiệu quả' }, { name: 'Tăng trưởng YoY', reason: 'So sánh theo năm' }]
      : [{ name: 'Thời gian (Date)', reason: 'Xu hướng' }, { name: 'Khu vực (Region)', reason: 'So sánh vùng' }, { name: 'Sản phẩm (Product)', reason: 'Cơ cấu' }]);
    const r = await callClaude(prompt, model || 'haiku', mock);
    let items = [];
    const m = r.text.match(/\[[\s\S]*\]/);
    try { items = JSON.parse(m ? m[0] : r.text); } catch { items = r.text.split('\n').map((l) => l.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 10).map((n) => ({ name: n, reason: '' })); }
    items = items.map((x) => (typeof x === 'string' ? { name: x, reason: '' } : { name: String(x.name || '').trim(), reason: String(x.reason || '').trim() })).filter((x) => x.name).slice(0, 12);
    run.extra = run.extra || []; run.extra.push({ label: 'Gợi ý ' + (kind === 'metrics' ? 'Key Metrics' : 'Dimensions'), model: r.model, usage: r.usage, cost: r.cost, ms: r.ms, at: new Date().toISOString() });
    saveRun(run);
    res.json({ items, usage: r.usage, model: r.model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Claude CLI ----------
function callClaude(prompt, model, mockText) {
  return new Promise((resolve, reject) => {
    if (MOCK) {
      const t0 = Date.now();
      return setTimeout(() => resolve({
        text: mockText || '# (MOCK) Kết quả giả lập\n\nChế độ BIE_MOCK=1: không gọi model thật.\n\n- Model: ' + model + '\n- Prompt ~' + estTokens(prompt) + ' token',
        usage: { input: estTokens(prompt), output: 120, cacheRead: 0, cacheCreate: 0 }, contextWindow: 200000, cost: 0, ms: Date.now() - t0, model,
      }), 1200);
    }
    const args = ['-p', '--output-format', 'json', '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--system-prompt', 'Ban la chuyen gia Business Intelligence. Lam theo huong dan trong tin nhan nguoi dung.'];
    const child = spawn('claude', args, { cwd: SCRATCH, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const fail = (msg, code) => { const e = new Error(String(msg).slice(0, 1500)); e.detail = { exitCode: code ?? null, stderr: err.slice(0, 6000), stdout: out.slice(0, 6000), command: 'claude ' + args.slice(0, 7).join(' ') + ' ...' }; reject(e); };
    child.on('error', (e) => fail('Không chạy được claude CLI: ' + e.message));
    child.on('close', (code) => {
      let j; try { j = JSON.parse(out); } catch { return fail(err || out || 'CLI lỗi, exit ' + code, code); }
      if (j.is_error || j.subtype && j.subtype !== 'success') return fail(j.result || err || j.subtype, code);
      const u = j.usage || {};
      const mu = Object.values(j.modelUsage || {})[0] || {};
      resolve({
        text: j.result || '',
        usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheCreate: u.cache_creation_input_tokens || 0 },
        contextWindow: mu.contextWindow || 200000, cost: j.total_cost_usd || 0, ms: j.duration_ms || 0, model: Object.keys(j.modelUsage || {})[0] || model,
      });
    });
    child.stdin.end(prompt);
  });
}

// ---------- Prompt assembly ----------
function buildPrompt(run, stageIdx) {
  const st = STAGES[stageIdx];
  const f = run.form, a = f.audience || {}, inDir = path.join(runDir(run.id), '00-input');
  const profile = JSON.parse(rd(path.join(inDir, 'profile.json')) || '{"filename":"","sheets":[]}');
  const picked = (f.sheets && f.sheets.length) ? profile.sheets.filter((s) => f.sheets.includes(s.name)) : profile.sheets;
  const ctxText = [f.contextTyped, rd(path.join(inDir, 'context.txt'))].filter(Boolean).join('\n\n'), reqText = rd(path.join(inDir, 'requirement.txt'));
  const parts = [];
  parts.push('# QUY ĐỊNH (CLAUDE.md)\n' + rd(DOCS.claude));
  parts.push('# BỘ NHỚ (MEMORY.md)\n' + rd(DOCS.memory));
  parts.push('# SKILL CỦA CHẶNG HIỆN TẠI: ' + st.name + '\n' + rd(path.join(SKILLS, st.id, 'SKILL.md')) + resourceText(st.id));
  parts.push('# THÔNG TIN NGƯỜI DÙNG NHẬP\n' + [
    '## Ngữ cảnh doanh nghiệp' + (f.contextFileName ? ` (kèm file ${f.contextFileName})` : '') + '\n' + (ctxText || '(trống)'),
    '## Yêu cầu phân tích' + (f.requirementFileName ? ` (kèm file ${f.requirementFileName})` : '') + '\n' + ([f.requirementTyped, reqText].filter(Boolean).join('\n\n') || '(trống)'),
    '## Người xem dashboard\n' + [
      '- Phòng ban: ' + (a.department || '?'), '- Vị trí công việc hiện tại: ' + (a.position || '?'), '- Level: ' + (a.level || '?'),
      '- Thâm niên tại doanh nghiệp hiện tại: ' + (a.tenureCompany || '?'), '- Thâm niên từ khi đi làm: ' + (a.tenureCareer || '(không khai báo)'),
    ].join('\n'),
    '## Chỉ số cần phân tích (Key Metrics, để tính DAX)\n' + ((f.metrics || []).map((x) => '- ' + x).join('\n') || '(trống)'),
    '## Các chiều (Dimension) cần phân tích\n' + ((f.dimensions || []).map((x) => '- ' + x).join('\n') || '(trống)'),
    '## Theme màu dashboard\n' + ((f.colors || []).join(', ') || '(không có)'),
    '## Template dashboard mẫu\n' + (f.templateFileName ? `Có file ${f.templateFileName} (lưu tại output/${run.id}/00-input/template/). Lưu ý: nội dung ảnh/PDF chưa được đưa vào prompt ở phiên bản này.` : '(không có)'),
  ].join('\n\n'));
  const slim = { filename: profile.filename, sheets: picked };
  parts.push(`# PROFILE DỮ LIỆU (file: ${profile.filename}; các bảng/sheet được chọn: ${picked.map((s) => s.name).join(', ') || '—'})\n\`\`\`json\n` + JSON.stringify(slim, null, 1) + '\n```');
  for (let i = 0; i < stageIdx; i++) parts.push('# OUTPUT CHẶNG ' + (i + 1) + ': ' + STAGES[i].name + '\n' + rd(path.join(runDir(run.id), STAGES[i].id, 'result.md')));
  parts.push('# YÊU CẦU\nThực hiện đúng SKILL của chặng "' + st.name + '" và chỉ trả về nội dung Markdown kết quả của chặng này.');
  return parts.join('\n\n---\n\n');
}

// ---------- Run orchestration ----------
const running = new Set();
async function execStage(run, i) {
  const st = STAGES[i], s = run.stages[i];
  const dir = path.join(runDir(run.id), st.id);
  fs.mkdirSync(dir, { recursive: true });
  s.status = 'running'; s.startedAt = Date.now(); s.error = null; s.errorDetail = null; saveRun(run);
  try {
    const prompt = buildPrompt(run, i);
    s.promptTokensEst = estTokens(prompt);
    wr(path.join(dir, 'prompt.md'), prompt);
    const r = await callClaude(prompt, s.model);
    wr(path.join(dir, 'result.md'), r.text);
    wr(path.join(dir, 'metrics.json'), JSON.stringify({ model: r.model, usage: r.usage, contextWindow: r.contextWindow, costUSD: r.cost, ms: r.ms }, null, 2));
    s.status = 'done'; s.usage = r.usage; s.contextWindow = r.contextWindow; s.cost = r.cost; s.ms = r.ms; s.usedModel = r.model;
    s.files = ['result.md', 'prompt.md', 'metrics.json'];
  } catch (e) {
    s.status = 'error'; s.error = e.message;
    s.errorDetail = { ...(e.detail || {}), stack: e.stack, model: s.model, at: new Date().toISOString() };
    try { wr(path.join(dir, 'error.json'), JSON.stringify({ message: s.error, ...s.errorDetail }, null, 2)); } catch {}
  }
  s.endedAt = Date.now(); saveRun(run);
  return s.status === 'done';
}

async function runPipeline(run, from, only) {
  running.add(run.id); run.status = 'running'; saveRun(run);
  let ok = true;
  for (let i = from; i < STAGES.length; i++) {
    if (!(await execStage(run, i))) { ok = false; break; }
    if (only) break;
  }
  const allDone = run.stages.every((s) => s.status === 'done');
  run.status = allDone ? 'done' : ok ? 'partial' : 'error'; saveRun(run);
  if (allDone) {
    const tot = totals(run);
    const line = `- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · run ${run.id} · file ${run.file} · "${(run.form.requirement || '').slice(0, 80).replace(/\n/g, ' ')}" · ${tot.total} tokens`;
    fs.appendFileSync(DOCS.memory, '\n' + line + '\n');
  }
  running.delete(run.id);
}
function totals(run) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, ms: 0, maxContext: 0, contextWindow: 0 };
  for (const s of run.stages) if (s.usage) {
    t.input += s.usage.input; t.output += s.usage.output; t.cacheRead += s.usage.cacheRead; t.cacheCreate += s.usage.cacheCreate;
    t.cost += s.cost || 0; t.ms += s.ms || 0;
    const ctx = s.usage.input + s.usage.cacheRead + s.usage.cacheCreate + s.usage.output;
    if (ctx > t.maxContext) { t.maxContext = ctx; t.contextWindow = s.contextWindow; }
  }
  for (const x of run.extra || []) { t.input += x.usage.input; t.output += x.usage.output; t.cacheRead += x.usage.cacheRead; t.cacheCreate += x.usage.cacheCreate; t.cost += x.cost || 0; t.ms += x.ms || 0; }
  t.total = t.input + t.output + t.cacheRead + t.cacheCreate;
  return t;
}

app.post('/api/runs/:id/start', (req, res) => {
  const run = loadRun(req.params.id);
  if (!run) return res.sendStatus(404);
  if (running.has(run.id)) return res.status(409).json({ error: 'Đang chạy' });
  const { form, models } = req.body;
  const f = form || {}, inDir = path.join(runDir(run.id), '00-input');
  run.form = { ...f, requirementTyped: (f.requirement || '').trim(), requirement: (f.requirement || '').trim() || (f.requirementFileName ? '[file] ' + f.requirementFileName : '') };
  if (!fs.existsSync(path.join(inDir, 'profile.json'))) return res.status(400).json({ error: 'Chưa có dữ liệu (bước 3)' });
  run.stages = STAGES.map((s, i) => ({ id: s.id, name: s.name, status: 'pending', model: (models && models[i]) || 'sonnet' }));
  run.startedAt = Date.now();
  saveRun(run);
  runPipeline(run, 0, false);
  res.json({ ok: true });
});
app.post('/api/runs/:id/stages/:n/rerun', (req, res) => {
  const run = loadRun(req.params.id); const i = Number(req.params.n);
  if (!run || !run.stages[i]) return res.sendStatus(404);
  if (running.has(run.id)) return res.status(409).json({ error: 'Đang chạy' });
  if (req.body.model) run.stages[i].model = req.body.model;
  for (let k = 0; k < i; k++) if (run.stages[k].status !== 'done') return res.status(400).json({ error: 'Các chặng trước chưa hoàn thành' });
  runPipeline(run, i, !!req.body.only);
  res.json({ ok: true });
});
app.get('/api/runs', (req, res) => {
  const ids = fs.readdirSync(OUTPUT).filter((d) => fs.existsSync(path.join(OUTPUT, d, 'run.json')));
  res.json(ids.sort().reverse().map((id) => { const r = loadRun(id); return { id, status: r.status, file: r.file, createdAt: r.createdAt, requirement: r.form?.requirement || '', total: totals(r).total }; }));
});
app.get('/api/runs/:id', (req, res) => {
  if (!safeId(req.params.id)) return res.sendStatus(400);
  const run = loadRun(req.params.id); if (!run) return res.sendStatus(404);
  res.json({ ...run, totals: totals(run), running: running.has(run.id) });
});
app.get('/api/runs/:id/profile', (req, res) => {
  if (!safeId(req.params.id)) return res.sendStatus(400);
  res.json(JSON.parse(rd(path.join(runDir(req.params.id), '00-input', 'profile.json')) || '{}'));
});
app.get('/api/runs/:id/stages/:sid/:file', (req, res) => {
  const { id, sid, file } = req.params;
  if (!safeId(id) || !safeId(sid) || !/^[\w.\-]+$/.test(file)) return res.sendStatus(400);
  const p = path.join(runDir(id), sid, file);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  if (req.query.download) return res.download(p);
  res.type('text/plain').send(rd(p));
});

app.listen(PORT, () => console.log(`BIE chạy tại http://localhost:${PORT}${MOCK ? '  (MOCK mode)' : ''}`));
