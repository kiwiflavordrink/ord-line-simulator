<#
ORDR memory scan (read-only diagnostic, 수정내역 42).
Finds where the given unit type codes (map rawcodes such as h006) appear in Warcraft III's memory and saves the
surrounding bytes, so the unit-object layout can be worked out offline. The process is opened with
PROCESS_QUERY_INFORMATION | PROCESS_VM_READ only; nothing is written to the game.

Usage (PowerShell, while a game is running):
  powershell -ExecutionPolicy Bypass -File memscan.ps1 -Codes h006,h00A,h02U
Output: ordr_memscan.json on the Desktop (or -Out <path>).
#>
param(
  [string[]]$Codes = @('h006','h00A','h02U'),
  [int]$Context = 96,
  [int]$MaxHits = 3000,
  [string]$Process = 'Warcraft III',
  [string]$Note = '',
  [switch]$Hand,
  [int]$Player = 0,
  [switch]$Watch,
  [double]$Interval = 0.3,
  [int]$Rescan = 90,
  [string]$Out = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ordr_memscan.json')
)

$src = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class OrdrMemScan {
  [StructLayout(LayoutKind.Sequential)]
  public struct MBI64 {
    public ulong BaseAddress; public ulong AllocationBase; public uint AllocationProtect; public uint _a1;
    public ulong RegionSize; public uint State; public uint Protect; public uint Type; public uint _a2;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr VirtualQueryEx(IntPtr h, IntPtr addr, out MBI64 info, IntPtr len);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);

  const uint QUERY = 0x0400, VM_READ = 0x0010, MEM_COMMIT = 0x1000;

  static string Hex(byte[] b, int start, int len) {
    var sb = new StringBuilder(len * 2);
    for (int i = start; i < start + len; i++) sb.Append(b[i].ToString("x2"));
    return sb.ToString();
  }

  // codes: 4-character rawcodes. WC3 stores a type id as a 32-bit int of the four chars (big-endian value),
  // which sits in memory little-endian: 'h006' = 0x68303036 -> bytes 36 30 30 68.
  public static string Scan(int pid, string[] codes, int context, int maxHits) {
    IntPtr h = OpenProcess(QUERY | VM_READ, false, pid);
    if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess failed " + Marshal.GetLastWin32Error() + "\"}";
    var pats = new List<byte[]>();
    foreach (var c in codes) { var b = Encoding.ASCII.GetBytes(c); pats.Add(new byte[] { b[3], b[2], b[1], b[0] }); }
    var hits = new List<string>[codes.Length]; var counts = new int[codes.Length];
    for (int i = 0; i < codes.Length; i++) hits[i] = new List<string>();
    var regions = new StringBuilder(); int regionCount = 0; long scanned = 0;
    ulong addr = 0; const int CHUNK = 16 * 1024 * 1024;
    while (addr < 0x7FFFFFFFFFFF) {
      MBI64 m;
      if (VirtualQueryEx(h, (IntPtr)(long)addr, out m, (IntPtr)Marshal.SizeOf(typeof(MBI64))) == IntPtr.Zero) break;
      ulong next = m.BaseAddress + m.RegionSize; if (next <= addr) break;
      bool readable = m.State == MEM_COMMIT && (m.Protect & 0x100) == 0 && (m.Protect & 0x01) == 0 &&
                      (m.Protect & (0x02 | 0x04 | 0x08 | 0x20 | 0x40 | 0x80)) != 0;
      bool writable = (m.Protect & (0x04 | 0x08 | 0x40 | 0x80)) != 0;
      if (readable && writable) {
        regionCount++;
        for (ulong off = 0; off < m.RegionSize; off += (ulong)CHUNK) {
          int len = (int)Math.Min((ulong)CHUNK + 4, m.RegionSize - off);
          var buf = new byte[len]; IntPtr read;
          if (!ReadProcessMemory(h, (IntPtr)(long)(m.BaseAddress + off), buf, (IntPtr)len, out read)) continue;
          int n = (int)read; scanned += n;
          for (int i = 0; i + 4 <= n; i += 4) {          // type ids are 4-byte aligned in unit objects
            for (int p = 0; p < pats.Count; p++) {
              var q = pats[p];
              if (buf[i] != q[0] || buf[i+1] != q[1] || buf[i+2] != q[2] || buf[i+3] != q[3]) continue;
              counts[p]++;
              if (hits[p].Count >= maxHits) continue;
              int s = Math.Max(0, i - context), e = Math.Min(n, i + 4 + context);
              hits[p].Add("{\"addr\":\"0x" + (m.BaseAddress + off + (ulong)i).ToString("x") + "\",\"region\":\"0x" +
                m.BaseAddress.ToString("x") + "\",\"protect\":\"0x" + m.Protect.ToString("x") + "\",\"type\":\"0x" +
                m.Type.ToString("x") + "\",\"before\":" + (i - s) + ",\"bytes\":\"" + Hex(buf, s, e - s) + "\"}");
            }
          }
        }
      }
      addr = next;
    }
    CloseHandle(h);
    var sb = new StringBuilder();
    sb.Append("{\"regions\":" + regionCount + ",\"bytesScanned\":" + scanned + ",\"codes\":{");
    for (int p = 0; p < codes.Length; p++) {
      if (p > 0) sb.Append(",");
      sb.Append("\"" + codes[p] + "\":{\"count\":" + counts[p] + ",\"hits\":[" + string.Join(",", hits[p].ToArray()) + "]}");
    }
    sb.Append("}}");
    return sb.ToString();
  }
  // Hand mode (수정내역 42): a unit record holds the type id followed directly by its colored name string
  // ("|cff20b2aa나미|r - |cff00ff00흔함|r"). Fields found with two scans around a combine (나미+상디 -> 로빈):
  //   -24 int owner player (0 = 플레이어 1, 7 = 선택창 표시용, 5/6 = 적, 27 = 중립); -88 two ints = (-1,-1) and
  //   -48 int = 0x11 once removed; -56 int 0x64e live, 0x445/0x645 removed.
  // Reads unit records in one region. Owned = owner == player, not removed (-48 != 0x11, -88 != -1).
  static void HandRegion(IntPtr h, MBI64 m, int player, bool full, List<string> rows, Dictionary<string, int> counts,
                         Dictionary<string, string> names, HashSet<ulong> mine, ref long scanned) {
    const int CHUNK = 16 * 1024 * 1024, PAD = 128;
    for (ulong off = 0; off < m.RegionSize; off += (ulong)CHUNK) {
      ulong start = off >= PAD ? off - PAD : 0;
      int len = (int)Math.Min((ulong)CHUNK + 2 * PAD, m.RegionSize - start);
      var buf = new byte[len]; IntPtr read;
      if (!ReadProcessMemory(h, (IntPtr)(long)(m.BaseAddress + start), buf, (IntPtr)len, out read)) continue;
      int n = (int)read; scanned += n;
      int from = (int)(off - start);
      for (int i = from; i + 14 <= n && i < from + CHUNK; i += 8) {
        if (buf[i+4] != 0x7c || buf[i+5] != 0x63) continue;  // "|c" + 8 hex color (a locked unit uses alpha 00)
        bool ok = i >= 96;
        for (int k = 6; k < 14 && ok; k++) { byte c = buf[i+k]; ok = (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46); }
        for (int k = 0; k < 4 && ok; k++) { byte c = buf[i+k]; ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a); }
        if (!ok || BitConverter.ToInt64(buf, i - 72) != 1) continue;   // real unit records have 1 here; text matches do not
        int owner = BitConverter.ToInt32(buf, i - 24), st = BitConverter.ToInt32(buf, i - 48), a = BitConverter.ToInt32(buf, i - 88);
        string code = new string(new char[] { (char)buf[i+3], (char)buf[i+2], (char)buf[i+1], (char)buf[i] });
        bool owned = owner == player && st != 0x11 && a != -1;
        if (owner == player) mine.Add(m.BaseAddress);
        if (!owned && !full) continue;
        int e = i + 4; while (e < n && buf[e] != 0 && e < i + 200) e++;
        var nc = Encoding.UTF8.GetString(buf, i + 4, e - i - 4).ToCharArray();
        for (int k = 0; k < nc.Length; k++) if (nc[k] < (char)0x20) nc[k] = ' ';
        string name = new string(nc).Replace("\\", "\\\\").Replace("\"", "\\\"");
        if (owned) { int c0; counts.TryGetValue(code, out c0); counts[code] = c0 + 1; names[code] = name; }
        if (full) rows.Add("{\"code\":\"" + code + "\",\"addr\":\"0x" + (m.BaseAddress + start + (ulong)i).ToString("x") +
          "\",\"owner\":" + owner + ",\"state\":" + st + ",\"f56\":" + BitConverter.ToInt32(buf, i - 56) +
          ",\"a\":" + a + ",\"b\":" + BitConverter.ToInt32(buf, i - 84) +
          ",\"name\":\"" + name + "\",\"before\":\"" + Hex(buf, i - 96, 96) + "\"}");
      }
    }
  }

  // bases: "" = walk all memory; else comma-separated region bases from an earlier call (fast re-read).
  // full: also return every record with its raw bytes (diagnostics). Hand entries use the helper's reversed rawcode.
  public static string Hand(int pid, int player, string bases, bool full) {
    IntPtr h = OpenProcess(QUERY | VM_READ, false, pid);
    if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess failed " + Marshal.GetLastWin32Error() + "\"}";
    var rows = new List<string>(); var counts = new Dictionary<string, int>(); var names = new Dictionary<string, string>();
    var mine = new HashSet<ulong>(); long scanned = 0; int size = Marshal.SizeOf(typeof(MBI64));
    var list = new List<ulong>();
    if (!string.IsNullOrEmpty(bases)) foreach (var t in bases.Split(',')) if (t.Length > 0) list.Add(Convert.ToUInt64(t.Replace("0x", ""), 16));
    ulong addr = 0;
    for (int idx = 0; ; idx++) {
      MBI64 m;
      if (list.Count > 0) { if (idx >= list.Count) break; addr = list[idx]; }
      else if (addr >= 0x7FFFFFFFFFFF) break;
      if (VirtualQueryEx(h, (IntPtr)(long)addr, out m, (IntPtr)size) == IntPtr.Zero) { if (list.Count > 0) continue; break; }
      ulong next = m.BaseAddress + m.RegionSize;
      bool rw = m.State == MEM_COMMIT && (m.Protect & 0x101) == 0 && (m.Protect & (0x04 | 0x08 | 0x40 | 0x80)) != 0;
      if (rw) HandRegion(h, m, player, full, rows, counts, names, mine, ref scanned);
      if (list.Count == 0) { if (next <= addr) break; addr = next; }
    }
    CloseHandle(h);
    var hand = new List<string>();
    foreach (var kv in counts) {
      var r = kv.Key.ToCharArray(); Array.Reverse(r);
      hand.Add("{\"Rawcode\":\"" + new string(r) + "\",\"Code\":\"" + kv.Key + "\",\"Count\":" + kv.Value + ",\"Owner\":" + player +
               ",\"Name\":\"" + names[kv.Key] + "\"}");
    }
    var reg = new List<string>(); foreach (var b in mine) reg.Add("\"0x" + b.ToString("x") + "\"");
    return "{\"bytesScanned\":" + scanned + ",\"regions\":[" + string.Join(",", reg.ToArray()) + "],\"hand\":[" +
      string.Join(",", hand.ToArray()) + "],\"units\":[" + string.Join(",", rows.ToArray()) + "]}";
  }
}
'@
# With -File, 'h006,h00A' arrives as one string: split it.
$Codes = @($Codes | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_.Length -eq 4 })
Add-Type -TypeDefinition $src -Language CSharp

