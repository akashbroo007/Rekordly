# Fetches the Windows external binaries Rekordly vendors into the installer:
#   - yt-dlp.exe  (latest release from the official GitHub repo)
#   - ffmpeg.exe  (essentials build, BtbN auto-build)
# Usage:  pwsh ./scripts/fetch-binaries.ps1
# The files land in apps/desktop/resources/binaries/ and are packaged via
# electron-builder extraResources — end users never need to install anything.

$ErrorActionPreference = 'Stop'

$dest = Join-Path $PSScriptRoot '..\apps\desktop\resources\binaries'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

function Fetch([string]$url, [string]$outFile) {
    $outPath = Join-Path $dest $outFile
    if (Test-Path $outPath) {
        Write-Host "= $outFile already present, skipping (delete it to re-download)"
        return
    }
    Write-Host "+ downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing
    Write-Host "  saved $(Join-Path $dest $outFile) ($([math]::Round((Get-Item $outPath).Length / 1MB, 1)) MB)"
}

# yt-dlp — official standalone Windows build
$ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
Fetch $ytDlpUrl 'yt-dlp.exe'

# ffmpeg — static essentials build (ffmpeg.exe is all Rekordly uses;
# ffprobe/ffplay are not needed but are inside the same archive)
$ffmpegUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip'
$zipPath = Join-Path $env:TEMP 'rekordly-ffmpeg.zip'
Write-Host "+ downloading $ffmpegUrl"
Invoke-WebRequest -Uri $ffmpegUrl -OutFile $zipPath -UseBasicParsing
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
