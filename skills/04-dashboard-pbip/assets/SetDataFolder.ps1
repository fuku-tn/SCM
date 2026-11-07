# SetDataFolder.ps1
# Dat lai tham so DataFolder cua project Power BI (PBIP) ve thu muc "data" nam canh file nay.
# Chay MOT LAN sau khi giai nen / chuyen project sang may khac (hoac sang thu muc khac), truoc khi mo file .pbip.
#
#   powershell -ExecutionPolicy Bypass -File .\SetDataFolder.ps1
#
# Sau do mo file .pbip, bam Refresh (Lam moi) mot lan de nap du lieu.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$data = Join-Path $root 'data'
if (-not (Test-Path $data)) { Write-Error "Khong tim thay thu muc data canh file nay: $data"; exit 1 }

$file = Get-ChildItem -Path $root -Recurse -Filter 'expressions.tmdl' | Select-Object -First 1
if (-not $file) { Write-Error 'Khong tim thay expressions.tmdl trong project'; exit 1 }

$text = [System.IO.File]::ReadAllText($file.FullName)
$escaped = $data.Replace('"', '""')
$new = [regex]::Replace($text, '(?m)^(expression DataFolder = ")[^"]*(")', { param($m) $m.Groups[1].Value + $escaped + $m.Groups[2].Value })
if ($new -eq $text) { Write-Host "DataFolder da dung san: $data" } else {
  [System.IO.File]::WriteAllText($file.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Da dat DataFolder = $data"
}
