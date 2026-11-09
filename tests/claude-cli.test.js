// Tìm / gọi Claude Code CLI: không có trong PATH, chỉ có claude.cmd, chỉ có trong tiện ích VS Code, thiếu hẳn; và gợi ý AI chạy qua CLI giả
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), http = require('http');

const ROOT = path.resolve(__dirname, '..');
const WIN = process.platform === 'win32';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bie-cli-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** chạy một đoạn JS trong tiến trình con với HOME/PATH giả (lib đọc HOME khi nạp) */
function inChild(code, env) {
  const r = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, CLAUDE_CLI: '', ...env } });
  return (r.stdout + r.stderr).trim();
}
const fakeHome = (name) => { const h = path.join(tmp, name); fs.mkdirSync(h, { recursive: true }); return { USERPROFILE: h, HOME: h, APPDATA: path.join(h, 'AppData'), LOCALAPPDATA: path.join(h, 'Local'), PATH: WIN ? process.env.SystemRoot + '\\System32' : '/usr/bin:/bin' }; };

test('Không có claude ở đâu cả → lỗi dễ hiểu kèm cách cài (không phải "spawn ENOENT")', () => {
  const env = fakeHome('empty');
  const out = inChild(`const C=require(${JSON.stringify(path.join(ROOT, 'lib/claude-cli.js'))});console.log(JSON.stringify({r:C.resolve(true),h:C.check(true)}));try{C.spawnClaude(['-p'])}catch(e){console.log(e.code+'|'+e.message)}`, env);
  const [json, err] = out.split('\n'); const j = JSON.parse(json);
  assert.strictEqual(j.r, null); assert.strictEqual(j.h.found, false);
  assert.match(err, /^CLAUDE_MISSING\|Chưa tìm thấy Claude Code CLI/); assert.match(err, /claude\.ai\/install|npm install -g/); assert.ok(!/ENOENT/.test(err));
});

test('Chỉ có trong tiện ích VS Code (không có trong PATH) → vẫn tìm ra, chọn bản mới nhất', () => {
  const env = fakeHome('vscode'); const mk = (v) => { const d = path.join(env.HOME, '.vscode', 'extensions', `anthropic.claude-code-${v}-win32-x64`, 'resources', 'native-binary'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, WIN ? 'claude.exe' : 'claude'), 'x'); return d; };
  mk('2.1.9'); const newest = mk('2.1.314');
  const j = JSON.parse(inChild(`console.log(JSON.stringify(require(${JSON.stringify(path.join(ROOT, 'lib/claude-cli.js'))}).resolve(true)))`, env));
  assert.ok(j.path.startsWith(newest), j.path); assert.match(j.source, /VS Code/);
});

test('Cài dạng claude.cmd (npm) → chạy qua shell, giữ nguyên tham số có khoảng trắng và chuỗi rỗng, nhận stdin', { skip: !WIN }, async () => {
  const d = path.join(tmp, 'fake'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'fake.js'), "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>console.log(JSON.stringify({result:JSON.stringify({argv:process.argv.slice(2),stdin:s}),usage:{input_tokens:1,output_tokens:1},modelUsage:{}})))");
  fs.writeFileSync(path.join(d, 'claude.cmd'), '@echo off\r\nnode "%~dp0fake.js" %*\r\n');
  process.env.CLAUDE_CLI = path.join(d, 'claude.cmd');
  const C = require('../lib/claude-cli.js'); const cli = C.resolve(true); assert.strictEqual(cli.shell, true);
  const { child } = C.spawnClaude(['-p', '--tools', '', '--system-prompt', 'Ban la chuyen gia BI. Lam theo huong dan.', '--model', 'sonnet']);
  let out = ''; child.stdout.on('data', (x) => (out += x)); child.stdin.end('xin chào prompt');
  await new Promise((r) => child.on('close', r));
  const res = JSON.parse(JSON.parse(out).result);
  assert.deepStrictEqual(res.argv, ['-p', '--tools', '', '--system-prompt', 'Ban la chuyen gia BI. Lam theo huong dan.', '--model', 'sonnet']); assert.strictEqual(res.stdin, 'xin chào prompt');
  delete process.env.CLAUDE_CLI;
});

test('Server: gợi ý Key Metrics/Dimension chạy qua CLI tìm thấy (không còn lỗi ENOENT) và /api/health báo đúng', { skip: !WIN, timeout: 60000 }, async () => {
  const d = path.join(tmp, 'fake2'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'fake.js'), "let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{ if(process.argv.includes('--version')) return console.log('9.9.9 (fake)'); console.log(JSON.stringify({result:'[{\"name\":\"Doanh thu\",\"reason\":\"co ban\"},{\"name\":\"Loi nhuan\",\"reason\":\"hieu qua\"}]',usage:{input_tokens:5,output_tokens:5},total_cost_usd:0,modelUsage:{}}))})");
  fs.writeFileSync(path.join(d, 'claude.cmd'), '@echo off\r\nnode "%~dp0fake.js" %*\r\n');
  const port = 6800 + Math.floor(Math.random() * 150);
  const srv = cp.spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), CLAUDE_CLI: path.join(d, 'claude.cmd'), BIE_MOCK: '', BIE_SKIP_SCHEMA: '1' }, stdio: 'ignore' });
  const get = (u, o) => new Promise((res, rej) => { const q = http.request({ host: '127.0.0.1', port, path: u, method: o ? 'POST' : 'GET', headers: o ? { 'Content-Type': 'application/json' } : {} }, (r) => { let b = ''; r.on('data', (x) => (b += x)); r.on('end', () => res({ status: r.statusCode, body: b })); }); q.on('error', rej); if (o) q.write(JSON.stringify(o)); q.end(); });
  let runId;
  try {
    for (let i = 0; i < 40; i++) { try { await get('/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    const h = JSON.parse((await get('/api/health')).body); assert.strictEqual(h.claude.found, true); assert.match(h.claude.version, /fake/);
    runId = JSON.parse((await get('/api/runs', {})).body).runId;
    const r = await get(`/api/runs/${runId}/suggest`, { kind: 'metrics', model: 'haiku', form: { audience: { level: 'Manager' }, requirement: 'x', context: 'y' } });
    assert.strictEqual(r.status, 200, r.body); assert.deepStrictEqual(JSON.parse(r.body).items.map((i) => i.name), ['Doanh thu', 'Loi nhuan']);
  } finally { srv.kill(); if (runId) fs.rmSync(path.join(ROOT, 'output', runId), { recursive: true, force: true }); }
});
