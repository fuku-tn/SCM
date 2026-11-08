'use strict';
/**
 * Tự cập nhật BIE từ GitHub (cho người đã clone repo):
 *   - status(): so sánh commit hiện tại với origin/<nhánh> (git fetch) → có phiên bản mới không, kèm danh sách thay đổi
 *   - launch(): mở một cửa sổ terminal trên máy người dùng chạy update.ps1 (dừng server → git pull → npm install → chạy lại)
 * Repo công khai: không cần token. Repo riêng tư: đặt token (quyền đọc) vào biến KIT_TOKEN hoặc file .bie-token (đã gitignore).
 * Token KHÔNG được ghi vào .git/config hay URL; chỉ truyền qua `git -c http.extraheader` cho lệnh đó.
 */
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

function readToken(root) {
  if (process.env.KIT_TOKEN) return process.env.KIT_TOKEN.trim();
  try { return fs.readFileSync(path.join(root, '.bie-token'), 'utf8').trim() || ''; } catch { return ''; }
}
const authArgs = (token) => (token ? ['-c', 'http.extraheader=AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + token).toString('base64')] : []);

function git(args, cwd, token, timeout = 30000) {
  return new Promise((resolve) => {
    execFile('git', [...authArgs(token), ...args], { cwd, timeout, windowsHide: true, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() }));
  });
}
const scrub = (s, token) => (token ? String(s).split(token).join('***') : String(s));

/** @returns {Promise<{supported:boolean, reason?:string, error?:string, repo?:string, branch?:string, current?:object, behind?:number, ahead?:number, dirty?:string[], commits?:object[], checkedAt:number}>} */
async function status(root, opts = {}) {
  const token = opts.token || '';
  const out = { supported: false, checkedAt: Date.now() };
  const top = await git(['rev-parse', '--show-toplevel'], root);
  if (!top.ok || path.resolve(top.out) !== path.resolve(root)) { out.reason = 'Thư mục này không phải bản clone git của BIE (có thể tải dạng .zip) — không thể tự cập nhật.'; return out; }
  const remote = await git(['remote', 'get-url', 'origin'], root); if (!remote.ok) { out.reason = 'Chưa cấu hình remote "origin".'; return out; }
  out.supported = true; out.repo = remote.out.replace(/\/\/[^@/]+@/, '//');
  const br = await git(['rev-parse', '--abbrev-ref', 'HEAD'], root); out.branch = br.out || 'main';
  if (out.branch === 'HEAD') { out.supported = false; out.reason = 'Đang ở trạng thái detached HEAD — hãy checkout nhánh main.'; return out; }
  const cur = await git(['log', '-1', '--pretty=%H|%h|%cI|%s'], root); const [full, short, date, ...subj] = (cur.out || '').split('|');
  out.current = { hash: full, short, date, subject: subj.join('|') };
  if (opts.fetch !== false) {
    const f = await git(['fetch', 'origin', out.branch, '--quiet'], root, token, opts.timeout || 30000);
    if (!f.ok) { out.error = 'Không kết nối được GitHub để kiểm tra phiên bản mới: ' + scrub(f.err, token).split('\n').slice(-1)[0]; return out; }
  }
  const ref = 'origin/' + out.branch;
  const cnt = await git(['rev-list', '--left-right', '--count', `HEAD...${ref}`], root);
  if (!cnt.ok) { out.error = 'Không so sánh được với ' + ref; return out; }
  const [ahead, behind] = cnt.out.split(/\s+/).map(Number); out.ahead = ahead || 0; out.behind = behind || 0;
  const dirty = await git(['status', '--porcelain', '-uno'], root); out.dirty = dirty.out ? dirty.out.split('\n').map((l) => l.trim()).slice(0, 10) : [];
  if (out.behind) {
    const lg = await git(['log', `HEAD..${ref}`, '--pretty=%h|%cI|%an|%s', '-n', '15'], root);
    out.commits = lg.out.split('\n').filter(Boolean).map((l) => { const [hash, date, author, ...s] = l.split('|'); return { hash, date, author, subject: s.join('|') }; });
    const tip = await git(['log', '-1', '--pretty=%h', ref], root); out.latest = tip.out;
  } else out.commits = [];
  return out;
}

/** Mở terminal chạy update.ps1. Chỉ hỗ trợ Windows (PowerShell). dryRun: chỉ trả về lệnh, không mở. */
function launch(root, { port, serverPid, dryRun } = {}) {
  const script = path.join(root, 'update.ps1');
  if (!fs.existsSync(script)) return { ok: false, error: 'Thiếu file update.ps1 trong thư mục BIE.' };
  const manual = `cd "${root}" && git pull --ff-only && npm install && npm start`;
  if (process.platform !== 'win32') return { ok: false, manual, error: 'Tự mở terminal hiện chỉ hỗ trợ Windows. Hãy chạy tay lệnh bên dưới.' };
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', '"' + script + '"', '-ServerPid', String(serverPid || 0), '-Port', String(port || 6688), '-RepoDir', '"' + root + '"'];
  const ps = 'Start-Process powershell -WorkingDirectory ' + q(root) + ' -ArgumentList ' + args.map(q).join(',');
  if (dryRun) return { ok: true, dryRun: true, command: ps };
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return { ok: true };
  } catch (e) { return { ok: false, manual, error: 'Không mở được terminal: ' + e.message }; }
}

module.exports = { status, launch, readToken, authArgs };
