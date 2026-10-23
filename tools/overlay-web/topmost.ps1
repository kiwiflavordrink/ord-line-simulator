<#
Overlay window helper (수정내역 48, 65). For the window titled "원랜디 오버레이":
 - keeps it above other windows (HWND_TOPMOST), Warcraft III included (windowed or borderless fullscreen);
 - makes it non-activating (WS_EX_NOACTIVATE) so clicking it does not take focus from the game; if it still becomes
   the foreground window, focus goes back to Warcraft III;
 - global hotkey (default F1) hides / shows it;
 - folds it to the header bar when the page asks (overlay "접기" button → %TEMP%\ordr_overlay_ui.txt).
Only this one window is touched. -Hotkey none disables the hotkey.
수정내역 67: Chromium still activates its window on a click, which minimizes a fullscreen Warcraft III. So the overlay
starts click-through (WS_EX_LAYERED|WS_EX_TRANSPARENT: clicks go to the game) and is driven by hotkeys:
  F1 hide/show, F2 next tab, F3 click mode (through ↔ clickable; clickable = the old behaviour).
Tab changes reach the page through %TEMP%\ordr_overlay_cmd.txt (served at /ui by serve.ps1).
#>
param([string]$Title = '원랜디 오버레이', [string]$Hotkey = 'F1', [string]$TabKey = 'F2', [string]$ClickKey = 'F3', [int]$Seconds = 0)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OrdrTop {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x, y; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetLong(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetLong(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG m, IntPtr h, uint a, uint b, uint remove);
  public static IntPtr Find(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => { var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (IsWindowVisible(h) && sb.ToString().StartsWith(title)) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindGame() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => { var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
      if (IsWindowVisible(h) && sb.ToString().StartsWith("Warcraft III")) { found = h; return false; } return true; }, IntPtr.Zero);
    return found;
  }
  public static void NoActivate(IntPtr h) {
    long ex = GetLong(h, -20).ToInt64();
    long want = ex | 0x08000000L | 0x00000008L;   // WS_EX_NOACTIVATE | WS_EX_TOPMOST
    if (want != ex) SetLong(h, -20, new IntPtr(want));
  }
  [DllImport("user32.dll")] public static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
  // Returns the ids of hotkeys pressed since the last call (bit 1 << id).
  public static int Hotkeys() { MSG m; int bits = 0; while (PeekMessage(out m, IntPtr.Zero, 0x0312, 0x0312, 1)) bits |= 1 << (int)m.wParam; return bits; }
  public static void ClickThrough(IntPtr h, bool on) {
    long ex = GetLong(h, -20).ToInt64() | 0x00080000L;   // WS_EX_LAYERED
    ex = on ? (ex | 0x00000020L) : (ex & ~0x00000020L);    // WS_EX_TRANSPARENT
    SetLong(h, -20, new IntPtr(ex)); SetLayeredWindowAttributes(h, 0, 255, 2);   // LWA_ALPHA, fully opaque
  }
}
'@
$keys = @{ F1=0x70; F2=0x71; F3=0x72; F4=0x73; F5=0x74; F6=0x75; F7=0x76; F8=0x77; F9=0x78; F10=0x79; F11=0x7A; F12=0x7B; Pause=0x13; ScrollLock=0x91; Insert=0x2D; Home=0x24; End=0x23 }
$ui = Join-Path $env:TEMP 'ordr_overlay_ui.txt'
$cmd = Join-Path $env:TEMP 'ordr_overlay_cmd.txt'
$n = 0
foreach ($k in @(@(1, $Hotkey, '오버레이 숨기기/보이기'), @(2, $TabKey, '다음 탭'), @(3, $ClickKey, '클릭 모드(통과 ↔ 클릭 가능)'))) {
  if ($k[1] -ne 'none' -and $keys.ContainsKey($k[1])) {
    if ([OrdrTop]::RegisterHotKey([IntPtr]::Zero, $k[0], 0x4000, $keys[$k[1]])) { Write-Host "$($k[1]) : $($k[2])" }   # MOD_NOREPEAT
    else { Write-Host "$($k[1]) 단축키를 등록하지 못했습니다(다른 프로그램이 사용 중)." }
  }
}
$through = $true; $applied = $null
$start = Get-Date; $h = [IntPtr]::Zero; $hidden = $false; $folded = $false; $fullH = 0; $shown = $false; $game = [IntPtr]::Zero
while ($true) {
  if ($h -eq [IntPtr]::Zero -or -not [OrdrTop]::IsWindow($h)) { $h = [OrdrTop]::Find($Title); $hidden = $false; $folded = $false; $applied = $null }
  if ($h -ne [IntPtr]::Zero) {
    [OrdrTop]::NoActivate($h)
    if (-not $hidden) { [void][OrdrTop]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x0013) }   # HWND_TOPMOST, NOMOVE|NOSIZE|NOACTIVATE
    if (-not $shown) { Write-Host '오버레이 창을 항상 위, 클릭해도 게임 포커스 유지로 설정했습니다.'; $shown = $true }
    $hk = [OrdrTop]::Hotkeys()
    if ($hk -band 2) {
      $hidden = -not $hidden
      if ($hidden) { [void][OrdrTop]::ShowWindow($h, 0) } else { [void][OrdrTop]::ShowWindow($h, 4) }   # SW_HIDE / SW_SHOWNOACTIVATE
    }
    if ($hk -band 4) { $n++; Set-Content -Path $cmd -Value "tab $n" -Encoding ascii }
    if ($hk -band 8) { $through = -not $through; $n++; Set-Content -Path $cmd -Value "mode $n $(if ($through) {'through'} else {'click'})" -Encoding ascii }
    if ($applied -ne $through -or $applied -eq $null) { [OrdrTop]::ClickThrough($h, $through); $applied = $through }
    $want = (Test-Path $ui) -and ((Get-Content $ui -Raw -ErrorAction SilentlyContinue) -match 'fold')
    if ($want -ne $folded) {
      $r = New-Object OrdrTop+RECT; [void][OrdrTop]::GetWindowRect($h, [ref]$r)
      if ($want) { $fullH = $r.B - $r.T; [void][OrdrTop]::SetWindowPos($h, [IntPtr](-1), 0, 0, $r.R - $r.L, 72, 0x0012) }   # NOMOVE|NOACTIVATE
      elseif ($fullH -gt 0) { [void][OrdrTop]::SetWindowPos($h, [IntPtr](-1), 0, 0, $r.R - $r.L, $fullH, 0x0012) }
      $folded = $want
    }
    # A click that still activates the overlay (click mode): hand focus back to the game.
    if (-not $through -and [OrdrTop]::GetForegroundWindow() -eq $h) {
      if ($game -eq [IntPtr]::Zero -or -not [OrdrTop]::IsWindow($game)) { $game = [OrdrTop]::FindGame() }
      if ($game -ne [IntPtr]::Zero) { [void][OrdrTop]::SetForegroundWindow($game) }
    }
  }
  if ($Seconds -gt 0 -and ((Get-Date) - $start).TotalSeconds -ge $Seconds) { break }
  Start-Sleep -Milliseconds 150
}
