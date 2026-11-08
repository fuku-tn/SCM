<#
  Cài BIE trên máy mới bằng một dòng lệnh (PowerShell):

    Repo công khai:
      irm https://raw.githubusercontent.com/fuku-tn/BIE/main/install.ps1 | iex

    Repo riêng tư (token chỉ có quyền ĐỌC repo này):
      powershell -c "$env:KIT_TOKEN='<TOKEN>'; $h=@{Authorization=""Bearer $env:KIT_TOKEN""}; irm -Headers $h https://raw.githubusercontent.com/fuku-tn/BIE/main/install.ps1 | iex"

  Tùy chọn: $env:BIE_DIR = thư mục cài (mặc định %USERPROFILE%\BIE) · $env:BIE_REPO = owner/repo khác
  Yêu cầu: Git, Node.js 18+, Claude Code CLI (lệnh `claude`) để chạy các chặng bằng model thật.
#>
$ErrorActionPreference = 'Stop'
$repo = if ($env:BIE_REPO) { $env:BIE_REPO } else { 'fuku-tn/BIE' }
$dir  = if ($env:BIE_DIR)  { $env:BIE_DIR }  else { Join-Path $env:USERPROFILE 'BIE' }
function Say($m, $c = 'White') { Write-Host $m -ForegroundColor $c }

Say ''
Say '  BIE - Business Intelligence Engine : cai dat' Yellow
Say ''
foreach ($t in 'git', 'node', 'npm') {
  if (-not (Get-Command $t -ErrorAction SilentlyContinue)) {
    Say "  Thieu '$t'. Cai Git (https://git-scm.com) va Node.js LTS (https://nodejs.org) roi chay lai." Red
    Say '  Goi y:  winget install Git.Git   va   winget install OpenJS.NodeJS.LTS' DarkGray
    return
  }
}
$nodeMajor = [int](((node -v) -replace '^v', '').Split('.')[0])
if ($nodeMajor -lt 18) { Say "  Node.js $nodeMajor qua cu - can Node 18 tro len." Red; return }

$auth = @()
if ($env:KIT_TOKEN) { $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("x-access-token:$($env:KIT_TOKEN)")); $auth = @('-c', "http.extraheader=AUTHORIZATION: basic $b64") }

if (Test-Path (Join-Path $dir '.git')) {
  Say "[1/3] Da co BIE tai $dir - cap nhat..." Cyan
  & git -C $dir @auth pull --ff-only
} else {
  Say "[1/3] Tai ma nguon ve $dir ..." Cyan
  & git @auth clone "https://github.com/$repo.git" $dir
}
if ($LASTEXITCODE -ne 0) { Say '  Khong tai duoc ma nguon (kiem tra mang / token / ten repo).' Red; return }

# Token (nếu có) chỉ lưu vào file .bie-token (đã gitignore) để chức năng "Cập nhật" dùng lại — không ghi vào URL hay .git/config
if ($env:KIT_TOKEN) { Set-Content -LiteralPath (Join-Path $dir '.bie-token') -Value $env:KIT_TOKEN -NoNewline; Say '      (token luu o .bie-token, chi de cap nhat)' DarkGray }

Say '[2/3] Cai thu vien (npm install)...' Cyan
Push-Location $dir
try { & npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { Say '  npm install bi loi.' Red; return } } finally { Pop-Location }

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Say '  Luu y: chua thay lenh "claude" (Claude Code CLI). Cac chang chay model that can no: https://claude.com/claude-code' Yellow
}
Say '[3/3] Chay BIE...' Cyan
Say '  Mo http://localhost:6688  (dong cua so nay de tat BIE; lan sau chay:  cd "' + $dir + '"; npm start)' DarkGray
$env:PORT = '6688'
Start-Job -ScriptBlock { Start-Sleep -Seconds 3; Start-Process 'http://localhost:6688' } | Out-Null
Set-Location $dir
& node server.js
