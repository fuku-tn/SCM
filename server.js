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
      } else if (type === 'date') {
        const ds = nn.filter((v) => v instanceof Date).map((v) => v.toISOString().slice(0, 10)).sort();
        if (ds.length) { info.min = ds[0]; info.max = ds[ds.length - 1]; }
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
    if (/^scripts\//.test(f.path)) { tree += `- ${f.path} (script do server chạy — không nạp mã nguồn vào prompt)\n`; continue; }
    if (!TEXT_EXT.test(f.path)) { tree += `- ${f.path} (${f.size}B, không nạp nội dung: không phải file chữ)\n`; continue; }
    if (f.size > 30000 || total > 110000) { tree += `- ${f.path} (${f.size}B, không nạp nội dung: quá lớn)\n`; continue; }
    const t = rd(path.join(dir, f.path)); total += t.length; tree += `- ${f.path} (đã nạp bên dưới)\n`; out += '\n\n## Tài nguyên: ' + f.path + '\n' + t;
  }
  if (!files.length) return '';
  return '\n\n## Cấu trúc thư mục của SKILL (references/assets/scripts)\nLưu ý: bạn không tự chạy lệnh được. Script pre.js / post.js trong scripts/ (nếu có) do server tự chạy trước / sau lượt trả lời của bạn; chỉ dùng nội dung đã nạp ở dưới.\n' + tree + out;
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
function callClaude(prompt, model, mockText, opts = {}) {
  return new Promise((resolve, reject) => {
    if (MOCK) {
      const t0 = Date.now();
      return setTimeout(() => resolve({
        text: mockText || '# (MOCK) Kết quả giả lập\n\nChế độ BIE_MOCK=1: không gọi model thật.\n\n- Model: ' + model + '\n- Prompt ~' + estTokens(prompt) + ' token',
        usage: { input: estTokens(prompt), output: 120, cacheRead: 0, cacheCreate: 0 }, contextWindow: 200000, cost: 0, ms: Date.now() - t0, model,
      }), 1200);
    }
    const toolArgs = opts.tools ? ['--tools', opts.tools, '--allowedTools', opts.tools, ...(opts.addDirs || []).flatMap((d) => ['--add-dir', d])] : ['--tools', ''];
    const args = ['-p', '--output-format', 'json', '--model', model, ...toolArgs, '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--system-prompt', 'Ban la chuyen gia Business Intelligence. Lam theo huong dan trong tin nhan nguoi dung.'];
    const child = spawn('claude', args, { cwd: SCRATCH, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const fail = (msg, code) => { const e = new Error(String(msg).slice(0, 1500)); e.detail = { exitCode: code ?? null, stderr: err.slice(0, 6000), stdout: out.slice(0, 6000), command: 'claude ' + args.slice(0, 9).join(' ') + ' ...' }; reject(e); };
    child.on('error', (e) => fail('Không chạy được claude CLI: ' + e.message));
    child.on('close', (code) => {
      let j; try { j = JSON.parse(out); } catch { return fail(err || out || 'CLI lỗi, exit ' + code, code); }
      if (j.is_error || j.subtype && j.subtype !== 'success') return fail(j.result || err || j.subtype, code);
      const u = j.usage || {};
      // CLI có thể liệt kê thêm model nội bộ (vd. Haiku) — lấy model đã sinh nhiều output nhất làm model chính
      const mainModel = Object.entries(j.modelUsage || {}).sort((a, b) => (b[1].outputTokens || 0) - (a[1].outputTokens || 0))[0] || ['', {}];
      resolve({
        text: j.result || '',
        usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheCreate: u.cache_creation_input_tokens || 0 },
        contextWindow: mainModel[1].contextWindow || 200000, cost: j.total_cost_usd || 0, ms: j.duration_ms || 0, model: mainModel[0] || model,
      });
    });
    child.stdin.end(prompt);
  });
}

// ---------- Prompt assembly ----------
const PERIOD_DESC = { YoY: 'Year over Year — so với cùng kỳ năm trước (LY)', MoM: 'Month over Month — so với tháng trước (LM)', QoQ: 'Quarter over Quarter — so với quý trước (LQ)', DoD: 'Day over Day — so với ngày trước (LD)' };
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const IMG_EXT = /\.(png|jpe?g|pdf)$/i;
const readJsonSafe = (p) => { try { return JSON.parse(rd(p)); } catch { return null; } };
const skillMeta = (id) => parseFront(rd(path.join(SKILLS, id, 'SKILL.md')));

// Các file "bàn giao" của chặng trước (json/dax/md nhỏ ở cấp 1) để chặng sau dùng lại
// Mỗi SKILL khai báo trong frontmatter `handoff: a.json, b.json` những file chặng SAU cần dùng lại (ngoài result.md)
function handoffText(run, stageIdx) {
  let out = '', total = 0;
  for (let i = 0; i < stageIdx; i++) {
    const d = path.join(runDir(run.id), STAGES[i].id); if (!fs.existsSync(d)) continue;
    const want = String(skillMeta(STAGES[i].id).handoff || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const name of want) {
      const e = { name }; if (!fs.existsSync(path.join(d, name))) continue;
      const t = rd(path.join(d, e.name));
      if (t.length > 24000 || total + t.length > 70000) { out += `\n\n## File ${STAGES[i].id}/${e.name} (${t.length} ký tự — quá lớn, không nạp; đã có trên đĩa)`; continue; }
      total += t.length; out += `\n\n## File ${STAGES[i].id}/${e.name}\n\`\`\`${e.name.endsWith('.json') ? 'json' : ''}\n${t}\n\`\`\``;
    }
  }
  return out;
}
function templateFiles(run) {
  const list = [];
  const up = path.join(runDir(run.id), '00-input', 'template');
  for (const [dir, label] of [[up, 'người dùng tải lên'], [TEMPLATES_DIR, 'thư viện templates/']]) {
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isFile() && IMG_EXT.test(e.name)) list.push({ path: path.join(dir, e.name), label });
  }
  return list;
}

function buildPrompt(run, stageIdx, preOut) {
  const st = STAGES[stageIdx], meta = skillMeta(st.id);
  const f = run.form, a = f.audience || {}, inDir = path.join(runDir(run.id), '00-input');
  const profile = JSON.parse(rd(path.join(inDir, 'profile.json')) || '{"filename":"","sheets":[]}');
  const picked = (f.sheets && f.sheets.length) ? profile.sheets.filter((s) => f.sheets.includes(s.name)) : profile.sheets;
  const ctxText = [f.contextTyped, rd(path.join(inDir, 'context.txt'))].filter(Boolean).join('\n\n'), reqText = rd(path.join(inDir, 'requirement.txt'));
  const canRead = /\bRead\b/.test(meta.tools || '');
  const tpls = templateFiles(run);
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
    '## Kỳ so sánh cần tính (time intelligence; viết DAX cho từng chỉ số)\n' + ((f.periods || []).map((x) => '- ' + x + ' (' + (PERIOD_DESC[x] || x) + ')').join('\n') || '(không yêu cầu)'),
    '## Các chiều (Dimension) cần phân tích\n' + ((f.dimensions || []).map((x) => '- ' + x).join('\n') || '(trống)'),
    '## Theme màu dashboard (đúng 5 mã)\n' + ((f.colors || []).join(', ') || '(không có)'),
    '## Template dashboard mẫu\n' + (tpls.length
      ? (canRead ? 'Hãy dùng công cụ Read để XEM các file ảnh/PDF mẫu sau (đường dẫn tuyệt đối) và lấy bố cục làm cảm hứng:\n' : 'Có các file mẫu (chặng này không xem được nội dung):\n') + tpls.map((t) => `- ${t.path.replace(/\\/g, '/')} (${t.label})`).join('\n')
      : '(không có template)'),
  ].join('\n\n'));
  const checks = stageIdx >= 2 ? readJsonSafe(path.join(runDir(run.id), '03-data-etl', 'data-checks.json')) : null;
  if (checks) {
    // Từ chặng 3 trở đi dùng tóm tắt dữ liệu ĐÃ LÀM SẠCH (có min/max đầy đủ), không dùng 20 dòng mẫu của profile gốc dễ gây hiểu sai
    const L = [`# DỮ LIỆU ĐÃ LÀM SẠCH (tóm tắt từ chặng 3; file nguồn: ${checks.sourceFile})`];
    for (const t of checks.tables) {
      L.push(`\n## Bảng "${t.name}" (${t.file}) — ${t.rowsAfter} dòng`, '| Cột | Kiểu | Trống | Distinct | Min | Max / ví dụ |', '|---|---|---|---|---|---|');
      t.columns.forEach((c) => L.push(`| ${c.name} | ${c.type} | ${c.nulls} | ${c.distinct}${c.unique ? ' (duy nhất)' : ''} | ${c.min ?? ''} | ${c.max ?? (c.examples ? c.examples.slice(0, 3).join(', ') : '')} |`));
    }
    parts.push(L.join('\n'));
  } else {
    const slim = { filename: profile.filename, sheets: picked };
    parts.push(`# PROFILE DỮ LIỆU GỐC (file: ${profile.filename}; các bảng/sheet được chọn: ${picked.map((s) => s.name).join(', ') || '—'}; "sample" chỉ là 20 dòng ĐẦU, không đại diện cho toàn bộ dữ liệu)\n\`\`\`json\n` + JSON.stringify(slim, null, 1) + '\n```');
  }
  for (let i = 0; i < stageIdx; i++) parts.push('# OUTPUT CHẶNG ' + (i + 1) + ': ' + STAGES[i].name + '\n' + rd(path.join(runDir(run.id), STAGES[i].id, 'result.md')));
  const ho = handoffText(run, stageIdx); if (ho) parts.push('# FILE BÀN GIAO TỪ CÁC CHẶNG TRƯỚC' + ho);
  if (preOut) parts.push('# KẾT QUẢ SCRIPT TIỀN XỬ LÝ (scripts/pre.js — do server chạy trước lượt này)\n' + preOut);
  parts.push('# QUY ƯỚC XUẤT FILE\nKết quả chính của bạn là Markdown (sẽ lưu thành result.md). Nếu SKILL yêu cầu thêm file (JSON, DAX...), xuất MỖI file bằng đúng khối sau (không bọc thêm ```):\n<<<FILE: ten-file.json>>>\n...nội dung file...\n<<<END FILE>>>\nServer sẽ tách các khối này ra thành file riêng trong thư mục của chặng.');
  parts.push('# YÊU CẦU\nThực hiện đúng SKILL của chặng "' + st.name + '" và trả về nội dung Markdown kết quả của chặng này (kèm các khối FILE nếu SKILL yêu cầu).');
  return parts.join('\n\n---\n\n');
}

