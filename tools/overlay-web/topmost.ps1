<#
Keeps the overlay window (title "원랜디 오버레이") above other windows, Warcraft III included (windowed or borderless
fullscreen; exclusive fullscreen draws over everything). 수정내역 48. Only changes the z-order of that one window.
#>
param([string]$Title = '원랜디 오버레이', [int]$Seconds = 0)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OrdrTop {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static int Pin(string title) {
    int n = 0;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (sb.ToString().StartsWith(title)) { SetWindowPos(h, new IntPtr(-1), 0, 0, 0, 0, 0x0013); n++; }   // HWND_TOPMOST, NOMOVE|NOSIZE|NOACTIVATE
      return true;
    }, IntPtr.Zero);
    return n;
  }
}
'@
$start = Get-Date; $shown = $false
while ($true) {
  $n = [OrdrTop]::Pin($Title)
  if ($n -and -not $shown) { Write-Host "오버레이 창을 항상 위로 고정했습니다." ; $shown = $true }
  if ($Seconds -gt 0 -and ((Get-Date) - $start).TotalSeconds -ge $Seconds) { break }
  Start-Sleep -Seconds 2
}
