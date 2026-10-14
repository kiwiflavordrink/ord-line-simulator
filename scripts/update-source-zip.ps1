$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$archivePath = Join-Path $projectRoot 'dist/ordr-source-v3.zip'
$files = @(
  'dist/engine_v3.mjs',
  'dist/v3.mjs',
  'dist/v3.html',
  'README.md',
  'test_conditional.mjs',
  'docs/조건형_가반_프랑키_써니호.md'
)
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Update)
try {
  foreach ($entryName in $files) {
    $existing = $archive.GetEntry($entryName)
    if ($null -ne $existing) { $existing.Delete() }
    $sourcePath = Join-Path $projectRoot ($entryName -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $sourcePath, $entryName, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}
