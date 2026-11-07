// Tiện ích dùng chung cho test: dựng một "run" giả trong thư mục tạm, chạy script chặng, đọc kết quả.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const SK = (n) => path.join(ROOT, 'skills', n, 'scripts');

function tmpRun(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bie-test-${name}-`));
}

/** Tạo run: ghi dữ liệu (csv text hoặc workbook) vào 00-input/data + run.json */
function makeRun({ name = 'run', csv, sheets, fileName, form = {} }) {
  const dir = tmpRun(name);
  const data = path.join(dir, '00-input', 'data');
  fs.mkdirSync(data, { recursive: true });
  let file;
  if (csv !== undefined) { file = fileName || 'data.csv'; fs.writeFileSync(path.join(data, file), csv, 'utf8'); }
  else {
    file = fileName || 'data.xlsx';
    const wb = XLSX.utils.book_new();
    for (const [sn, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sn);
    XLSX.writeFile(wb, path.join(data, file));
  }
  fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ id: 'test', file, form: { colors: [], colorMode: 'template', ...form }, stages: [] }));
  for (const s of ['01-business-goal', '02-key-metrics', '03-data-etl', '04-dashboard-pbip']) fs.mkdirSync(path.join(dir, s), { recursive: true });
  return dir;
}

function script(stage, which, runDir, extraEnv = {}) {
  const r = cp.spawnSync(process.execPath, [path.join(SK(stage), which + '.js'), runDir, path.join(runDir, stage)], {
    encoding: 'utf8', env: { ...process.env, BIE_ROOT: ROOT, BIE_SKIP_SCHEMA: '1', ...extraEnv },
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const rm = (d) => fs.rmSync(d, { recursive: true, force: true });

/** Chạy chặng 3 (pre + post) */
function etl(runDir) {
  const a = script('03-data-etl', 'pre', runDir);
  if (a.status) return { pre: a, post: null };
  return { pre: a, post: script('03-data-etl', 'post', runDir) };
}

module.exports = { ROOT, makeRun, script, readJson, rm, etl, fs, path };
