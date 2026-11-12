// BIE - Business Intelligence Engine (Node.js)
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const PORT = process.env.PORT || 6688;
const ROOT = __dirname;
const OUTPUT = path.join(ROOT, 'output');
const SKILLS = path.join(ROOT, 'skills');
const DOCS = { claude: path.join(ROOT, 'CLAUDE.md'), memory: path.join(ROOT, 'MEMORY.md') };
const SCRATCH = path.join(os.tmpdir(), 'bie-cli-cwd'); // cwd trung tính cho claude CLI (tránh tự nạp CLAUDE.md lần 2)
fs.mkdirSync(OUTPUT, { recursive: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const STAGES = [
  { id: '01-business-goal', name: 'Business Context' },
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
const CLAUDE = require('./lib/claude-cli.js');   // tìm & gọi Claude Code CLI (PATH, thư mục mặc định, tiện ích VS Code…)
let LISTEN_PORT = Number(PORT);   // cổng thật sự đang nghe (có thể khác PORT nếu cổng bận)

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
// Không dùng cellDates của SheetJS: nó đổi ngày theo múi giờ máy (00:00:00 → 23:59:56 của ngày trước).
// Excel: đổi serial → UTC bằng số học; CSV: đọc chuỗi thô rồi tự nhận số / ngày.
const serialToDate = (n) => new Date(Math.round((n - 25569) * 86400) * 1000);
const DATE_ISO = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DATE_DMY = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
function strToDate(s) {
  let m = s.match(DATE_ISO); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
  m = s.match(DATE_DMY); if (!m) return null;
  let d = +m[1], mo = +m[2]; if (mo > 12 && d <= 12) [d, mo] = [mo, d]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(+m[3], mo - 1, d, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)));
}
function readForProfile(buf, filename) {
  if (/\.(csv|tsv)$/i.test(filename || '')) {
    const txt = Buffer.from(buf).toString('utf8').replace(/^﻿/, ''); const first = txt.split(/\r?\n/, 1)[0] || '';
    const cnt = (ch) => first.split(ch).length - 1; const sc = cnt(';'), cc = cnt(','), tc = cnt('\t');
    const FS = tc > cc && tc > sc ? '\t' : sc > cc ? ';' : ',';
    const wb = XLSX.read(txt, { type: 'string', raw: true, FS });
    for (const ws of Object.values(wb.Sheets)) for (const [a, cell] of Object.entries(ws)) {
      if (a[0] === '!' || !cell || typeof cell.v !== 'string') continue;
      const s = cell.v.trim(); const d = strToDate(s);
      if (d) { cell.v = d; cell.t = 'd'; } else if (/^[-+]?\d+(\.\d+)?$/.test(s) && !/^0\d+$/.test(s)) { cell.v = Number(s); cell.t = 'n'; }
    }
    return wb;
  }
  const wb = XLSX.read(buf, { type: 'buffer', cellNF: true });
  for (const ws of Object.values(wb.Sheets)) for (const [a, cell] of Object.entries(ws)) {
    if (a[0] === '!' || !cell) continue;
    if (cell.t === 'n' && typeof cell.v === 'number' && cell.v >= 1 && cell.z && XLSX.SSF.is_date(cell.z)) { cell.v = serialToDate(cell.v); cell.t = 'd'; }
  }
  return wb;
}
function profileData(buf, filename) {
  const wb = readForProfile(buf, filename);
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
      const info = { name: String(c).replace(/\s+/g, ' ').trim(), type, nulls: rows.length - nn.length, distinct: uniq.size };   // cùng cách chuẩn hóa tên cột với chặng ETL
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
    const sample = rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).replace(/\s+/g, ' ').trim(), v instanceof Date ? v.toISOString().slice(0, 10) : v])));
    return { name, rowCount: rows.length, columns, sample };
  });
  return { filename, sheets };
}

