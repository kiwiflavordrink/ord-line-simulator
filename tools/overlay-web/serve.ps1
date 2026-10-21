<#
ORDR overlay without installing anything (수정내역 47). Serves the overlay page and the engine files from this package
on http://localhost:<Port>/ only, and the live hand written by memscan.ps1 -Watch at /hand. Read-only: it only reads
files under -Root and the live hand file.
#>
param(
  [int]$Port = 8765,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Live = (Join-Path $env:TEMP 'ordr_hand_live.json')
)
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\','/')
$types = @{ '.html'='text/html; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Host "포트 $Port 를 열지 못했습니다. 이미 실행 중인지 확인하세요. $_"; Read-Host '엔터를 누르면 닫힙니다'; exit 1 }
Write-Host "오버레이 서버: http://localhost:$Port/overlay/renderer/index.html  (이 창을 닫으면 오버레이가 멈춥니다)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext(); $res = $ctx.Response
  try {
    $res.Headers.Add('Cache-Control','no-store')
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/hand') {
      $body = if (Test-Path $Live) { [IO.File]::ReadAllBytes($Live) } else { [Text.Encoding]::UTF8.GetBytes('{"Status":"패 읽기 대기","Units":[]}') }
      $res.ContentType = 'application/json; charset=utf-8'
    } else {
      if ($path -eq '/') { $path = '/overlay/renderer/index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar)))
      if (-not $file.StartsWith($Root + [IO.Path]::DirectorySeparatorChar) -or -not (Test-Path $file -PathType Leaf)) {
        $res.StatusCode = 404; $body = [Text.Encoding]::UTF8.GetBytes('not found')
      } else {
        $body = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
      }
    }
    $res.ContentLength64 = $body.Length
    $res.OutputStream.Write($body, 0, $body.Length)
  } catch { } finally { $res.Close() }
}