function Find-Game { Get-Process | Where-Object { $_.ProcessName -like "$Process*" } | Select-Object -First 1 }
function Strip($n) { $n -replace '\|c[0-9a-fA-F]{8}','' -replace '\|r','' }

if ($Watch) {
  # Live hand for the overlay: full scan, then re-read only the regions holding this player's records every
  # $Interval seconds; full scan again every $Rescan seconds (new units may land in a new region) or when the game
  # restarts. Writes {Source,Time,Status,Units:[{Rawcode,Code,Count,Owner,Name}]} to $Out (temp file + rename).
  # 수정내역 79: re-read every 0.3 s (was 3 s); the file is rewritten only when the hand changes (plus a 5 s heartbeat),
  # and the status carries the read time so slow PCs show up.
  $tmp = "$Out.tmp"; $bases = ''; $lastFull = [DateTime]::MinValue; $pid0 = 0; $lastUnits = $null; $lastPut = [DateTime]::MinValue
  function Put($status, $units) {
    $o = '{"Source":"memscan","Time":"' + (Get-Date -Format o) + '","Status":' + (ConvertTo-Json $status) + ',"Units":' + $units + '}'
    [IO.File]::WriteAllText($tmp, $o, (New-Object Text.UTF8Encoding $false)); Move-Item -Force $tmp $Out
  }
  while ($true) {
    $proc = Find-Game
    if (-not $proc) { Put '게임 없음' '[]'; $bases = ''; Start-Sleep -Seconds 5; continue }
    if ($proc.Id -ne $pid0) { $pid0 = $proc.Id; $bases = '' }
    $full = (-not $bases) -or (((Get-Date) - $lastFull).TotalSeconds -ge $Rescan)
    if ($full -and -not $bases) { Put '전체 스캔 중' '[]' }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $json = [OrdrMemScan]::Hand($proc.Id, $Player, $(if ($full) { '' } else { $bases }), $false)
    $ms = $sw.ElapsedMilliseconds
    $obj = $json | ConvertFrom-Json
    if ($obj.error) { Put $obj.error '[]'; Start-Sleep -Seconds 5; continue }
    if ($full) { $lastFull = Get-Date; $bases = ($obj.regions -join ',') }
    $units = ConvertTo-Json -Compress -InputObject @($obj.hand)
    if (-not $units -or $units -eq 'null') { $units = '[]' }
    if ($full -or $units -ne $lastUnits -or ((Get-Date) - $lastPut).TotalSeconds -ge 5) {
      Put ("{0} {1}ms" -f $(if ($full) { '전체' } else { '빠름' }), $ms) $units
      $lastUnits = $units; $lastPut = Get-Date
      Write-Host ("{0:HH:mm:ss} {1} {2}종 {3}ms" -f (Get-Date), $(if ($full) { '전체' } else { '빠름' }), @($obj.hand).Count, $ms)
    }
    Start-Sleep -Milliseconds ([int]($Interval * 1000))
  }
}

