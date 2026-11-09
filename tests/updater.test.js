// Tự cập nhật từ GitHub: phát hiện bản mới, repo bẩn, không phải git, mở terminal (dry-run), update.ps1 thật trên repo giả
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const U = require('../lib/updater.js');

const ROOT = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bie-upd-'));
const G = (cwd, ...a) => { const r = cp.spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(a.join(' ') + ': ' + r.stderr); return (r.stdout || '').trim(); };
let origin, dev, user;
before(() => {
  origin = path.join(tmp, 'origin.git'); dev = path.join(tmp, 'dev'); user = path.join(tmp, 'user dir (test)');   // có khoảng trắng + ngoặc như thư mục thật
  G(tmp, 'init', '--bare', '-b', 'main', origin);
  G(tmp, 'clone', origin, dev); fs.writeFileSync(path.join(dev, 'a.txt'), '1'); G(dev, 'add', '.'); G(dev, 'commit', '-m', 'first'); G(dev, 'push', 'origin', 'HEAD:main');
  G(tmp, 'clone', origin, user);
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const push = (msg) => { fs.writeFileSync(path.join(dev, 'a.txt'), String(Math.random())); G(dev, 'add', '.'); G(dev, 'commit', '-m', msg); G(dev, 'push', 'origin', 'HEAD:main'); };

test('status: cập nhật rồi (behind 0) → không báo', async () => {
  const s = await U.status(user); assert.strictEqual(s.supported, true); assert.strictEqual(s.behind, 0); assert.strictEqual(s.ahead, 0); assert.deepStrictEqual(s.commits, []);
});
test('status: có commit mới trên GitHub → behind + danh sách thay đổi', async () => {
  push('Thêm tính năng A'); push('Sửa lỗi B');
  const s = await U.status(user); assert.strictEqual(s.behind, 2); assert.deepStrictEqual(s.commits.map((c) => c.subject), ['Sửa lỗi B', 'Thêm tính năng A']); assert.ok(s.latest);
});
test('status: sửa file đã theo dõi → báo "dirty"; thư mục không phải git → không hỗ trợ', async () => {
  fs.writeFileSync(path.join(user, 'a.txt'), 'local edit'); let s = await U.status(user, { fetch: false }); assert.ok(s.dirty.length, 'dirty'); G(user, 'checkout', '--', 'a.txt');
  const plain = fs.mkdtempSync(path.join(tmp, 'plain-')); s = await U.status(plain); assert.strictEqual(s.supported, false); assert.match(s.reason, /clone git|zip/i);
});
test('status: máy tác giả đi trước (ahead) không bị báo là có bản mới', async () => {
  const s = await U.status(dev); assert.strictEqual(s.behind, 0);
});
test('token: chỉ truyền qua http.extraheader, không lộ trong lỗi / URL', async () => {
  assert.deepStrictEqual(U.authArgs(''), []); const a = U.authArgs('SECRET123'); assert.strictEqual(a[0], '-c'); assert.match(a[1], /^http\.extraheader=AUTHORIZATION: basic /); assert.ok(!a[1].includes('SECRET123'), 'đã mã hóa base64, không để lộ nguyên văn');
  const bad = path.join(tmp, 'bad'); G(tmp, 'clone', origin, bad); G(bad, 'remote', 'set-url', 'origin', 'https://127.0.0.1:1/x.git');
  const s = await U.status(bad, { token: 'SECRET123', timeout: 8000 }); assert.ok(s.error, 'lỗi kết nối'); assert.ok(!JSON.stringify(s).includes('SECRET123'));
});
test('launch (dry-run): lệnh mở terminal đúng tham số, xử lý đường dẫn có khoảng trắng', () => {
  const r = U.launch(ROOT, { port: 6688, serverPid: 4242, dryRun: true });
  if (process.platform === 'win32') { assert.ok(r.ok && r.dryRun); assert.match(r.command, /^powershell\.exe -NoExit/); assert.match(r.command, /-ServerPid 4242/); assert.ok(r.command.includes('update.ps1')); assert.ok(r.command.includes('-RepoDir ' + ROOT)); }
  else assert.ok(!r.ok && r.manual);
});
test('update.ps1: kéo bản mới về repo thật (đường dẫn có khoảng trắng), giữ nguyên khi repo bẩn', { skip: process.platform !== 'win32' }, () => {
  const run = () => cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'update.ps1'), '-RepoDir', user, '-NoStart'], { encoding: 'utf8', timeout: 120000 });
  // bẩn → dừng, không đổi HEAD
  fs.writeFileSync(path.join(user, 'a.txt'), 'dirty'); const head0 = G(user, 'rev-parse', 'HEAD');
  let r = run(); assert.notStrictEqual(r.status, 0); assert.match(r.stdout, /Giu nguyen phien ban hien tai/); assert.strictEqual(G(user, 'rev-parse', 'HEAD'), head0); G(user, 'checkout', '--', 'a.txt');
  // sạch → cập nhật
  r = run(); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.strictEqual(G(user, 'rev-parse', 'HEAD'), G(dev, 'rev-parse', 'HEAD'));
  assert.match(r.stdout, /Sua loi B|Them tinh nang A|->/);
  const s = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(ROOT, 'lib/updater.js'))}).status(${JSON.stringify(user)}).then(s=>console.log(s.behind))`], { encoding: 'utf8' }); assert.strictEqual(s.stdout.trim(), '0');
});

test('update.ps1: MEMORY.md (app tự ghi) bị sửa cục bộ KHÔNG chặn cập nhật và được giữ nguyên', { skip: process.platform !== 'win32' }, () => {
  const run = () => cp.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'update.ps1'), '-RepoDir', user, '-NoStart'], { encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(dev, 'MEMORY.md'), 'log tac gia v1\n'); G(dev, 'add', '.'); G(dev, 'commit', '-m', 'memory v1'); G(dev, 'push', 'origin', 'HEAD:main');
  let r = run(); assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  fs.writeFileSync(path.join(user, 'MEMORY.md'), 'log tac gia v1\nlog nguoi dung tu ghi\n');   // app của người dùng ghi thêm sau một lần chạy
  fs.writeFileSync(path.join(dev, 'MEMORY.md'), 'log tac gia v2\n'); G(dev, 'add', '.'); G(dev, 'commit', '-m', 'memory v2'); push('them tinh nang C');
  const s = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(ROOT, 'lib/updater.js'))}).status(${JSON.stringify(user)}).then(s=>console.log(JSON.stringify(s.dirty)))`], { encoding: 'utf8' });
  assert.strictEqual(s.stdout.trim(), '[]', 'MEMORY.md không bị tính là dirty');
  r = run(); assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(G(user, 'rev-parse', 'HEAD'), G(dev, 'rev-parse', 'HEAD'), 'đã cập nhật');
  assert.match(fs.readFileSync(path.join(user, 'MEMORY.md'), 'utf8'), /nguoi dung tu ghi/, 'nhật ký của người dùng được giữ');
});
