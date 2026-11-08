<#
  Cập nhật BIE từ GitHub. Được server mở trong một cửa sổ terminal khi người dùng bấm "Cập nhật".
  Các bước: dừng server đang chạy → git pull --ff-only → npm install (nếu cần) → chạy lại server + mở trình duyệt.
  Nếu bất kỳ bước nào lỗi: giữ nguyên phiên bản hiện tại và vẫn chạy lại server để bạn không bị mất ứng dụng.
  Token (chỉ cần với repo riêng tư): biến KIT_TOKEN hoặc file .bie-token — không bao giờ ghi vào URL hay .git/config.
#>
param(
  [int]$ServerPid = 0,
  [int]$Port = 6688,
  [string]$RepoDir = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'BIE - Update'
Set-Location -LiteralPath $RepoDir

function Say($m, $c = 'White') { Write-Host $m -ForegroundColor $c }
Say ''
Say '  BIE  -  Cap nhat phien ban moi' Yellow
Say ('  Thu muc: ' + $RepoDir) DarkGray
Say ''

$ok = $true
try {
  if ($ServerPid -gt 0) {
    Say '[1/4] Dung server dang chay...' Cyan
    Stop-Process -Id $ServerPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  } else { Say '[1/4] Khong co server can dung.' DarkGray }

  $token = $env:KIT_TOKEN
  if (-not $token -and (Test-Path -LiteralPath (Join-Path $RepoDir '.bie-token'))) { $token = (Get-Content -LiteralPath (Join-Path $RepoDir '.bie-token') -Raw).Trim() }
  $auth = @()
  if ($token) { $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("x-access-token:$token")); $auth = @('-c', "http.extraheader=AUTHORIZATION: basic $b64") }

  Say '[2/4] Kiem tra thay doi cuc bo...' Cyan
  $dirty = (git status --porcelain -uno) -join "`n"
  if ($dirty.Trim()) { throw ("Ban dang sua file trong thu muc BIE, khong the cap nhat tu dong:`n$dirty`nHay hoan tac/luu cac thay doi nay (git stash) roi cap nhat lai.") }
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  $before = (git rev-parse HEAD).Trim()
  $pkgBefore = if (Test-Path package.json) { (Get-FileHash package.json).Hash } else { '' }
  $lockBefore = if (Test-Path package-lock.json) { (Get-FileHash package-lock.json).Hash } else { '' }

  Say "[3/4] Tai ban moi tu GitHub (nhanh $branch)..." Cyan
  & git @auth fetch origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'Khong ket noi duoc GitHub (kiem tra mang / quyen truy cap repo).' }
  & git merge --ff-only "origin/$branch"
  if ($LASTEXITCODE -ne 0) { throw 'Khong the gop tu dong (lich su git khac nhau). Hay chay: git pull  va xu ly xung dot.' }
  $after = (git rev-parse HEAD).Trim()
  if ($before -eq $after) { Say '      Da la phien ban moi nhat.' Green }
  else {
    Say ('      ' + $before.Substring(0,7) + '  ->  ' + $after.Substring(0,7)) Green
    git --no-pager log --pretty='      - %s' "$before..$after" | Select-Object -First 12 | ForEach-Object { Say $_ Gray }
  }

  $pkgAfter = if (Test-Path package.json) { (Get-FileHash package.json).Hash } else { '' }
  $lockAfter = if (Test-Path package-lock.json) { (Get-FileHash package-lock.json).Hash } else { '' }
  $needInstall = (Test-Path package.json) -and (($pkgBefore -ne $pkgAfter) -or ($lockBefore -ne $lockAfter) -or -not (Test-Path node_modules))
  if ($needInstall) {
    Say '[4/4] Cai thu vien (npm install)...' Cyan
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install bi loi.' }
  } else { Say '[4/4] Thu vien khong doi - bo qua npm install.' DarkGray }
}
catch {
  $ok = $false
  Say ''
  Say ('  LOI: ' + $_.Exception.Message) Red
  Say '  Giu nguyen phien ban hien tai.' Yellow
}

Say ''
if ($ok) { Say '  Cap nhat xong.' Green }
if ($NoStart) { Say '  (NoStart) Khong chay lai server.' DarkGray; if ($ok) { exit 0 } else { exit 1 } }

Say ('  Dang chay lai BIE tai http://localhost:' + $Port + '  (dong cua so nay de tat BIE)') Cyan
$env:PORT = "$Port"
Start-Job -ScriptBlock { param($p) Start-Sleep -Seconds 3; Start-Process "http://localhost:$p" } -ArgumentList $Port | Out-Null
& node server.js
