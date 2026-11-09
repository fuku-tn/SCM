'use strict';
/**
 * Tìm và gọi Claude Code CLI trên máy người dùng.
 * Lỗi thường gặp: `spawn claude ENOENT` vì
 *   - Claude Code chỉ cài dạng tiện ích VS Code/Cursor (file chạy nằm trong thư mục extension, KHÔNG có trong PATH);
 *   - cài bằng npm trên Windows → chỉ có claude.cmd (spawn không chạy được nếu không qua shell);
 *   - mở terminal trước khi cài nên PATH chưa cập nhật.
 * Thứ tự tìm: biến CLAUDE_CLI → PATH (where/which) → thư mục cài mặc định → tiện ích VS Code/Cursor/Windsurf.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const WIN = process.platform === 'win32';
const HOME = os.homedir();
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const env = (k) => process.env[k] || '';

function fromPath() {
  const r = cp.spawnSync(WIN ? 'where' : 'which', WIN ? ['claude'] : ['-a', 'claude'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
  if (r.status !== 0) return [];
  const list = String(r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter(isFile);
  // Windows: ưu tiên .exe, rồi .cmd/.bat; bỏ .ps1
  const rank = (p) => (/\.exe$/i.test(p) ? 0 : /\.(cmd|bat)$/i.test(p) ? 1 : /\.ps1$/i.test(p) ? 9 : 2);
  return list.filter((p) => rank(p) < 9).sort((a, b) => rank(a) - rank(b));
}
function knownDirs() {
  const exe = WIN ? 'claude.exe' : 'claude', out = [];
  out.push(path.join(HOME, '.local', 'bin', exe), path.join(HOME, '.claude', 'local', exe));
  if (WIN) out.push(path.join(env('APPDATA'), 'npm', 'claude.cmd'), path.join(env('LOCALAPPDATA'), 'Programs', 'claude', 'claude.exe'), path.join(env('LOCALAPPDATA'), 'AnthropicClaude', 'claude.exe'));
  else out.push('/usr/local/bin/claude', '/opt/homebrew/bin/claude', path.join(HOME, '.npm-global', 'bin', 'claude'), path.join(HOME, '.bun', 'bin', 'claude'));
  return out.filter((p) => p && isFile(p));
}
/** file chạy đi kèm tiện ích Claude Code của VS Code / Cursor / Windsurf (bản mới nhất) */
function fromExtensions() {
  const roots = ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.vscode-oss'].map((d) => path.join(HOME, d, 'extensions'));
  const found = [];
  for (const root of roots) {
    let names = []; try { names = fs.readdirSync(root); } catch { continue; }
    for (const n of names) {
      const m = n.match(/^anthropic\.claude-code-(\d+)\.(\d+)\.(\d+)/); if (!m) continue;
      const bin = path.join(root, n, 'resources', 'native-binary', WIN ? 'claude.exe' : 'claude');
      if (isFile(bin)) found.push({ bin, ver: m.slice(1).map(Number) });
    }
  }
  found.sort((a, b) => { for (let i = 0; i < 3; i++) if (a.ver[i] !== b.ver[i]) return b.ver[i] - a.ver[i]; return 0; });
  return found.map((f) => f.bin);
}

let cache = null;   // { at, cli }
/** @returns {{ path:string, source:string, shell:boolean } | null} */
function resolve(force) {
  if (!force && cache && Date.now() - cache.at < 60000 && (cache.cli || Date.now() - cache.at < 8000)) return cache.cli;
  let cli = null;
  const set = (p, source) => { if (!cli && p) cli = { path: p, source, shell: WIN && /\.(cmd|bat)$/i.test(p) }; };
  const over = env('CLAUDE_CLI'); if (over && isFile(over)) set(over, 'CLAUDE_CLI');
  if (!cli) { const p = fromPath(); if (p.length) set(p[0], 'PATH'); }
  if (!cli) { const k = knownDirs(); if (k.length) set(k[0], 'thư mục cài mặc định'); }
  if (!cli) { const e = fromExtensions(); if (e.length) set(e[0], 'tiện ích VS Code/Cursor'); }
  cache = { at: Date.now(), cli }; return cli;
}

const quoteWin = (a) => { a = String(a); if (a === '') return '""'; return /[\s"&|<>^%()]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a; };
/** spawn claude với args; trả { child, cli } hoặc ném lỗi dễ hiểu nếu không có CLI */
function spawnClaude(args, opts) {
  const cli = resolve(); if (!cli) { const e = new Error(notFoundMessage()); e.code = 'CLAUDE_MISSING'; throw e; }
  const o = { windowsHide: true, ...(opts || {}) };
  const child = cli.shell ? cp.spawn(cli.path.includes(' ') ? '"' + cli.path + '"' : cli.path, args.map(quoteWin), { ...o, shell: true }) : cp.spawn(cli.path, args, o);
  return { child, cli };
}
function notFoundMessage() {
  return 'Chưa tìm thấy Claude Code CLI (lệnh "claude") trên máy này nên BIE chưa gọi được model. ' +
    (WIN ? 'Cài: mở PowerShell và chạy  irm https://claude.ai/install.ps1 | iex  (hoặc  npm install -g @anthropic-ai/claude-code ), rồi mở terminal MỚI.' : 'Cài:  curl -fsSL https://claude.ai/install.sh | bash  (hoặc  npm install -g @anthropic-ai/claude-code ), rồi mở terminal mới.') +
    ' Sau đó chạy lệnh  claude  một lần để đăng nhập. Nếu đã cài ở chỗ khác, đặt biến CLAUDE_CLI trỏ tới file chạy rồi khởi động lại BIE.';
}
/** thêm gợi ý khi lỗi do chưa đăng nhập */
function explain(msg) {
  const s = String(msg || '');
  if (/not logged in|please run \/login|invalid api key|authenticat|credential|401|unauthor/i.test(s)) return s + '\n→ Claude Code CLI chưa đăng nhập: mở terminal, chạy lệnh  claude  rồi làm theo hướng dẫn đăng nhập, sau đó chạy lại chặng này.';
  return s;
}
let healthCache = null;
/** kiểm tra CLI chạy được không (claude --version) */
function check(force) {
  if (!force && healthCache && Date.now() - healthCache.at < 60000) return healthCache.data;
  const cli = resolve(force);
  let data;
  if (!cli) data = { found: false, message: notFoundMessage() };
  else {
    let ver = '', err = '';
    try {
      const r = cli.shell ? cp.spawnSync((cli.path.includes(' ') ? '"' + cli.path + '"' : cli.path) + ' --version', { shell: true, encoding: 'utf8', timeout: 20000, windowsHide: true }) : cp.spawnSync(cli.path, ['--version'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
      ver = String(r.stdout || '').trim().split('\n')[0]; if (r.status !== 0) err = String(r.stderr || r.error || '').slice(0, 200);
    } catch (e) { err = e.message; }
    data = ver ? { found: true, path: cli.path, source: cli.source, version: ver } : { found: false, path: cli.path, source: cli.source, message: 'Tìm thấy ' + cli.path + ' nhưng không chạy được: ' + err };
  }
  healthCache = { at: Date.now(), data }; return data;
}

module.exports = { resolve, spawnClaude, check, notFoundMessage, explain, quoteWin };
