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
  [string]$Out = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ordr_memscan.json')
)

$src = @"
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
}
"@
Add-Type -TypeDefinition $src -Language CSharp

$proc = Get-Process | Where-Object { $_.ProcessName -like "$Process*" } | Select-Object -First 1
if (-not $proc) { Write-Host "워크래프트 III 프로세스를 찾지 못했습니다. 게임을 켠 상태에서 실행하세요." ; exit 1 }
Write-Host ("프로세스: {0} (PID {1}), 버전: {2}" -f $proc.ProcessName, $proc.Id, $proc.MainModule.FileVersionInfo.FileVersion)
Write-Host ("찾는 코드: {0}  — 읽기 전용으로 스캔합니다. 1~3분 걸릴 수 있습니다." -f ($Codes -join ', '))
$json = [OrdrMemScan]::Scan($proc.Id, $Codes, $Context, $MaxHits)
$meta = '{"tool":"ordr-memscan 1","time":"' + (Get-Date -Format o) + '","process":"' + $proc.ProcessName + '","version":"' +
        $proc.MainModule.FileVersionInfo.FileVersion + '","result":'
[IO.File]::WriteAllText($Out, $meta + $json + '}', [Text.Encoding]::UTF8)
Write-Host "저장: $Out"
$obj = $json | ConvertFrom-Json
if ($obj.error) { Write-Host $obj.error } else { foreach ($c in $Codes) { Write-Host ("  {0}: {1}곳" -f $c, $obj.codes.$c.count) } }
