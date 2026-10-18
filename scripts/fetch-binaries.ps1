# Fetches the Windows external binaries Rekordly vendors into the installer:
#   - yt-dlp.exe  (latest release from the official GitHub repo)
#   - ffmpeg.exe  (essentials build, BtbN auto-build)
# Usage:  pwsh ./scripts/fetch-binaries.ps1
# The files land in apps/desktop/resources/binaries/ and are packaged via
# electron-builder extraResources - end users never need to install anything.
#
# NOTE: ASCII only. Windows PowerShell 5.1 reads .ps1 files in the system
# ANSI codepage when there is no BOM, so a UTF-8 em dash or smart quote in a
# comment can become a stray quote that turns the next statement into a
# parse error (exactly what killed a release run).

$ErrorActionPreference = 'Stop'

# ponytail: CI runners (and fresh agent VMs) can default to a TLS stack that
# rejects modern GitHub/CDN endpoints on Windows PowerShell 5.1 - every
# Invoke-WebRequest below then dies with "The underlying connection was
# closed". Force TLS 1.2 and a normal browser UA before any download.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$dest = Join-Path $PSScriptRoot '..\apps\desktop\resources\binaries'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

function Fetch([string]$url, [string]$outFile) {
    $outPath = Join-Path $dest $outFile
    if (Test-Path $outPath) {
        Write-Host "= $outFile already present, skipping (delete it to re-download)"
        return
    }
    Write-Host "+ downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing `
        -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RekordlyReleaseFetch' `
        -MaximumRedirection 10
    # Zero-byte result means the server redirected somewhere odd - treat as
    # failure rather than shipping an empty yt-dlp.exe into the installer.
    if ((Get-Item $outPath).Length -eq 0) { throw "Downloaded $outFile is empty - $url" }
    Write-Host "  saved $(Join-Path $dest $outFile) ($([math]::Round((Get-Item $outPath).Length / 1MB, 1)) MB)"
}

# yt-dlp - official standalone Windows build
$ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
Fetch $ytDlpUrl 'yt-dlp.exe'

# ffmpeg - static essentials build (ffmpeg.exe is all Rekordly uses;
# ffprobe/ffplay are not needed but are inside the same archive)
$ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip'
$zipPath = Join-Path $env:TEMP 'rekordly-ffmpeg.zip'
Write-Host "+ downloading $ffmpegUrl"
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath -UseBasicParsing `
    -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RekordlyReleaseFetch' `
    -MaximumRedirection 10
if ((Get-Item $zipPath).Length -eq 0) { throw 'Downloaded ffmpeg zip is empty' }
Write-Host '  extracting ffmpeg.exe...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entry = $zip.Entries | Where-Object { $_.Name -eq 'ffmpeg.exe' } | Select-Object -First 1
    if ($null -eq $entry) { throw 'ffmpeg.exe not found inside the archive' }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $dest 'ffmpeg.exe'), $true)
} finally {
    $zip.Dispose()
    Remove-Item $zipPath -Force
}
Write-Host "  saved $(Join-Path $dest 'ffmpeg.exe') ($([math]::Round((Get-Item (Join-Path $dest 'ffmpeg.exe')).Length / 1MB, 1)) MB)"

Write-Host ''
Write-Host 'Done. Binaries are vendored into apps/desktop/resources/binaries/'
