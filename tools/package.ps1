# Builds dist/site-lock-<version>.zip for upload to Microsoft Edge Add-ons.
# Run: powershell -ExecutionPolicy Bypass -File tools/package.ps1
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json).version

$files = @('manifest.json', 'background.js', 'shared.js', 'lock.html', 'lock.js',
           'popup.html', 'popup.js', 'style.css') +
         (Get-ChildItem "$root\icons" -File | ForEach-Object { "icons/$($_.Name)" })

$out = "$root\dist\site-lock-$version.zip"
New-Item -ItemType Directory -Force "$root\dist" | Out-Null
if (Test-Path $out) { Remove-Item $out }

# ZipFile with explicit entry names keeps forward slashes; Compress-Archive in
# Windows PowerShell 5.1 writes backslashes, which store validators can reject.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
  foreach ($f in $files) {
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $root $f), $f)
  }
} finally {
  $zip.Dispose()
}
"Created $out"