// ---------- Script hooks (scripts/pre.js, scripts/post.js trong thư mục SKILL) ----------
function runScript(skillId, name, runD, stageD) {
  const p = path.join(SKILLS, skillId, 'scripts', name);
  if (!fs.existsSync(p)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [p, runD, stageD], { cwd: stageD, windowsHide: true, env: { ...process.env, BIE_ROOT: ROOT } });
    let out = '', err = '', done = false;
    const timer = setTimeout(() => { if (!done) { child.kill(); err += '\n[timeout sau 180s]'; } }, 180000);
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    const fin = (code, extra) => { if (done) return; done = true; clearTimeout(timer); resolve({ name, code, stdout: out, stderr: err + (extra || ''), command: `node skills/${skillId}/scripts/${name} <runDir> <stageDir>` }); };
    child.on('error', (e) => fin(-1, e.message)); child.on('close', (c) => fin(c));
  });
}
function scriptFail(r) { const e = new Error(`scripts/${r.name} thất bại (exit ${r.code}): ` + (r.stderr || r.stdout).trim().slice(0, 600)); e.detail = { exitCode: r.code, stderr: r.stderr.slice(0, 6000), stdout: r.stdout.slice(0, 6000), command: r.command }; return e; }

// Tách khối <<<FILE: path>>> ... <<<END FILE>>> thành file thật trong thư mục chặng
const FILE_OK = /\.(json|md|dax|csv|txt|tmdl|m|sql)$/i;
function extractFileBlocks(text, dir) {
  const written = [];
  const out = text.replace(/<<<FILE:\s*([^\n>]+?)\s*>>>\r?\n([\s\S]*?)\r?\n?<<<END FILE>>>/g, (_, rel, body) => {
    const r = cleanRel(rel);
    if (!r || !FILE_OK.test(r)) return `> ⚠ Bỏ qua file không hợp lệ: \`${rel}\``;
    let b = body.replace(/^\s*```[\w-]*\r?\n/, '').replace(/\r?\n```\s*$/, '');
    const p = path.join(dir, r); if (!p.startsWith(dir)) return '';
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b.endsWith('\n') ? b : b + '\n', 'utf8'); written.push(r);
    return `> 📎 Đã tạo file \`${r}\``;
  });
  return { text: out, written };
}