// ---------- API: meta / docs / skills ----------
// Template Power BI (.pbix) trong thư mục templates/ — người dùng chọn 1 ở bước Dashboard
app.get('/api/templates', (req, res) => { try { res.json(TPL.listTemplates()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/templates/:id/preview', (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.sendStatus(400);
  try { const t = TPL.loadTemplate(req.params.id); const p = t && TPL.previewImage(t); if (!p) return res.sendStatus(404); res.sendFile(p); } catch { res.sendStatus(500); }
});
app.get('/api/templates/:id/wireframe.svg', (req, res) => {
  if (!/^[\w-]+$/.test(req.params.id)) return res.sendStatus(400);
  try { const t = TPL.loadTemplate(req.params.id); if (!t) return res.sendStatus(404); res.type('image/svg+xml').send(TPL.wireframeSvg(t)); } catch { res.sendStatus(500); }
});
// Template .pbix của riêng phiên (người dùng tải lên ở bước Dashboard)
app.get('/api/runs/:id/pbix/preview', (req, res) => {
  if (!safeId(req.params.id)) return res.sendStatus(400);
  try { const t = TPL.resolveForRun(runDir(req.params.id), { templateSource: 'upload' }); const p = t && TPL.previewImage(t); if (!p) return res.sendStatus(404); res.sendFile(p); } catch { res.sendStatus(500); }
});
app.get('/api/runs/:id/pbix/wireframe.svg', (req, res) => {
  if (!safeId(req.params.id)) return res.sendStatus(400);
  try { const t = TPL.resolveForRun(runDir(req.params.id), { templateSource: 'upload' }); if (!t) return res.sendStatus(404); res.type('image/svg+xml').send(TPL.wireframeSvg(t)); } catch { res.sendStatus(500); }
});
// File mẫu Word để người dùng tải về điền (Business Context, người xem Direct / Indirect)
app.get('/api/samples/:k', (req, res, next) => {
  const s = require('./lib/samples.js').SAMPLES[req.params.k]; if (!s) return next();   // vd. /api/samples/version-data ở route riêng
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${s.file}"` }).send(s.build());
});
// Tình trạng máy: có Claude Code CLI chưa (giao diện hiện cảnh báo nếu thiếu)
app.get('/api/health', (req, res) => res.json({ claude: CLAUDE.check(req.query.force === '1'), mock: MOCK, platform: process.platform, node: process.version, root: ROOT, port: LISTEN_PORT }));
app.get('/api/meta', (req, res) => res.json({ stages: STAGES, models: MODELS, mock: MOCK, port: LISTEN_PORT, root: ROOT, steps: STEP_LABELS.map((l) => l.map(([id, label]) => ({ id, label }))) }));

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
process.env.BIE_ROOT = ROOT;
const TPL = require('./lib/pbix-template.js');
const AUD = require('./lib/audience.js');
const KB_DIR = path.join(ROOT, 'knowledge-base', 'rulesets');
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
// ---- Kiểm tra SKILL từng chặng: thiếu SKILL thì chặng tương ứng KHÔNG chạy được ----
function skillState(st) {
  const f = path.join(SKILLS, st.id, 'SKILL.md'); let reason = '';
  try {
    if (!fs.existsSync(f)) reason = 'không tìm thấy SKILL.md';
    else { const c = rd(f); if (!c.trim()) reason = 'SKILL.md đang trống'; else if (c.includes('PLACEHOLDER')) reason = 'SKILL mới là mẫu giữ chỗ'; }
  } catch { reason = 'không đọc được SKILL.md'; }
  return { id: st.id, name: st.name, ok: !reason, reason };
}
const skillStatus = () => STAGES.map(skillState);
const missingSkills = (from, to) => skillStatus().filter((s, i) => i >= from && i <= to && !s.ok);
const missingMsg = (arr) => 'Đang thiếu SKILL: ' + arr.map((s) => `"${s.name}" (${s.reason})`).join(', ') + ' — chặng tương ứng không chạy được. Hãy nạp SKILL ở trang Stages & SKILLs.';
const skillInfo = (s) => {
  const dir = path.join(SKILLS, s.id), c = rd(path.join(dir, 'SKILL.md'));
  return { ...s, content: c, tokens: estTokens(c), meta: parseFront(c), files: listFiles(dir), extraTokens: estTokens(resourceText(s.id)) };
};
const cleanRel = (p) => String(p).replace(/\\/g, '/').split('/').filter((x) => x && x !== '.' && x !== '..' && !/^[a-zA-Z]:$/.test(x)).join('/');
const IGNORED = /(^|\/)(node_modules|\.git|__MACOSX|\.DS_Store)(\/|$)/;

app.get('/api/skills', (req, res) => res.json(STAGES.map(skillInfo)));
app.get('/api/skills/status', (req, res) => res.json(skillStatus()));
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
  audienceDirect: { ext: ['md', 'pdf', 'docx'], text: true, label: 'Hồ sơ người xem trực tiếp (Direct)' },
  audienceIndirect: { ext: ['md', 'pdf', 'docx'], text: true, label: 'Hồ sơ người xem gián tiếp (Indirect)' },
  pbix: { ext: ['pbix'], label: 'Template Power BI của bạn', maxMB: 100 },
};
const SMP = require('./lib/samples.js');
const MAX_TEXT = 60000;
const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Đọc file văn bản: { text, tables } — bảng .docx / Markdown được giữ cấu trúc (hàng "a | b | c")
async function extractDoc(ext, buf) {
  if (ext === 'md' || ext === 'txt') { const text = buf.toString('utf8'); return { text, tables: SMP.mdTables(text) }; }
  if (ext === 'docx') return SMP.docxBlocks(buf);
  if (ext === 'pdf') { const pdf = require('pdf-parse/lib/pdf-parse.js'); const text = (await pdf(buf)).text; return { text, tables: [] }; }
  throw new Error('Định dạng không hỗ trợ');
}
const extractText = async (ext, buf) => (await extractDoc(ext, buf)).text;
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
  if (cfg.maxMB && req.file.size >= cfg.maxMB * 1024 * 1024) return res.status(400).json({ error: `${cfg.label}: file phải nhỏ hơn ${cfg.maxMB}MB (file của bạn ${(req.file.size / 1048576).toFixed(1)}MB)` });
  const inDir = path.join(runDir(id), '00-input');
  try {
    const dir = path.join(inDir, slot);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), req.file.buffer);
    const base = { name, size: req.file.size };
    if (slot === 'pbix') {
      let t;
      try { t = TPL.loadTemplateFile(path.join(dir, name), { id: 'upload', name: name.replace(/\.pbix$/i, '') }); }   // ném lỗi dễ hiểu nếu không phải PBIR
      catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error(/PBIR|Report\/definition/.test(e.message) ? e.message : 'Không đọc được file .pbix — file hỏng hoặc không phải báo cáo Power BI lưu ở định dạng PBIR (' + e.message.slice(0, 120) + ')'); }
      return res.json({ ...base, template: TPL.describe(t) });
    }
    if (cfg.text) {
      const doc = await extractDoc(ext, req.file.buffer);
      let text = doc.text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) throw new Error('Không đọc được nội dung chữ trong file (PDF dạng ảnh scan?)');
      const extra = {};
      // File mẫu Business Context gồm 2 phần: tách "Ngữ cảnh" và "Yêu cầu phân tích" khi tải vào ô nào cũng được
      if (slot === 'context' || slot === 'requirement') {
        const k = text.indexOf(SMP.MARK_REQ);
        if (k >= 0) {
          const part2 = text.slice(k).trim();
          if (slot === 'requirement') text = part2;
          else {
            text = text.slice(0, k).trim();
            if (!fs.existsSync(path.join(inDir, 'requirement.txt'))) {
              const rq = part2.slice(0, MAX_TEXT); wr(path.join(inDir, 'requirement.txt'), rq);
              fs.mkdirSync(path.join(inDir, 'requirement'), { recursive: true }); fs.writeFileSync(path.join(inDir, 'requirement', name), req.file.buffer);
              extra.alsoRequirement = { name, size: req.file.size, chars: rq.length, tokens: estTokens(rq), preview: rq.slice(0, 500) };
            }
          }
        }
      }
      // Hồ sơ người xem: đọc sẵn các trường để điền form
      const isSample = /— Mẫu điền/.test(text.slice(0, 200));   // file mẫu của BIE: chỉ giữ phần người dùng đã điền (bỏ chữ hướng dẫn/gợi ý)
      if (slot === 'audienceDirect') {
        extra.parsed = SMP.parseDirect(text);
        if (isSample) { text = [...Object.entries(extra.parsed.fields).map(([k, v]) => `${k}: ${v}`), ...extra.parsed.notes].join('\n'); if (!text) { extra.blank = true; text = '(file mẫu chưa điền)'; } }
      }
      if (slot === 'audienceIndirect') {
        extra.people = SMP.parseIndirect(doc.tables);
        if (isSample) { text = extra.people.map((p, i) => `${i + 1}. ` + Object.entries(p).map(([k, v]) => `${k}: ${v}`).join('; ')).join('\n') + (extra.people.length ? '' : ''); if (!text) { extra.blank = true; text = '(file mẫu chưa điền)'; } }
      }
      if (extra.blank) return res.json({ ...base, ...extra, chars: 0, tokens: 0, preview: 'File mẫu chưa được điền — chưa đọc được thông tin nào.' });
      const truncated = text.length > MAX_TEXT; if (truncated) text = text.slice(0, MAX_TEXT);
      wr(path.join(inDir, slot + '.txt'), text);
      return res.json({ ...base, ...extra, chars: text.length, tokens: estTokens(text), truncated, preview: text.slice(0, 500) });
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
// ---------- Danh mục chỉ số BI (từ documents/Business Intelligence Metrics.xlsx) ----------
const MC = require('./lib/metrics-catalog.js');
app.get('/api/metrics-catalog', (req, res) => {
  const run = req.query.run && safeId(String(req.query.run)) ? loadRun(String(req.query.run)) : null;
  const profile = run ? readJsonSafe(path.join(runDir(run.id), '00-input', 'profile.json')) : null;
  const cat = MC.load();
  const domains = cat.domains.map((d) => ({ id: d.id, label: d.label, name: d.name, categories: d.categories.map((c) => ({ name: c.name, metrics: c.metrics.map((m) => ({ ...m, fit: MC.fit(m, profile) })) })) }));
  res.json({ version: cat.version, source: cat.source, generatedAt: cat.generatedAt, hasData: !!(profile && profile.sheets && profile.sheets.length), suggestDomain: MC.domainFor(req.query.dept, req.query.pos), domains });
});

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
    `## Người xem trực tiếp của dashboard\n- Phòng ban: ${a.department || '?'}\n- Vị trí: ${a.position || '?'}\n- Level: ${a.level || '?'}\n- Học vấn: ${a.education || '(không khai báo)'}\n- Thâm niên tại doanh nghiệp hiện tại: ${a.tenureCompany || '?'}\n- Thâm niên từ khi đi làm: ${a.tenureCareer || '(không khai báo)'}`,
    kind === 'metrics'
      ? '## Danh mục chỉ số chuẩn của doanh nghiệp (BI Metrics)\n' + MC.namesForPrompt(MC.domainFor(a.department, a.position) || '') + '\n\n## Nhiệm vụ\nGợi ý 8–10 chỉ số (Key Metrics / measure để viết DAX) phù hợp nhất với người xem và yêu cầu trên. ƯU TIÊN chọn ĐÚNG TÊN trong danh mục chuẩn ở trên; chỉ thêm chỉ số ngoài danh mục khi thật sự cần cho yêu cầu. Sắp xếp từ quan trọng nhất.'
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
    if (kind === 'metrics') items = items.map((x) => { const m = MC.lookup(x.name); return m ? { name: m.name, reason: x.reason || m.description, catalog: true } : x; }).filter((x, i, a) => a.findIndex((y) => y.name === x.name) === i);
    run.extra = run.extra || []; run.extra.push({ label: 'Gợi ý ' + (kind === 'metrics' ? 'Key Metrics' : 'Dimensions'), model: r.model, usage: r.usage, cost: r.cost, ms: r.ms, at: new Date().toISOString() });
    saveRun(run);
    res.json({ items, usage: r.usage, model: r.model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- Đề xuất bố cục dashboard (review trước khi chạy chặng 4) ----------
const PLAN = require('./lib/plan.js');
const planFile = (id, approved) => path.join(runDir(id), '00-input', approved ? 'dashboard-plan.json' : 'dashboard-plan.draft.json');
function planCtx(run, form) {
  const tpl = TPL.resolveForRun(runDir(run.id), form);
  if (!tpl) throw new Error(form.templateSource === 'upload' ? 'Chưa tải file .pbix template của bạn' : 'Chưa chọn template Power BI');
  const profile = readJsonSafe(path.join(runDir(run.id), '00-input', 'profile.json')) || { sheets: [] };
  if (!profile.sheets.length) throw new Error('Chưa có dữ liệu — hãy tải file CSV/Excel ở bước 3 trước');
  const picked = form.sheets && form.sheets.length ? form.sheets : profile.sheets.map((s) => s.name);
  return { tpl, form: { ...form, sheets: picked }, profile, lang: form.dashboardLanguage === 'vi' ? 'vi' : 'en', aud: AUD.audienceProfile(form.audience || {}) };
}
function planPrompt(run, ctx, feedback, prev) {
  const inDir = path.join(runDir(run.id), '00-input'), f = ctx.form;
  return PLAN.buildPrompt({ form: f, tpl: ctx.tpl, profile: ctx.profile, lang: ctx.lang, feedback, prev, audMd: AUD.profileMarkdown(f.audience || {}), indirectMd: AUD.indirectMarkdown(f.indirect),
    ctxText: [f.contextTyped, rd(path.join(inDir, 'context.txt'))].filter(Boolean).join('\n\n'), reqText: [f.requirement, rd(path.join(inDir, 'requirement.txt'))].filter(Boolean).join('\n\n') });
}
app.post('/api/runs/:id/plan', async (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  try {
    const { form = {}, model, feedback, plan: prev } = req.body;
    const ctx = planCtx(run, form);
    const hRaw = PLAN.heuristic(ctx);
    let raw, via = 'ai', note = '';
    try {
      const r = await callClaude(planPrompt(run, ctx, feedback, prev), modelName(model), JSON.stringify(hRaw));
      run.extra = run.extra || []; run.extra.push({ label: 'Đề xuất bố cục dashboard', model: r.model, usage: r.usage, cost: r.cost, ms: r.ms, at: new Date().toISOString() }); saveRun(run);
      raw = PLAN.parseAi(r.text);
    } catch (e) { raw = hRaw; via = 'rules'; note = 'AI không trả về bố cục hợp lệ (' + e.message.slice(0, 120) + ') → dùng bố cục theo quy tắc.'; }
    const plan = PLAN.normalize(raw, ctx); plan.via = via; plan.status = 'draft'; if (note) plan.notes.unshift(note);
    if (feedback && MOCK) plan.notes.unshift('(MOCK) chế độ giả lập không áp dụng góp ý.');
    wr(planFile(run.id, false), JSON.stringify(plan, null, 2));
    res.json({ plan });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Kiểm tra lại plan sau khi người dùng sửa tay (đổi loại biểu đồ, Top N, bỏ ô…) — không gọi AI
app.post('/api/runs/:id/plan/check', (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  try { const { form = {}, plan } = req.body; res.json({ plan: PLAN.normalize(plan, planCtx(run, form)) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/runs/:id/plan', (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  try {
    const { form = {}, plan: raw } = req.body; const plan = PLAN.normalize(raw, planCtx(run, form));
    if (!plan.pages.some((p) => p.visuals.some((v) => !v.remove && v.slot))) throw new Error('Bố cục không có biểu đồ nào');
    plan.status = 'approved'; plan.approvedAt = new Date().toISOString();
    wr(planFile(run.id, true), JSON.stringify(plan, null, 2));
    res.json({ plan });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/runs/:id/plan', (req, res) => {
  if (!safeId(req.params.id) || !loadRun(req.params.id)) return res.sendStatus(400);
  fs.rmSync(planFile(req.params.id, true), { force: true }); fs.rmSync(planFile(req.params.id, false), { force: true }); res.json({ ok: true });
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
    let child; let out = '', err = '';
    try { child = CLAUDE.spawnClaude(args, { cwd: SCRATCH }).child; }
    catch (e) { e.detail = { exitCode: null, stderr: e.message, stdout: '', command: 'claude ' + args.slice(0, 9).join(' ') + ' ...' }; return reject(e); }
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const fail = (msg, code) => { const e = new Error(CLAUDE.explain(String(msg)).slice(0, 1800)); e.detail = { exitCode: code ?? null, stderr: err.slice(0, 6000), stdout: out.slice(0, 6000), command: 'claude ' + args.slice(0, 9).join(' ') + ' ...' }; reject(e); };
    child.on('error', (e) => fail(e.code === 'ENOENT' ? CLAUDE.notFoundMessage() : 'Không chạy được claude CLI: ' + e.message));
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
const VERSION_DESC = { BUD: 'Budget (ngân sách)', TGT: 'Target (mục tiêu)', FCST: 'Forecast (dự báo)', RFCST: 'Rolling Forecast (dự báo cuốn chiếu)', OUT6: 'Outlook 6 tháng (triển vọng 6 tháng tới)' };
const PERIOD_DESC = { PY: 'So với năm liền trước (PY — cả năm trước, PREVIOUSYEAR)', PQ: 'So với quý liền trước (PQ — cả quý trước, PREVIOUSQUARTER)', PM: 'So với tháng liền trước (PM — cả tháng trước, PREVIOUSMONTH)', YoY: 'Year over Year — so với cùng kỳ năm trước (LY)', MoM: 'Month over Month — so với tháng trước (LM)', QoQ: 'Quarter over Quarter — so với quý trước (LQ)', DoD: 'Day over Day — so với ngày trước (LD)' };
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

// Ruleset tri thức: SKILL khai báo `knowledge: a, b` → nạp knowledge-base/rulesets/<tên>.md vào prompt
function knowledgeText(stageId) {
  const names = String(skillMeta(stageId).knowledge || '').split(',').map((x) => x.trim()).filter(Boolean);
  let out = '';
  for (const n of names) { const p = path.join(KB_DIR, n.replace(/[^\w-]/g, '') + '.md'); if (fs.existsSync(p)) out += '\n\n## Ruleset: ' + n + '\n' + rd(p); }
  return out ? '# TRI THỨC CHUYÊN MÔN (knowledge-base/rulesets — hãy tuân thủ)' + out : '';
}

// EDA tất định (lib/eda.js): dùng dữ liệu sạch của chặng 3 nếu có, ngược lại làm sạch "nháp" bằng pre.js của chặng 3.
// Kết quả lưu ở 00-input/eda/{eda.json,eda.md}; cache theo (file nguồn + nguồn sạch) để không chạy lại mỗi chặng.
function ensureEda(run) {
  try {
    const rd0 = runDir(run.id), outDir = path.join(rd0, '00-input', 'eda'), s3 = path.join(rd0, '03-data-etl');
    const dataDir = path.join(rd0, '00-input', 'data');
    const src = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).map((n) => { const st = fs.statSync(path.join(dataDir, n)); return n + ':' + st.size + ':' + st.mtimeMs; }).join('|') : '';
    const s3ok = fs.existsSync(path.join(s3, 'data-checks.json')) && fs.existsSync(path.join(s3, 'clean'));
    const key = JSON.stringify({ src, s3ok, s3: s3ok ? fs.statSync(path.join(s3, 'data-checks.json')).mtimeMs : 0, sheets: (run.form && run.form.sheets) || [] });
    const keyFile = path.join(outDir, '.key');
    if (fs.existsSync(path.join(outDir, 'eda.md')) && fs.existsSync(keyFile) && rd(keyFile) === key) return rd(path.join(outDir, 'eda.md'));
    if (!src) return '';
    let cleanDir, checks;
    if (s3ok) { cleanDir = path.join(s3, 'clean'); checks = path.join(s3, 'data-checks.json'); }
    else {
      const scratch = path.join(outDir, '_scratch'); fs.mkdirSync(scratch, { recursive: true });
      const r = spawnSync(process.execPath, [path.join(SKILLS, '03-data-etl', 'scripts', 'pre.js'), rd0, scratch], { encoding: 'utf8', timeout: 120000, env: { ...process.env, BIE_ROOT: ROOT }, windowsHide: true });
      if (r.status !== 0) return '';
      cleanDir = path.join(scratch, 'clean'); checks = path.join(scratch, 'data-checks.json');
    }
    require('./lib/eda.js').run(cleanDir, checks, outDir);
    fs.writeFileSync(keyFile, key, 'utf8');
    return rd(path.join(outDir, 'eda.md'));
  } catch (e) { console.error('EDA lỗi (bỏ qua):', e.message); return ''; }
}

// Ngôn ngữ chữ hiển thị trên dashboard (tên measure, tiêu đề, nhãn...). Mặc định 'vi' nếu phiên cũ không khai báo.
function languageRule(f) {
  const en = (f && f.dashboardLanguage) === 'en';
  if (!en) return '# NGÔN NGỮ DASHBOARD: TIẾNG VIỆT\nChữ hiển thị trên dashboard (tên measure, tiêu đề trang/biểu đồ, nhãn, textbox) viết bằng tiếng Việt; thuật ngữ BI (KPI, YoY, MoM…) giữ tiếng Anh. Tên bảng/cột của dữ liệu giữ nguyên.';
  return '# NGÔN NGỮ DASHBOARD: ENGLISH (BẮT BUỘC — ghi đè quy định "trả lời tiếng Việt" ở CLAUDE.md cho phần chữ hiển thị trên dashboard)\n' +
    'Mọi chữ NGƯỜI XEM THẤY trong file Power BI phải bằng TIẾNG ANH: tên measure (kể cả measure script sinh từ `label` trong metrics-spec.json), nhãn dimension, tiêu đề trang, tiêu đề/phụ đề biểu đồ, nội dung textbox, `referenceTitle`, đơn vị, nhãn nút.\n' +
    '- Dịch tên chỉ số/chiều người dùng chọn bằng tiếng Việt sang tiếng Anh ngắn gọn, đúng thuật ngữ BI (Doanh thu → Revenue, Lợi nhuận gộp → Gross Profit, Số đơn hàng → Orders, Khu vực → Region). Dùng đúng cùng một tên ở mọi chặng.\n' +
    '- Tên bảng và tên cột của DỮ LIỆU giữ NGUYÊN (không dịch) vì phải khớp dữ liệu.\n' +
    '- Ví dụ: referenceTitle "vs. same period last year: " (không phải "So với cùng kỳ năm trước: "); tiêu đề biểu đồ nêu thông điệp bằng tiếng Anh.\n' +
    '- Phần giải thích/lập luận trong result.md vẫn viết tiếng Việt như CLAUDE.md. Tuyệt đối không để lẫn tiếng Việt vào chữ hiển thị trên dashboard.';
}

function buildPrompt(run, stageIdx, preOut, feedback) {
  const st = STAGES[stageIdx], meta = skillMeta(st.id);
  const f = run.form, a = f.audience || {}, inDir = path.join(runDir(run.id), '00-input');
  const profile = JSON.parse(rd(path.join(inDir, 'profile.json')) || '{"filename":"","sheets":[]}');
  const picked = (f.sheets && f.sheets.length) ? profile.sheets.filter((s) => f.sheets.includes(s.name)) : profile.sheets;
  const ctxText = [f.contextTyped, rd(path.join(inDir, 'context.txt'))].filter(Boolean).join('\n\n'), reqText = rd(path.join(inDir, 'requirement.txt'));
  const canRead = /\bRead\b/.test(meta.tools || '');
  const tpls = templateFiles(run);
  let tplChosen = null; try { tplChosen = TPL.resolveForRun(runDir(run.id), f); } catch { /* template hỏng → như chưa chọn */ }
  const dirNote = rd(path.join(inDir, 'audienceDirect.txt')), indNote = rd(path.join(inDir, 'audienceIndirect.txt'));
  const approvedPlan = stageIdx === 3 ? readJsonSafe(path.join(inDir, 'dashboard-plan.json')) : null;
  const parts = [];
  parts.push('# QUY ĐỊNH (CLAUDE.md)\n' + rd(DOCS.claude));
  parts.push('# BỘ NHỚ (MEMORY.md)\n' + rd(DOCS.memory));
  parts.push('# SKILL CỦA CHẶNG HIỆN TẠI: ' + st.name + '\n' + rd(path.join(SKILLS, st.id, 'SKILL.md')) + resourceText(st.id));
  { const kt = knowledgeText(st.id); if (kt) parts.push(kt); }
  if (stageIdx === 1 || stageIdx === 3) parts.push(languageRule(run.form));
  parts.push('# THÔNG TIN NGƯỜI DÙNG NHẬP\n' + [
    '## Ngữ cảnh doanh nghiệp' + (f.contextFileName ? ` (kèm file ${f.contextFileName})` : '') + '\n' + (ctxText || '(trống)'),
    '## Yêu cầu phân tích' + (f.requirementFileName ? ` (kèm file ${f.requirementFileName})` : '') + '\n' + ([f.requirementTyped, reqText].filter(Boolean).join('\n\n') || '(trống)'),
    '## Người xem TRỰC TIẾP (Direct) — người đọc và ra quyết định từ dashboard; dashboard được thiết kế cho họ\n' + [
      '- Phòng ban: ' + (a.department || '?'), '- Vị trí công việc hiện tại: ' + (a.position || '?'), '- Level: ' + (a.level || '?'),
      '- Giới tính: ' + (a.gender || '(không khai báo)'), '- Học vấn: ' + (a.education || '(không khai báo)'),
      '- Thâm niên tại doanh nghiệp hiện tại: ' + (a.tenureCompany || '?'), '- Thâm niên từ khi đi làm: ' + (a.tenureCareer || '(không khai báo)'),
    ].join('\n') + (dirNote ? '\n\n### Ghi chú về người xem trực tiếp (từ file người dùng tải lên)\n' + dirNote.slice(0, 6000) : ''),
    '## Hồ sơ người xem trực tiếp (tính bằng code từ level, học vấn + thâm niên — tuân thủ)\n' + AUD.profileMarkdown(a),
    ...((AUD.indirectMarkdown(f.indirect) || indNote) ? ['## Người xem GIÁN TIẾP (Indirect) — nhận kết quả hoặc bị ảnh hưởng, không trực tiếp thao tác\n' + [AUD.indirectMarkdown(f.indirect), indNote ? '### Ghi chú từ file người dùng tải lên (trích các thông tin cần thiết về từng người/nhóm: vai trò, nhu cầu, mức hiểu biết)\n' + indNote.slice(0, 8000) : ''].filter(Boolean).join('\n\n')] : []),
    '## Chỉ số cần phân tích (Key Metrics, để tính DAX)\n' + ((f.metrics || []).map((x) => '- ' + x).join('\n') || '(trống)'),
    ...(MC.definitionsMd(f.metrics) ? [MC.definitionsMd(f.metrics)] : []),
    '## Kỳ so sánh cần tính (time intelligence; viết DAX cho từng chỉ số)\n' + ((f.periods || []).map((x) => '- ' + x + ' (' + (PERIOD_DESC[x] || x) + ')').join('\n') || '(không yêu cầu)'),
    ...((f.versions || []).length ? ['## So sánh với Version (kế hoạch / dự báo) — người dùng đã chọn\n' + f.versions.map((x) => '- ' + (VERSION_DESC[x] || x)).join('\n') + '\nLưu ý: script KHÔNG sinh DAX cho Version. Chỉ làm được nếu dữ liệu ở chặng 3 có cột/sheet tương ứng (vd. cột Budget, sheet Target): khai báo giá trị version là metric cơ bản trong metrics-spec.json và so sánh bằng `derived` (vd. `{rev.SUM} - {budget.SUM}`). Không có dữ liệu → ghi rõ trong "Giả định và những việc không thực hiện được", KHÔNG bịa số liệu.'] : []),
    '## Các chiều (Dimension) cần phân tích\n' + ((f.dimensions || []).map((x) => '- ' + x).join('\n') || '(trống)'),
    '## Màu theme dashboard\n' + (f.colorMode === 'own' && (f.colors || []).length
      ? 'Người dùng chọn DÙNG 5 MÀU CỦA HỌ: ' + f.colors.join(', ') + ' (script sẽ thay vào bảng màu dữ liệu của template).'
      : 'Người dùng chọn GIỮ MÀU CỦA TEMPLATE (không có màu riêng). Đừng nhắc tới 5 màu tuỳ chỉnh.'),
    '## Template dashboard mẫu\n' + (tplChosen ? `Người dùng đã chọn template Power BI "${tplChosen.name}" — xem mục TEMPLATE POWER BI bên dưới.` : tpls.length
      ? (canRead ? 'Hãy dùng công cụ Read để XEM các file ảnh/PDF mẫu sau (đường dẫn tuyệt đối) và lấy bố cục làm cảm hứng:\n' : 'Có các file mẫu (chặng này không xem được nội dung):\n') + tpls.map((t) => `- ${t.path.replace(/\\/g, '/')} (${t.label})`).join('\n')
      : '(không có template)'),
  ].join('\n\n'));
  if (tplChosen && stageIdx === 3) parts.push(TPL.manifestMarkdown(tplChosen));
  if (tplChosen && approvedPlan && approvedPlan.pages) parts.push(PLAN.toMarkdown(approvedPlan, tplChosen));
  else if (tplChosen && stageIdx === 3) parts.push('# BỐ CỤC DASHBOARD: CHƯA CÓ BẢN DUYỆT\nNgười dùng chưa duyệt bố cục. Hãy tự thiết kế: nếu cần nhiều trang hơn template có, dùng `pages.clones` (nhân bản trang template) để mọi chỉ số/chiều được phân tích; giữ đúng số ô biểu đồ của trang template; đặt `topN` cho chiều có nhiều giá trị.');
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
  if (stageIdx !== 2) { const eda = ensureEda(run); if (eda) parts.push(eda); }
  for (let i = 0; i < stageIdx; i++) { const t = rd(path.join(runDir(run.id), STAGES[i].id, 'result.md')); parts.push('# OUTPUT CHẶNG ' + (i + 1) + ': ' + STAGES[i].name + '\n' + (t || '(chặng này chưa được chạy — không có kết quả; hãy làm với thông tin hiện có và ghi rõ những gì còn thiếu)')); }
  const ho = handoffText(run, stageIdx); if (ho) parts.push('# FILE BÀN GIAO TỪ CÁC CHẶNG TRƯỚC' + ho);
  if (stageIdx === 3 && f.versions && f.versions.length) {
    const vc = run.versionCheck || {}; const mj = readJsonSafe(path.join(runDir(run.id), '02-key-metrics', 'measures.json')) || {};
    const vm = (mj.measures || []).filter((m) => m.kind === 'version');
    parts.push('# SO SÁNH VERSION (Budget/Target/Forecast…)\nNgười dùng chọn: ' + f.versions.map((k) => (VER.byKey(k) || { name: k }).name).join(', ') + '. Trạng thái dữ liệu Version: **' + (vc.status || 'chưa kiểm tra') + '**.\n' +
      (vc.status === 'skipped' || (!vm.length && vc.status !== 'ok') ? '- KHÔNG có dữ liệu Version → KHÔNG tạo biểu đồ/thẻ so sánh Version; ghi rõ trong result.md ("Cảnh báo") rằng so sánh Version không thực hiện được vì thiếu dữ liệu.\n'
        : '- Đã có measure Version (script sinh, nằm trong measures.json, nhóm "Version", kind "version"): ' + vm.map((m) => m.name).join('; ') + '.\n- Dùng đúng các measure này khi cần so sánh với Version (vd. thẻ KPI `reference`, biểu đồ cột Actual vs Version). Số Version so với thực tế THEO THỜI GIAN (Calendar), không theo chiều khác.\n') +
      (vc.status === 'partial' ? '- Một số Version còn thiếu dữ liệu: ' + (vc.missing || []).map((k) => (VER.byKey(k) || { name: k }).name).join(', ') + ' → không so sánh với các Version này.\n' : ''));
  }
  if (preOut) parts.push('# KẾT QUẢ SCRIPT TIỀN XỬ LÝ (scripts/pre.js — do server chạy trước lượt này)\n' + preOut);
  if (feedback) {
    const prev = rd(path.join(runDir(run.id), st.id, 'result.md'));
    parts.push('# PHẢN HỒI CỦA EVALUATOR VỀ LẦN CHẠY TRƯỚC (BẮT BUỘC SỬA)\n' + feedback + (prev ? '\n\n## Kết quả lần trước (giữ phần đã đúng, chỉ sửa chỗ bị nêu)\n' + (prev.length > 14000 ? prev.slice(0, 14000) + '\n…(cắt bớt)' : prev) : ''));
  }
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
const EV = require('./lib/evaluator.js');
const MAX_RETRY = 2; // số lần chạy lại tối đa khi cổng kiểm chứng bật (tổng tối đa 3 lần)
const modelName = (m) => (/^[\w.\-\[\]]{1,60}$/.test(String(m || '')) ? String(m) : 'sonnet');
let mockFailLeft = +process.env.BIE_MOCK_FAIL || 0; // chỉ để thử: N lần chấm đầu tiên (ở chế độ MOCK) sẽ trượt AC1
const MOCK_VERDICT = (ac) => {
  const fail = mockFailLeft > 0 && ac.length; if (fail) mockFailLeft--;
  return JSON.stringify({ score: fail ? 40 : 90, criteria: ac.map((c, k) => ({ id: c.id, pass: !(fail && k === 0), note: '(MOCK)' })), feedback: fail ? '1. (MOCK) sửa AC1' : '' });
};
const EVAL_EXTRA = [[], ['metrics-spec.json'], [], ['dashboard-spec.json', 'pbip-validation.md']];

// Một lượt chấm độc lập (model riêng, chỉ đọc). Trả { verdict: PASS|FAIL|ERROR|SKIP, score, criteria, feedback, failedCritical }
async function evaluateStage(run, i, attempt) {
  const st = STAGES[i], dir = path.join(runDir(run.id), st.id);
  const ac = EV.loadAC(SKILLS, st.id);
  if (!ac.length) return { verdict: 'SKIP', score: null, criteria: [], feedback: '', failedCritical: [], note: 'Chặng này chưa có assets/evaluator.md' };
  const handoffFiles = String(skillMeta(st.id).handoff || '').split(',').map((x) => x.trim()).filter(Boolean);
  const evidence = EV.gatherEvidence(runDir(run.id), i, STAGES.map((x) => x.id), { handoffFiles, extraFiles: EVAL_EXTRA[i] || [], audienceMd: AUD.profileMarkdown((run.form || {}).audience) });
  const prompt = EV.buildEvalPrompt({ stageName: st.name, stageIdx: i, ac, evidence, attempt });
  wr(path.join(dir, 'evaluator-prompt.md'), prompt);
  let r;
  try { r = await callClaude(prompt, modelName(run.gate && run.gate.model), MOCK_VERDICT(ac)); }
  catch (e) { return { verdict: 'ERROR', score: null, criteria: [], feedback: '', failedCritical: [], error: 'Không chạy được evaluator: ' + e.message }; }
  run.extra = run.extra || []; run.extra.push({ label: `Evaluator chặng ${i + 1} (lần ${attempt})`, model: r.model, usage: r.usage, cost: r.cost, ms: r.ms, at: new Date().toISOString() });
  const v = EV.parseVerdict(r.text, ac); v.model = r.model;
  if (v.verdict === 'ERROR') v.error = v.parseError;
  return v;
}

// Chạy một chặng; nếu bật cổng kiểm chứng: chấm độc lập, trượt (critical) thì chạy lại kèm phản hồi (tối đa MAX_RETRY lần).
// Lỗi script cũng được chạy lại. Hết lượt mà vẫn trượt → chặng báo lỗi (kết quả vẫn nằm trên đĩa để xem).
async function execStage(run, i) {
  { const miss = missingSkills(i, i); if (miss.length) {
    const sg = run.stages[i], msg = missingMsg(miss);
    sg.status = 'error'; sg.error = msg; sg.endedAt = Date.now(); sg.startedAt = sg.startedAt || sg.endedAt;
    sg.errorDetail = { stderr: msg, command: 'kiểm tra SKILL trước khi chạy chặng', model: sg.model, at: new Date().toISOString() };
    saveRun(run); return false;
  } }
  const gate = !!(run.gate && run.gate.enabled);
  const st = STAGES[i], s = run.stages[i], dir = path.join(runDir(run.id), st.id);
  s.attempts = []; s.evaluation = null; s.phase = null;
  let feedback = '';
  for (let attempt = 1; attempt <= (gate ? MAX_RETRY + 1 : 1); attempt++) {
    s.attempt = attempt;
    const ok = await attemptStage(run, i, feedback, attempt);
    if (!gate) return ok;
    const last = attempt === MAX_RETRY + 1;
    if (!ok) {
      s.attempts.push({ attempt, verdict: 'SCRIPT_ERROR', error: s.error });
      if (last) return false;
      run.extra = run.extra || []; if (s.usage) { run.extra.push({ label: `Chặng ${i + 1} lần ${attempt} (lỗi script)`, model: s.usedModel, usage: s.usage, cost: s.cost, ms: s.ms, at: new Date().toISOString() }); s.usage = null; }
      feedback = `Lần chạy trước thất bại:${s.error}\nHãy sửa đầu ra để các bước tự động chạy được (đúng khối FILE, JSON hợp lệ, đúng tên bảng/cột).`;
      continue;
    }
    s.status = 'running'; s.phase = 'evaluating'; saveRun(run); markStep(run, i, 'eval', 'running');
    const ev = await evaluateStage(run, i, attempt);
    markStep(run, i, 'eval', ev.verdict === 'FAIL' ? 'error' : 'done', ev.verdict + (ev.score != null ? ' · ' + ev.score : ''));
    s.attempts.push({ attempt, verdict: ev.verdict, score: ev.score, failed: ev.failedCritical || [] });
    s.evaluation = { ...ev, attempt, history: s.attempts }; s.phase = null;
    try { wr(path.join(dir, 'evaluation.json'), JSON.stringify(s.evaluation, null, 2)); wr(path.join(dir, 'evaluation.md'), EV.toMarkdown(s.evaluation, st.name)); } catch {}
    s.files = listFiles(dir).map((f) => f.path).sort((a, b) => (a === 'result.md' ? -1 : b === 'result.md' ? 1 : a.localeCompare(b))).slice(0, 400);
    if (ev.verdict !== 'FAIL') { s.status = 'done'; s.endedAt = Date.now(); saveRun(run); return true; } // PASS / SKIP / ERROR (evaluator lỗi → không chặn)
    if (last) {
      s.status = 'error'; s.endedAt = Date.now();
      s.error = `Cổng kiểm chứng: chặng không đạt sau ${attempt} lần chạy — AC critical trượt: ${(ev.failedCritical || []).join(', ')}`;
      s.errorDetail = { stderr: EV.toMarkdown(s.evaluation, st.name), command: 'evaluator (xem evaluation.md trong thư mục chặng)', model: s.model, at: new Date().toISOString() };
      try { wr(path.join(dir, 'error.json'), JSON.stringify({ message: s.error, ...s.errorDetail }, null, 2)); } catch {}
      saveRun(run); return false;
    }
    feedback = ev.feedback || 'Evaluator báo trượt nhưng không nêu chi tiết; hãy rà lại các AC critical.';
    // chuẩn bị cho lần sau: lượt đã bị loại vẫn tính vào tổng token
    run.extra = run.extra || []; if (s.usage) run.extra.push({ label: `Chặng ${i + 1} lần ${attempt} (bị loại)`, model: s.usedModel, usage: s.usage, cost: s.cost, ms: s.ms, at: new Date().toISOString() });
    s.usage = null;
  }
  return false;
}

// ---------- Các bước nhỏ (flow con) bên trong mỗi chặng — hiển thị trên workflow ----------
const fmtK = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));
const STEP_LABELS = [
  [['prompt', 'Đọc ngữ cảnh + EDA'], ['model', 'Model viết bối cảnh'], ['post', 'Kiểm tra G→Q→D']],
  [['prompt', 'Nạp bối cảnh + chỉ số'], ['model', 'Model chọn measure'], ['post', 'Sinh DAX (script)']],
  [['pre', 'Làm sạch dữ liệu'], ['prompt', 'Chuẩn bị prompt'], ['model', 'Model: modeling'], ['post', 'Dựng model-spec'], ['version', 'Kiểm tra Version']],
  [['plan', 'Bố cục đã duyệt'], ['prompt', 'Nạp measure + template'], ['model', 'Model gắn biểu đồ'], ['post', 'Dựng PBIP + kiểm tra']],
];
function initSteps(run, i) {
  const f = run.form || {}, sd = path.join(SKILLS, STAGES[i].id, 'scripts');
  const list = STEP_LABELS[i].filter(([id]) => (id !== 'pre' || fs.existsSync(path.join(sd, 'pre.js'))) && (id !== 'version' || (f.versions || []).length) && (id !== 'plan' || fs.existsSync(path.join(runDir(run.id), '00-input', 'dashboard-plan.json'))));
  if (run.gate && run.gate.enabled) { const k = list.findIndex(([id]) => id === 'version'); list.splice(k < 0 ? list.length : k, 0, ['eval', 'Evaluator độc lập']); }
  run.stages[i].steps = list.map(([id, label]) => ({ id, label, status: id === 'plan' ? 'done' : 'pending' }));
}
function markStep(run, i, id, status, note) {
  const s = run.stages[i]; if (!s) return; s.steps = s.steps || [];
  let x = s.steps.find((t) => t.id === id);
  if (!x) { const lab = (STEP_LABELS[i].find(([k]) => k === id) || [id, id])[1]; x = { id, label: lab, status: 'pending' }; s.steps.push(x); }
  x.status = status; if (note !== undefined) x.note = note;
  if (status === 'running') { x.startedAt = Date.now(); delete x.endedAt; } else if (x.startedAt && ['done', 'error', 'skipped'].includes(status)) x.endedAt = Date.now();
  saveRun(run);
}

async function attemptStage(run, i, feedback, attempt) {
  const st = STAGES[i], s = run.stages[i];
  const dir = path.join(runDir(run.id), st.id);
  fs.mkdirSync(dir, { recursive: true });
  s.status = 'running'; s.startedAt = s.startedAt && attempt > 1 ? s.startedAt : Date.now(); s.error = null; s.errorDetail = null; s.scripts = [];
  const keepVersion = (s.steps || []).find((t) => t.id === 'version'); initSteps(run, i); if (keepVersion) { const v = s.steps.find((t) => t.id === 'version'); if (v) Object.assign(v, keepVersion); }
  saveRun(run);
  try {
    // 1) pre.js (tiền xử lý xác định, không tốn token)
    let preOut = '';
    if ((s.steps || []).some((t) => t.id === 'pre')) markStep(run, i, 'pre', 'running');
    const pre = await runScript(st.id, 'pre.js', runDir(run.id), dir);
    if (pre) {
      wr(path.join(dir, 'pre.log'), pre.stdout + (pre.stderr ? '\n[stderr]\n' + pre.stderr : ''));
      s.scripts.push({ name: 'pre.js', code: pre.code });
      if (pre.code !== 0) throw scriptFail(pre);
      preOut = pre.stdout.length > 30000 ? pre.stdout.slice(0, 30000) + '\n…(cắt bớt)' : pre.stdout;
      markStep(run, i, 'pre', 'done');
    }
    // 2) gọi model
    markStep(run, i, 'prompt', 'running');
    const meta = skillMeta(st.id);
    const prompt = buildPrompt(run, i, preOut, feedback);
    s.promptTokensEst = estTokens(prompt);
    wr(path.join(dir, 'prompt.md'), prompt);
    markStep(run, i, 'prompt', 'done', '~' + fmtK(s.promptTokensEst) + ' token');
    markStep(run, i, 'model', 'running');
    const opts = meta.tools ? { tools: meta.tools, addDirs: [path.join(runDir(run.id), '00-input'), TEMPLATES_DIR].filter((d) => fs.existsSync(d)) } : {};
    const r = await callClaude(prompt, s.model, undefined, opts);
    const ex = extractFileBlocks(r.text, dir);
    wr(path.join(dir, 'result.md'), ex.text);
    wr(path.join(dir, 'metrics.json'), JSON.stringify({ model: r.model, usage: r.usage, contextWindow: r.contextWindow, costUSD: r.cost, ms: r.ms, filesFromModel: ex.written }, null, 2));
    s.usage = r.usage; s.contextWindow = r.contextWindow; s.cost = r.cost; s.ms = r.ms; s.usedModel = r.model;
    markStep(run, i, 'model', 'done', fmtK(r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheCreate) + ' token');
    // 3) post.js (kiểm tra / sinh file xác định từ kết quả của model, ví dụ dựng PBIP)
    markStep(run, i, 'post', 'running');
    const post = await runScript(st.id, 'post.js', runDir(run.id), dir);
    if (post) {
      wr(path.join(dir, 'post.log'), post.stdout + (post.stderr ? '\n[stderr]\n' + post.stderr : ''));
      s.scripts.push({ name: 'post.js', code: post.code });
      if (post.code !== 0) throw scriptFail(post);
    }
    markStep(run, i, 'post', 'done');
    s.files = listFiles(dir).map((f) => f.path).sort((a, b) => (a === 'result.md' ? -1 : b === 'result.md' ? 1 : a.localeCompare(b))).slice(0, 400);
    s.status = 'done';
  } catch (e) {
    (s.steps || []).forEach((t) => { if (t.status === 'running') { t.status = 'error'; t.endedAt = Date.now(); } });
    s.status = 'error'; s.error = e.message;
    s.errorDetail = { ...(e.detail || {}), stack: e.stack, model: s.model, at: new Date().toISOString() };
    try { wr(path.join(dir, 'error.json'), JSON.stringify({ message: s.error, ...s.errorDetail }, null, 2)); } catch {}
  }
  s.endedAt = Date.now(); saveRun(run);
  return s.status === 'done';
}

// ---------- Cổng Version: sau Data (ETL), trước Dashboard ----------
// Người dùng chọn so sánh Version (Budget/Target/Forecast…) ở Key Metrics → kiểm tra dữ liệu có Version chưa.
// Thiếu → DỪNG (run.status = 'waiting') chờ người dùng bổ sung (file mẫu) hoặc xác nhận chạy tiếp không có dữ liệu.
const VER = require('./lib/versions.js');
const VER_DIR = (id) => path.join(runDir(id), '00-input', 'version');
function versionGate(run, blocking) {
  const sel = (run.form && run.form.versions) || [];
  if (!sel.length) return 'go';
  const vc = run.versionCheck = run.versionCheck || {};
  const checks = readJsonSafe(path.join(runDir(run.id), '03-data-etl', 'data-checks.json'));
  const det = VER.detect(checks, sel);
  const upMeta = readJsonSafe(path.join(VER_DIR(run.id), 'versions.json'));
  const hasUp = !!upMeta && fs.existsSync(path.join(VER_DIR(run.id), 'Versions.csv'));
  const covered = new Set([...Object.keys(det.found), ...(hasUp ? sel.filter((k) => !(upMeta.stillMissing || []).includes(k)) : [])]);
  vc.versions = sel; vc.found = Object.fromEntries(Object.entries(det.found).map(([k, h]) => [k, h.map((x) => x.table + '.' + x.column)]));
  vc.missing = sel.filter((k) => !covered.has(k)); vc.checkedAt = Date.now();
  const apply = () => { const r = VER.applyToRun(runDir(run.id), { useUpload: hasUp, found: det.found }); vc.measures = r.measures; };
  if (vc.decision === 'skip') { vc.status = 'skipped'; if (hasUp || Object.keys(det.found).length) apply(); return 'go'; }
  if (vc.decision === 'with-data') { apply(); vc.status = vc.missing.length ? 'partial' : 'applied'; return 'go'; }
  if (!vc.missing.length) { apply(); vc.status = hasUp ? 'applied' : 'ok'; return 'go'; }
  if (!blocking) { apply(); vc.status = 'partial'; return 'go'; }   // chạy riêng chặng Dashboard: không chặn, chỉ dùng phần đã có
  vc.status = 'needs_data'; vc.askedAt = Date.now(); return 'wait';
}

async function runPipeline(run, from, only) {
  running.add(run.id); run.status = 'running'; saveRun(run);
  if (from <= 2 && run.versionCheck) { run.versionCheck.decision = null; run.versionCheck.status = null; }   // chạy lại từ đầu → hỏi lại
  let ok = true;
  for (let i = from; i < STAGES.length; i++) {
    if (i === 3) {
      let g = 'go'; try { g = versionGate(run, !only); } catch (e) { console.error('Cổng Version lỗi (bỏ qua):', e.message); }
      { const vc = run.versionCheck || {}; if ((run.form && run.form.versions || []).length && run.stages[2]) markStep(run, 2, 'version', g === 'wait' ? 'waiting' : ['skipped', 'partial'].includes(vc.status) ? 'skipped' : 'done', g === 'wait' ? 'chờ dữ liệu' : (vc.status || '')); }
      if (g === 'wait') { run.status = 'waiting'; saveRun(run); running.delete(run.id); return; }
      saveRun(run);
    }
    if (!(await execStage(run, i))) { ok = false; break; }
    if (only) break;
  }
  const allDone = run.stages.every((s) => s.status === 'done');
  run.status = allDone ? 'done' : ok ? 'partial' : 'error'; saveRun(run);
  if (allDone && !run.memoryLogged) {
    run.memoryLogged = true; saveRun(run);
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
  if (running.has(run.id)) return res.status(409).json({ error: 'Phiên này đang chạy một chặng — hãy đợi chặng đó xong rồi chạy tiếp.' });
  const { form, models, only, gate } = req.body;
  if (gate !== undefined) run.gate = gate && gate.enabled ? { enabled: true, model: modelName(gate.model) } : { enabled: false };
  const f = form || {};
  run.form = { ...f, requirementTyped: (f.requirement || '').trim(), requirement: (f.requirement || '').trim() || (f.requirementFileName ? '[file] ' + f.requirementFileName : '') };
  if (f.templateSource === 'upload') { let ok = false; try { ok = !!TPL.resolveForRun(runDir(run.id), f); } catch (e) { return res.status(400).json({ error: e.message }); } if (!ok) return res.status(400).json({ error: 'Chưa tải file .pbix template của bạn lên' }); }
  else if (f.template && !TPL.loadTemplate(String(f.template))) return res.status(400).json({ error: 'Template "' + f.template + '" không tồn tại trong thư mục templates/' });
  const model = (i) => (models && models[i]) || (run.stages && run.stages[i] && run.stages[i].model) || 'sonnet';
  const single = Array.isArray(only) && only.length === 1 && Number.isInteger(only[0]) && only[0] >= 0 && only[0] < STAGES.length ? only[0] : null;
  { const miss = single !== null ? missingSkills(single, single) : missingSkills(0, STAGES.length - 1); if (miss.length) return res.status(400).json({ error: missingMsg(miss), code: 'skill_missing', missing: miss }); }
  if (single !== null) {
    // Chạy RIÊNG một chặng (kể cả khi thiếu thông tin / chưa chạy chặng trước): giữ kết quả các chặng khác
    if (!run.stages || run.stages.length !== STAGES.length) run.stages = STAGES.map((s, i) => ({ id: s.id, name: s.name, status: 'pending', model: model(i) }));
    run.stages[single].model = model(single);
    if (!run.startedAt) run.startedAt = Date.now();
    saveRun(run);
    runPipeline(run, single, true);
  } else {
    run.stages = STAGES.map((s, i) => ({ id: s.id, name: s.name, status: 'pending', model: model(i) }));
    run.startedAt = Date.now();
    saveRun(run);
    runPipeline(run, 0, false);
  }
  res.json({ ok: true });
});
app.post('/api/runs/:id/stages/:n/rerun', (req, res) => {
  const run = loadRun(req.params.id); const i = Number(req.params.n);
  if (!run || !run.stages[i]) return res.sendStatus(404);
  if (running.has(run.id)) return res.status(409).json({ error: 'Phiên này đang chạy một chặng — hãy đợi chặng đó xong rồi chạy tiếp.' });
  if (req.body.model) run.stages[i].model = req.body.model;
  if (req.body.gate !== undefined) run.gate = req.body.gate && req.body.gate.enabled ? { enabled: true, model: modelName(req.body.gate.model) } : { enabled: false };
  for (let k = 0; k < i; k++) if (run.stages[k].status !== 'done') return res.status(400).json({ error: 'Các chặng trước chưa hoàn thành' });
  { const miss = missingSkills(i, req.body.only ? i : STAGES.length - 1); if (miss.length) return res.status(400).json({ error: missingMsg(miss), code: 'skill_missing', missing: miss }); }
  runPipeline(run, i, !!req.body.only);
  res.json({ ok: true });
});
// Hoạt động gần đây (chuông thông báo + trạng thái sidebar): flow nào đang chạy / lỗi / đã xong
app.get('/api/activity', (req, res) => {
  const ids = fs.readdirSync(OUTPUT).filter((d) => fs.existsSync(path.join(OUTPUT, d, 'run.json'))).sort().reverse();
  const items = []; let runningN = 0;
  for (const id of ids.slice(0, 20)) {
    const r = loadRun(id); if (!r || !r.stages || !r.stages.length) continue;   // bỏ phiên nháp chưa chạy
    const st = r.stages, cur = st.findIndex((s) => s.status === 'running'), err = st.findIndex((s) => s.status === 'error'), done = st.filter((s) => s.status === 'done').length;
    const isRun = running.has(id) || cur >= 0;
    const waiting = !isRun && r.status === 'waiting';
    const status = isRun ? 'running' : waiting ? 'waiting' : err >= 0 ? 'error' : done === st.length ? 'done' : done > 0 ? 'partial' : 'idle';
    if (status === 'idle') continue;
    if (isRun) runningN++;
    const at = Math.max(0, ...st.map((s) => Math.max(s.endedAt || 0, s.startedAt || 0))) || Date.parse(r.createdAt) || 0;
    const si = isRun ? Math.max(cur, 0) : err >= 0 ? err : -1;
    items.push({
      id, status, file: r.file || '', title: (r.form && r.form.requirement) || '', at, done, total: st.length,
      stage: si >= 0 ? { n: si + 1, name: st[si].name, phase: st[si].phase || '', attempt: st[si].attempt || 0 } : null,
      error: err >= 0 && !isRun ? String(st[err].error || '').slice(0, 160) : '',
      doneStages: st.map((s, i) => (s.status === 'done' ? i + 1 : 0)).filter(Boolean),
      waitingFor: waiting ? ((r.versionCheck && r.versionCheck.missing) || []).map((k) => (VER.byKey(k) || { name: k }).name) : undefined,
    });
  }
  res.json({ items, running: runningN, total: ids.length, mock: MOCK, now: Date.now(), root: ROOT, port: LISTEN_PORT });
});
// ---------- Cập nhật phiên bản từ GitHub (cho người đã clone repo) ----------
const UPD = require('./lib/updater.js');
let updCache = { at: 0, data: null, busy: null };
app.get('/api/update/status', async (req, res) => {
  const force = req.query.force === '1';
  if (!force && updCache.data && Date.now() - updCache.at < 10 * 60 * 1000) return res.json(updCache.data);
  try {
    updCache.busy = updCache.busy || UPD.status(ROOT, { token: UPD.readToken(ROOT) });   // tránh nhiều request cùng lúc chạy git fetch
    const data = await updCache.busy; updCache = { at: Date.now(), data, busy: null };
    res.json(data);
  } catch (e) { updCache.busy = null; res.status(500).json({ supported: false, error: e.message }); }
});
app.post('/api/update/run', async (req, res) => {
  // chỉ nhận từ trang BIE chạy trên máy này (chặn trang web khác gọi vào để mở terminal)
  const o = req.get('origin'); if (o && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) return res.status(403).json({ error: 'Origin không hợp lệ' });
  if (running.size) return res.status(409).json({ error: 'Đang có flow chạy — hãy đợi flow xong rồi cập nhật (cập nhật sẽ khởi động lại server).' });
  const r = UPD.launch(ROOT, { port: LISTEN_PORT, serverPid: process.pid, dryRun: process.env.BIE_UPDATE_DRYRUN === '1' });
  if (!r.ok) return res.status(500).json(r);
  updCache = { at: 0, data: null, busy: null };
  if (r.dryRun) return res.json(r);
  // update.ps1 ghi .update-status ngay khi cửa sổ terminal mở; không thấy sau ~12 s → báo để người dùng chạy tay
  const mark = path.join(ROOT, '.update-status'); let opened = false;
  const waitMark = async (n) => { for (let i = 0; i < n && !opened; i++) { opened = fs.existsSync(mark); if (!opened) await new Promise((k) => setTimeout(k, 300)); } };
  await waitMark(14);
  if (!opened) { UPD.launchFallback(ROOT, { port: LISTEN_PORT, serverPid: process.pid }); await waitMark(30); }
  res.json({ ...r, opened });
});

// ---------- API: dữ liệu Version (file mẫu, tải lên, tiếp tục) ----------
app.get('/api/samples/version-data', (req, res) => {
  const run = req.query.run && safeId(String(req.query.run)) ? loadRun(String(req.query.run)) : null; const f = (run && run.form) || {};
  let start = null;
  const checks = run && readJsonSafe(path.join(runDir(run.id), '03-data-etl', 'data-checks.json'));
  for (const t of (checks && checks.tables) || []) for (const c of t.columns || []) if (!start && /date/.test(c.type) && c.min) start = c.min;
  const vc = (run && run.versionCheck) || {};
  const buf = VER.sampleBuffer({ metrics: f.metrics || [], versions: (vc.missing && vc.missing.length ? vc.missing : f.versions) || [], start });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="Version-data-mau.xlsx"' }).send(buf);
});
app.get('/api/runs/:id/version', (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  res.json({ status: run.status, versionCheck: run.versionCheck || null, versions: (run.form && run.form.versions) || [], names: Object.fromEntries(VER.VERSIONS.map((v) => [v.k, v.name])) });
});
app.post('/api/runs/:id/version/upload', upload.single('file'), (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  if (!req.file) return res.status(400).json({ error: 'Chưa có file' });
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8'), ext = path.extname(name).slice(1).toLowerCase();
  if (!['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) return res.status(400).json({ error: 'Chỉ nhận file .xlsx, .xls hoặc .csv (hãy dùng file mẫu)' });
  try {
    const parsed = VER.parseWorkbook(readForProfile(req.file.buffer, name), (run.form && run.form.versions) || []);
    if (!parsed.ok) return res.status(400).json({ error: parsed.errors.join(' ') });
    const dir = VER_DIR(run.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), req.file.buffer); fs.writeFileSync(path.join(dir, 'Versions.csv'), parsed.csv, 'utf8');
    const { csv, ...meta } = parsed; fs.writeFileSync(path.join(dir, 'versions.json'), JSON.stringify({ ...meta, file: name }, null, 2), 'utf8');
    const vc = run.versionCheck = run.versionCheck || {};
    const det = VER.detect(readJsonSafe(path.join(runDir(run.id), '03-data-etl', 'data-checks.json')), (run.form && run.form.versions) || []);
    const sel = (run.form && run.form.versions) || [];
    vc.upload = { name, rows: meta.rows, versions: meta.versions, metrics: meta.metrics, dims: meta.dims, dateMin: meta.dateMin, dateMax: meta.dateMax, warnings: meta.warnings, stillMissing: meta.stillMissing };
    vc.missing = sel.filter((k) => !det.found[k] && meta.stillMissing.includes(k)); saveRun(run);
    res.json({ ok: true, ...vc.upload, missing: vc.missing, names: Object.fromEntries(VER.VERSIONS.map((v) => [v.k, v.name])) });
  } catch (e) { res.status(400).json({ error: 'Không đọc được file: ' + e.message }); }
});
app.post('/api/runs/:id/version/continue', (req, res) => {
  const run = safeId(req.params.id) && loadRun(req.params.id); if (!run) return res.sendStatus(404);
  if (running.has(run.id)) return res.status(409).json({ error: 'Phiên này đang chạy' });
  if (run.status !== 'waiting') return res.status(400).json({ error: 'Phiên này không ở trạng thái chờ dữ liệu Version' });
  const mode = req.body && req.body.mode;
  if (!['with-data', 'skip'].includes(mode)) return res.status(400).json({ error: 'mode phải là with-data hoặc skip' });
  if (mode === 'with-data' && !fs.existsSync(path.join(VER_DIR(run.id), 'Versions.csv'))) return res.status(400).json({ error: 'Chưa tải dữ liệu Version lên' });
  run.versionCheck = run.versionCheck || {}; run.versionCheck.decision = mode; saveRun(run);
  runPipeline(run, 3, false); res.json({ ok: true });
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

// Cổng đang bị dùng (vd. một bản BIE khác trên máy này) → tự chọn cổng trống kế tiếp thay vì báo lỗi khó hiểu
function listenOn(port, tries) {
  const srv = app.listen(port, () => {
    LISTEN_PORT = port;
    console.log(`BIE chạy tại http://localhost:${port}${MOCK ? '  (MOCK mode)' : ''}`);
    console.log('Thư mục BIE đang chạy: ' + ROOT);
    if (!MOCK) { const c = CLAUDE.check(); console.log(c.found ? `Claude Code CLI: ${c.version} (${c.source}: ${c.path})` : '⚠ ' + c.message); }
    if (port !== Number(PORT)) console.log(`⚠ Cổng ${PORT} đang được một chương trình khác dùng (có thể là bản BIE khác trên máy bạn) → BIE dùng cổng ${port}. Hãy mở đúng địa chỉ ở trên.`);
  });
  srv.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries > 0) { console.log(`Cổng ${port} đang bận, thử cổng ${port + 1}…`); listenOn(port + 1, tries - 1); }
    else { console.error('Không mở được cổng: ' + e.message); process.exit(1); }
  });
}
listenOn(Number(PORT), 20);