$proc = Find-Game
if (-not $proc) { Write-Host "워크래프트 III 프로세스를 찾지 못했습니다. 게임을 켠 상태에서 실행하세요." ; exit 1 }
$ver = try { $proc.MainModule.FileVersionInfo.FileVersion } catch { 'unknown' }
Write-Host ("프로세스: {0} (PID {1}), 버전: {2}" -f $proc.ProcessName, $proc.Id, $ver)
if ($Hand) { Write-Host "보유 패를 읽기 전용으로 스캔합니다. 1~3분 걸릴 수 있습니다." }
else { Write-Host ("찾는 코드: {0}  — 읽기 전용으로 스캔합니다. 1~3분 걸릴 수 있습니다." -f ($Codes -join ', ')) }
$json = if ($Hand) { [OrdrMemScan]::Hand($proc.Id, $Player, '', $true) } else { [OrdrMemScan]::Scan($proc.Id, $Codes, $Context, $MaxHits) }
$meta = '{"tool":"ordr-memscan 2","time":"' + (Get-Date -Format o) + '","process":"' + $proc.ProcessName + '","version":"' +
        $ver + '","note":' + (ConvertTo-Json $Note) + ',"result":'
[IO.File]::WriteAllText($Out, $meta + $json + '}', [Text.Encoding]::UTF8)
Write-Host "저장: $Out"
$obj = $json | ConvertFrom-Json
if ($obj.error) { Write-Host $obj.error }
elseif ($Hand) {
  $list = @($obj.hand | Sort-Object Count -Descending)
  Write-Host ("유닛 기록 {0}개, 플레이어 {1}번 보유 {2}종:" -f @($obj.units).Count, ($Player + 1), $list.Count)
  foreach ($u in $list) { Write-Host ("  {0,-5} x{1}  {2}" -f $u.Code, $u.Count, (Strip $u.Name)) }
}
else { foreach ($c in $Codes) { Write-Host ("  {0}: {1}곳" -f $c, $obj.codes.$c.count) } }