// ---------- Run orchestration ----------
const running = new Set();
async function execStage(run, i) {
  const st = STAGES[i], s = run.stages[i];
  const dir = path.join(runDir(run.id), st.id);
  fs.mkdirSync(dir, { recursive: true });
  s.status = 'running'; s.startedAt = Date.now(); s.error = null; s.errorDetail = null; s.scripts = []; saveRun(run);
  try {
    // 1) pre.js (tiền xử lý xác định, không tốn token)
    let preOut = '';
    const pre = await runScript(st.id, 'pre.js', runDir(run.id), dir);
    if (pre) {
      wr(path.join(dir, 'pre.log'), pre.stdout + (pre.stderr ? '\n[stderr]\n' + pre.stderr : ''));
      s.scripts.push({ name: 'pre.js', code: pre.code });
      if (pre.code !== 0) throw scriptFail(pre);
      preOut = pre.stdout.length > 30000 ? pre.stdout.slice(0, 30000) + '\n…(cắt bớt)' : pre.stdout;
    }
    // 2) gọi model
    const meta = skillMeta(st.id);
    const prompt = buildPrompt(run, i, preOut);
    s.promptTokensEst = estTokens(prompt);
    wr(path.join(dir, 'prompt.md'), prompt);
    const opts = meta.tools ? { tools: meta.tools, addDirs: [path.join(runDir(run.id), '00-input'), TEMPLATES_DIR].filter((d) => fs.existsSync(d)) } : {};
    const r = await callClaude(prompt, s.model, undefined, opts);
    const ex = extractFileBlocks(r.text, dir);
    wr(path.join(dir, 'result.md'), ex.text);
    wr(path.join(dir, 'metrics.json'), JSON.stringify({ model: r.model, usage: r.usage, contextWindow: r.contextWindow, costUSD: r.cost, ms: r.ms, filesFromModel: ex.written }, null, 2));
    s.usage = r.usage; s.contextWindow = r.contextWindow; s.cost = r.cost; s.ms = r.ms; s.usedModel = r.model;
    // 3) post.js (kiểm tra / sinh file xác định từ kết quả của model, ví dụ dựng PBIP)
    const post = await runScript(st.id, 'post.js', runDir(run.id), dir);
    if (post) {
      wr(path.join(dir, 'post.log'), post.stdout + (post.stderr ? '\n[stderr]\n' + post.stderr : ''));
      s.scripts.push({ name: 'post.js', code: post.code });
      if (post.code !== 0) throw scriptFail(post);
    }
    s.files = listFiles(dir).map((f) => f.path).sort((a, b) => (a === 'result.md' ? -1 : b === 'result.md' ? 1 : a.localeCompare(b))).slice(0, 400);
    s.status = 'done';
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
// Đọc / tải file bất kỳ (kể cả trong thư mục con) của một chặng
app.get('/api/runs/:id/stages/:sid/*', (req, res) => {
  const { id, sid } = req.params, rel = req.params[0];
  if (!safeId(id) || !safeId(sid)) return res.sendStatus(400);
  const segs = String(rel).split('/');
  if (!segs.length || segs.some((x) => !x || x === '..' || x === '.' || !/^[^<>:"|?*\\\x00-\x1f]+$/.test(x))) return res.sendStatus(400);
  const base = path.join(runDir(id), sid), p = path.join(base, ...segs);
  if (!p.startsWith(base) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.sendStatus(404);
  if (req.query.download) return res.download(p);
  if (!TEXT_EXT.test(p) && !/\.(pbip|pbir|pbism|platform)$/i.test(p)) return res.status(415).type('text/plain').send('(file nhị phân — hãy dùng nút tải xuống)');
  res.type('text/plain').send(rd(p));
});
// Tải cả thư mục của một chặng dưới dạng .zip (ví dụ project PBIP)
app.get('/api/runs/:id/zip/:sid', (req, res) => {
  const { id, sid } = req.params;
  if (!safeId(id) || !safeId(sid)) return res.sendStatus(400);
  const base = path.join(runDir(id), sid);
  if (!fs.existsSync(base)) return res.sendStatus(404);
  const sub = req.query.dir ? cleanRel(req.query.dir) : '';
  const root = sub ? path.join(base, sub) : base;
  if (!root.startsWith(base) || !fs.existsSync(root)) return res.sendStatus(404);
  const z = new AdmZip(); z.addLocalFolder(root, sub ? path.basename(root) : sid);
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${(sub ? path.basename(root) : sid)}.zip"` }).send(z.toBuffer());
});

app.listen(PORT, () => console.log(`BIE chạy tại http://localhost:${PORT}${MOCK ? '  (MOCK mode)' : ''}`));
