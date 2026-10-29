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
  [switch]$Probe,
  [switch]$Track,
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
  // Game state from the same unit records (수정내역 90, probe 2026-10-25): story = owner 5 record named "N. 이름"
  // (n000 "1. 로그타운" … n009 "14. 에그헤드"), round = highest "레벨 NN" in owner 6 line-mob names, 오로성 = unit o02E/o031/o032
  // (owner 7, placed at game start), other players = owners 0..3 except this player.
  public class GameState { public int round = 0, story = 0; public string storyName = "", gorosei = "";
    public Dictionary<int, Dictionary<string, int>> others = new Dictionary<int, Dictionary<string, int>>(); }
  static string StripColor(string s) { return System.Text.RegularExpressions.Regex.Replace(s, "\\|c[0-9a-fA-F]{8}|\\|r", ""); }
  static void HandRegion(IntPtr h, MBI64 m, int player, bool full, List<string> rows, Dictionary<string, int> counts,
                         Dictionary<string, string> names, HashSet<ulong> mine, ref long scanned, GameState gs) {
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
        bool live = st != 0x11 && a != -1;
        bool gor = code == "o02E" || code == "o031" || code == "o032";
        bool watch = owner == player || (owner >= 0 && owner <= 3) || owner == 5 || owner == 6 || gor;
        if (watch) mine.Add(m.BaseAddress);
        if (!owned && !full && !(watch && live)) continue;
        int e = i + 4; while (e < n && buf[e] != 0 && e < i + 200) e++;
        var nc = Encoding.UTF8.GetString(buf, i + 4, e - i - 4).ToCharArray();
        for (int k = 0; k < nc.Length; k++) if (nc[k] < (char)0x20) nc[k] = ' ';
        string name = new string(nc).Replace("\\", "\\\\").Replace("\"", "\\\"");
        if (owned) { int c0; counts.TryGetValue(code, out c0); counts[code] = c0 + 1; names[code] = name; }
        if (live && gs != null) {
          string plain = StripColor(new string(nc)).Trim();
          if (gor) gs.gorosei = code;
          else if (owner == 5 && code[0] == 'n') {
            var sm = System.Text.RegularExpressions.Regex.Match(plain, "^(\\d+)\\. ");
            if (sm.Success) { int sv = int.Parse(sm.Groups[1].Value); if (sv > gs.story) { gs.story = sv; gs.storyName = plain.Replace("\\", "").Replace("\"", ""); } }
          } else if (owner == 6) {
            var lm = System.Text.RegularExpressions.Regex.Match(plain, "레벨 (\\d+)");
            if (lm.Success) { int lv = int.Parse(lm.Groups[1].Value); if (lv > gs.round) gs.round = lv; }
          } else if (owner >= 0 && owner <= 3 && owner != player) {
            Dictionary<string, int> d0; if (!gs.others.TryGetValue(owner, out d0)) { d0 = new Dictionary<string, int>(); gs.others[owner] = d0; }
            int c1; d0.TryGetValue(code, out c1); d0[code] = c1 + 1;
          }
        }
        if (full) rows.Add("{\"code\":\"" + code + "\",\"addr\":\"0x" + (m.BaseAddress + start + (ulong)i).ToString("x") +
          "\",\"owner\":" + owner + ",\"state\":" + st + ",\"f56\":" + BitConverter.ToInt32(buf, i - 56) +
          ",\"a\":" + a + ",\"b\":" + BitConverter.ToInt32(buf, i - 84) +
          ",\"name\":\"" + name + "\",\"before\":\"" + Hex(buf, i - 96, 96) + "\"}");
      }
    }
  }

  // Probe (수정내역 84): UTF-8 text around given patterns in writable memory (round timer title "현재 라운드 : N",
  // quest frames "퀘스트 :: …", mission frames, unit-count multiboard …), to find where the coach can read game state.
  public static string Strings(int pid, string[] pats, int maxHits) {
    IntPtr h = OpenProcess(QUERY | VM_READ, false, pid);
    if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess failed " + Marshal.GetLastWin32Error() + "\"}";
    var bp = new List<byte[]>(); foreach (var s in pats) bp.Add(Encoding.UTF8.GetBytes(s));
    var hits = new List<string>[pats.Length]; var counts = new int[pats.Length];
    for (int i = 0; i < pats.Length; i++) hits[i] = new List<string>();
    ulong addr = 0; const int CHUNK = 16 * 1024 * 1024, PAD = 256; int size = Marshal.SizeOf(typeof(MBI64));
    while (addr < 0x7FFFFFFFFFFF) {
      MBI64 m;
      if (VirtualQueryEx(h, (IntPtr)(long)addr, out m, (IntPtr)size) == IntPtr.Zero) break;
      ulong next = m.BaseAddress + m.RegionSize; if (next <= addr) break;
      bool rw = m.State == MEM_COMMIT && (m.Protect & 0x101) == 0 && (m.Protect & (0x04 | 0x08 | 0x40 | 0x80)) != 0;
      if (rw) for (ulong off = 0; off < m.RegionSize; off += (ulong)CHUNK) {
        ulong start = off >= PAD ? off - PAD : 0;
        int len = (int)Math.Min((ulong)CHUNK + 2 * PAD, m.RegionSize - start);
        var buf = new byte[len]; IntPtr read;
        if (!ReadProcessMemory(h, (IntPtr)(long)(m.BaseAddress + start), buf, (IntPtr)len, out read)) continue;
        int n = (int)read, from = (int)(off - start);
        for (int i = from; i < n && i < from + CHUNK; i++) {
          for (int p = 0; p < bp.Count; p++) {
            var q = bp[p]; if (buf[i] != q[0] || i + q.Length > n) continue;
            bool ok = true; for (int k = 1; k < q.Length && ok; k++) ok = buf[i + k] == q[k];
            if (!ok) continue;
            counts[p]++; if (hits[p].Count >= maxHits) continue;
            int s0 = Math.Max(0, i - 48), e0 = Math.Min(n, i + q.Length + 160);
            int z = i + q.Length; while (z < e0 && buf[z] != 0) z++;
            var txt = Encoding.UTF8.GetString(buf, s0, z - s0).Replace("\\", "\\\\").Replace("\"", "\\\"");
            var sb = new StringBuilder(); foreach (var c in txt) sb.Append(c < (char)0x20 ? ' ' : c);
            hits[p].Add("{\"addr\":\"0x" + (m.BaseAddress + start + (ulong)i).ToString("x") + "\",\"text\":\"" + sb.ToString() + "\"}");
          }
        }
      }
      addr = next;
    }
    CloseHandle(h);
    var o = new StringBuilder("{");
    for (int p = 0; p < pats.Length; p++) { if (p > 0) o.Append(","); o.Append("\"" + pats[p].Replace("\"", "") + "\":{\"count\":" + counts[p] + ",\"hits\":[" + string.Join(",", hits[p].ToArray()) + "]}"); }
    return o.Append("}").ToString();
  }

  // Personal quests (수정내역 91, probes 2026-10-25 x2): every quest title "|cffffdead퀘스트 :: 이름|r" exists in memory (map
  // script and quest dialogs), but the 3 quests given to this player appear 4 times as stand-alone strings, the others
  // at most twice. Script copies are preceded by a quote and are not NUL-terminated after "|r", so they are skipped.
  public static void CountQuests(byte[] buf, int from, int n, byte[] q, Dictionary<string, int> cnt) {
        for (int i = Math.Max(from, 1); i + q.Length + 4 < n && i < from + 16 * 1024 * 1024; i++) {
          if (buf[i] != 0x7c || buf[i + 1] != 0x63 || buf[i - 1] == 0x22) continue;
          bool ok = true; for (int k = 2; k < q.Length && ok; k++) ok = buf[i + k] == q[k];
          if (!ok) continue;
          int s0 = i + q.Length, z = s0; while (z + 2 < n && z < s0 + 60 && !(buf[z] == 0x7c && buf[z + 1] == 0x72)) z++;
          if (z + 2 >= n || buf[z] != 0x7c || buf[z + 2] != 0) continue;
          string name = Encoding.UTF8.GetString(buf, s0, z - s0);
          if (System.Text.RegularExpressions.Regex.IsMatch(name, "^\ud018\uc2a4\ud2b8 \\d+\ubc88$") || name.IndexOf('"') >= 0 || name.IndexOf('\\') >= 0) continue;
          int c0; cnt.TryGetValue(name, out c0); cnt[name] = c0 + 1;
        }
  }
  public static string Quests(int pid) {
    IntPtr h = OpenProcess(QUERY | VM_READ, false, pid);
    if (h == IntPtr.Zero) return "[]";
    var q = Encoding.UTF8.GetBytes("|cffffdead\ud018\uc2a4\ud2b8 :: "); var cnt = new Dictionary<string, int>();
    ulong addr = 0; const int CHUNK = 16 * 1024 * 1024, PAD = 128; int size = Marshal.SizeOf(typeof(MBI64));
    while (addr < 0x7FFFFFFFFFFF) {
      MBI64 m;
      if (VirtualQueryEx(h, (IntPtr)(long)addr, out m, (IntPtr)size) == IntPtr.Zero) break;
      ulong next = m.BaseAddress + m.RegionSize; if (next <= addr) break;
      bool rw = m.State == MEM_COMMIT && (m.Protect & 0x101) == 0 && (m.Protect & (0x04 | 0x08 | 0x40 | 0x80)) != 0;
      if (rw) for (ulong off = 0; off < m.RegionSize; off += (ulong)CHUNK) {
        ulong start = off >= PAD ? off - PAD : 0;
        int len = (int)Math.Min((ulong)CHUNK + 2 * PAD, m.RegionSize - start);
        var buf = new byte[len]; IntPtr read;
        if (!ReadProcessMemory(h, (IntPtr)(long)(m.BaseAddress + start), buf, (IntPtr)len, out read)) continue;
        int n = (int)read, from = (int)(off - start);
        CountQuests(buf, from, n, q, cnt);
      }
      addr = next;
    }
    CloseHandle(h);
    var top = new List<KeyValuePair<string, int>>(); foreach (var kv in cnt) if (kv.Value >= 3) top.Add(kv);
    top.Sort((a, b) => b.Value.CompareTo(a.Value));
    var o = new List<string>(); for (int k = 0; k < top.Count && k < 3; k++) o.Add("\"" + top[k].Key + "\"");
    return "[" + string.Join(",", o.ToArray()) + "]";
  }

  // bases: "" = walk all memory; else comma-separated region bases from an earlier call (fast re-read).
  // full: also return every record with its raw bytes (diagnostics). Hand entries use the helper's reversed rawcode.
  public static string Hand(int pid, int player, string bases, bool full) {
    IntPtr h = OpenProcess(QUERY | VM_READ, false, pid);
    if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess failed " + Marshal.GetLastWin32Error() + "\"}";
    var rows = new List<string>(); var counts = new Dictionary<string, int>(); var names = new Dictionary<string, string>();
    var mine = new HashSet<ulong>(); long scanned = 0; int size = Marshal.SizeOf(typeof(MBI64));
    var gs = new GameState();
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
      if (rw) HandRegion(h, m, player, full, rows, counts, names, mine, ref scanned, gs);
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
    var oth = new List<string>();
    foreach (var kv in gs.others) { var it = new List<string>(); foreach (var u in kv.Value) it.Add("\"" + u.Key + "\":" + u.Value); oth.Add("\"" + kv.Key + "\":{" + string.Join(",", it.ToArray()) + "}"); }
    string game = "{\"round\":" + gs.round + ",\"story\":" + gs.story + ",\"storyName\":\"" + gs.storyName + "\",\"gorosei\":\"" + gs.gorosei + "\",\"others\":{" + string.Join(",", oth.ToArray()) + "}}";
    return "{\"bytesScanned\":" + scanned + ",\"game\":" + game + ",\"regions\":[" + string.Join(",", reg.ToArray()) + "],\"hand\":[" +
      string.Join(",", hand.ToArray()) + "],\"units\":[" + string.Join(",", rows.ToArray()) + "]}";
  }
}

// 수정내역 92: personal quests read on a background thread (full memory pass every 1.5 s until round 10 / until found,
// then every 30 s), so a reroll shows up within seconds without slowing the 0.3 s hand loop.
public static class QuestBg {
  static System.Threading.Thread th; static volatile string cur = "[]"; static volatile int pidRun = 0;
  public static volatile int Round = 0;
  public static string Current { get { return cur; } }
  public static void Ensure(int pid) {
    if (pidRun == pid && th != null && th.IsAlive) return;
    pidRun = pid; cur = "[]";
    th = new System.Threading.Thread(() => {
      while (pidRun == pid) {
        try { cur = OrdrMemScan.Quests(pid); } catch { }
        System.Threading.Thread.Sleep(Round > 10 && cur != "[]" ? 30000 : 1500);
      }
    });
    th.IsBackground = true; th.Priority = System.Threading.ThreadPriority.BelowNormal; th.Start();
  }
}

// 수정내역 92: quest counters (목재 도박 횟수, 하급 도박 시도 …) are per-player JASS integer arrays (2.305 `Ah[p]`, `yM[p]`).
// Their place in memory is unknown, so Track finds one by value: the user enters the counter after each action and the
// candidate int32 addresses are narrowed down; Report then dumps the bytes around the survivors and around every
// pointer to them, so the array/variable layout can be worked out and all counters located by name afterwards.
public static class Track {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr VirtualQueryEx(IntPtr h, IntPtr addr, out OrdrMemScan.MBI64 info, IntPtr len);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  const uint ACCESS = 0x0400 | 0x0010;
  public static List<ulong> Cand = new List<ulong>(); public static int Last = 0;
  public static List<ulong> Changed = new List<ulong>(); public static List<int> ChangedTo = new List<int>();
  static bool Rw(OrdrMemScan.MBI64 m) { return m.State == 0x1000 && (m.Protect & 0x101) == 0 && (m.Protect & (0x04 | 0x08 | 0x40 | 0x80)) != 0; }
  static void Walk(IntPtr h, Action<ulong, byte[], int> each) {
    ulong addr = 0; const int CHUNK = 16 * 1024 * 1024; int size = Marshal.SizeOf(typeof(OrdrMemScan.MBI64));
    while (addr < 0x7FFFFFFFFFFF) {
      OrdrMemScan.MBI64 m;
      if (VirtualQueryEx(h, (IntPtr)(long)addr, out m, (IntPtr)size) == IntPtr.Zero) break;
      ulong next = m.BaseAddress + m.RegionSize; if (next <= addr) break;
      if (Rw(m)) for (ulong off = 0; off < m.RegionSize; off += (ulong)CHUNK) {
        int len = (int)Math.Min((ulong)CHUNK, m.RegionSize - off); var buf = new byte[len]; IntPtr read;
        if (ReadProcessMemory(h, (IntPtr)(long)(m.BaseAddress + off), buf, (IntPtr)len, out read)) each(m.BaseAddress + off, buf, (int)read);
      }
      addr = next;
    }
  }
  public static long First(int pid, int value) {
    IntPtr h = OpenProcess(ACCESS, false, pid); if (h == IntPtr.Zero) return -1;
    Cand = new List<ulong>(); Last = value; Changed.Clear(); ChangedTo.Clear();
    Walk(h, (b, buf, n) => { for (int i = 0; i + 4 <= n; i += 4) if (BitConverter.ToInt32(buf, i) == value) Cand.Add(b + (ulong)i); });
    CloseHandle(h); return Cand.Count;
  }
  public static long Next(int pid, int value) {
    IntPtr h = OpenProcess(ACCESS, false, pid); if (h == IntPtr.Zero) return -1;
    Changed.Clear(); ChangedTo.Clear();
    var keep = new List<ulong>(); var buf = new byte[1 << 20]; ulong blk = ulong.MaxValue; bool ok = false; var one = new byte[4];
    foreach (var a in Cand) {
      ulong bb = a & ~((ulong)(1 << 20) - 1); IntPtr read;
      if (bb != blk) { blk = bb; ok = ReadProcessMemory(h, (IntPtr)(long)bb, buf, (IntPtr)buf.Length, out read) && (long)read == buf.Length; }
      int v;
      if (ok) v = BitConverter.ToInt32(buf, (int)(a - bb));
      else { if (!ReadProcessMemory(h, (IntPtr)(long)a, one, (IntPtr)4, out read)) continue; v = BitConverter.ToInt32(one, 0); }
      if (v == value) keep.Add(a);
      else if (v != Last) { Changed.Add(a); ChangedTo.Add(v); }
    }
    CloseHandle(h);
    if (keep.Count == 0) return 0;   // keep the previous candidates so the report shows what they became
    Cand = keep; Last = value; Changed.Clear(); ChangedTo.Clear(); return Cand.Count;
  }
  static string Hex(byte[] b, int s, int n) { var sb = new StringBuilder(); for (int i = s; i < s + n && i < b.Length; i++) sb.Append(b[i].ToString("x2")); return sb.ToString(); }
  static string Text(IntPtr h, ulong p) {
    var b = new byte[64]; IntPtr read; if (!ReadProcessMemory(h, (IntPtr)(long)p, b, (IntPtr)64, out read)) return null;
    int z = 0; while (z < 64 && b[z] != 0) z++; if (z < 2) return null;
    var t = Encoding.UTF8.GetString(b, 0, z); foreach (var c in t) if (c < ' ') return null;
    return t.Replace("\\", "\\\\").Replace("\"", "\\\"");
  }
  static string Around(IntPtr h, ulong a, int before, int after) {
    var b = new byte[before + after]; IntPtr read;
    if (!ReadProcessMemory(h, (IntPtr)(long)(a - (ulong)before), b, (IntPtr)b.Length, out read)) return "{\"addr\":\"0x" + a.ToString("x") + "\"}";
    var strs = new List<string>();
    for (int i = 0; i + 8 <= b.Length; i += 8) { ulong q = BitConverter.ToUInt64(b, i); if (q > 0x10000 && q < 0x7FFFFFFFFFFF) { var t = Text(h, q); if (t != null) strs.Add("\"" + (i - before) + "\":\"" + t + "\""); } }
    return "{\"addr\":\"0x" + a.ToString("x") + "\",\"from\":" + (-before) + ",\"hex\":\"" + Hex(b, 0, b.Length) + "\",\"ptrText\":{" + string.Join(",", strs.ToArray()) + "}}";
  }
  public static string Report(int pid, string label, string steps) {
    IntPtr h = OpenProcess(ACCESS, false, pid); if (h == IntPtr.Zero) return "{\"error\":\"OpenProcess\"}";
    var c = Cand.Count > 40 ? Cand.GetRange(0, 40) : Cand; if (c.Count == 0) { CloseHandle(h); return "{\"left\":0}"; } var items = new List<string>();
    var holders = new Dictionary<ulong, List<ulong>>(); foreach (var a in c) holders[a] = new List<ulong>();
    // Pointers to (a - 0..64): an array's data pointer usually points at element 0 or at a small header before it.
    var sorted = c.ToArray(); Array.Sort(sorted); ulong lo = sorted[0] - 64, hi = sorted[sorted.Length - 1];
    Walk(h, (b, buf, n) => {
      for (int i = 0; i + 8 <= n; i += 8) { ulong q = BitConverter.ToUInt64(buf, i); if (q < lo || q > hi) continue;
        int k = Array.BinarySearch(sorted, q); if (k < 0) k = ~k;
        for (; k < sorted.Length && sorted[k] - q <= 64; k++) if (holders[sorted[k]].Count < 12) holders[sorted[k]].Add(b + (ulong)i); }
    });
    foreach (var a in c) {
      var hs = new List<string>(); foreach (var x in holders[a]) hs.Add(Around(h, x, 96, 96));
      items.Add("{\"cand\":" + Around(h, a, 64, 64) + ",\"pointers\":[" + string.Join(",", hs.ToArray()) + "]}");
    }
    // Candidates that changed at the step where none matched: value histogram + the first 40 near the expected value.
    var hist = new Dictionary<int, int>(); var ch = new List<string>();
    for (int k = 0; k < Changed.Count; k++) { int v = ChangedTo[k]; int c0; hist.TryGetValue(v, out c0); hist[v] = c0 + 1;
      if (ch.Count < 40 && v > Last && v - Last <= 20) ch.Add("{\"to\":" + v + ",\"at\":" + Around(h, Changed[k], 64, 64) + "}"); }
    var hs2 = new List<string>(); foreach (var kv in hist) if (hs2.Count < 200) hs2.Add("\"" + kv.Key + "\":" + kv.Value);
    CloseHandle(h);
    return "{\"tool\":\"track 2\",\"last\":" + Last + ",\"changedHist\":{" + string.Join(",", hs2.ToArray()) + "},\"changed\":[" + string.Join(",", ch.ToArray()) + "]," +
      "\"label\":\"" + label.Replace("\"", "") + "\",\"steps\":\"" + steps + "\",\"left\":" + Cand.Count + ",\"items\":[" + string.Join(",", items.ToArray()) + "]}";
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
  $tmp = "$Out.tmp"; $bases = ''; $lastFull = [DateTime]::MinValue; $pid0 = 0; $lastUnits = $null; $lastPut = [DateTime]::MinValue; $quests = '[]'
  # 수정내역 90: "Game" = {round, story, storyName, gorosei, others} read from the same unit records.
  function Put($status, $units, $game = 'null') {
    $o = '{"Source":"memscan","Time":"' + (Get-Date -Format o) + '","Status":' + (ConvertTo-Json $status) + ',"Units":' + $units + ',"Game":' + $game + '}'
    [IO.File]::WriteAllText($tmp, $o, (New-Object Text.UTF8Encoding $false)); Move-Item -Force $tmp $Out
  }
  while ($true) {
    $proc = Find-Game
    if (-not $proc) { Put '게임 없음' '[]'; $bases = ''; Start-Sleep -Seconds 5; continue }
    if ($proc.Id -ne $pid0) { $pid0 = $proc.Id; $bases = ''; $quests = '[]' }
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
    # 수정내역 92: quests come from a background thread (re-read every 1.5 s until round 10).
    [QuestBg]::Ensure($proc.Id); if ($obj.game) { [QuestBg]::Round = [int]$obj.game.round }; $quests = [QuestBg]::Current
    if ($obj.game) { $obj.game | Add-Member -Force NoteProperty quests @($quests | ConvertFrom-Json) }
    $game = if ($obj.game) { ConvertTo-Json -Compress -Depth 4 $obj.game } else { 'null' }
    if ($full -or ($units + $game) -ne $lastUnits -or ((Get-Date) - $lastPut).TotalSeconds -ge 5) {
      Put ("{0} {1}ms" -f $(if ($full) { '전체' } else { '빠름' }), $ms) $units $game
      $lastUnits = $units + $game; $lastPut = Get-Date
      Write-Host ("{0:HH:mm:ss} {1} {2}종 {3}ms" -f (Get-Date), $(if ($full) { '전체' } else { '빠름' }), @($obj.hand).Count, $ms)
    }
    Start-Sleep -Milliseconds ([int]($Interval * 1000))
  }
}

$proc = Find-Game
if (-not $proc) { Write-Host "워크래프트 III 프로세스를 찾지 못했습니다. 게임을 켠 상태에서 실행하세요." ; exit 1 }
$ver = try { $proc.MainModule.FileVersionInfo.FileVersion } catch { 'unknown' }
Write-Host ("프로세스: {0} (PID {1}), 버전: {2}" -f $proc.ProcessName, $proc.Id, $ver)
if ($Track) {
  # 수정내역 92-93: find a quest counter (하급 도박 시도 횟수 = 2.305 yM[p]) by value. Read-only.
  # 93: all writable memory (not only private); when no candidate is left the previous ones are kept and the file
  # records what they became, so an off-by-one count or a different counting rule shows up; q also saves.
  Write-Host "퀘스트 진행도 위치 찾기(읽기 전용). 하급 도박 횟수로 찾습니다."
  Write-Host "1) 하급 도박을 2번 이상 한 뒤, 지금까지 한 하급 도박 횟수를 입력하세요."
  Write-Host "2) 하급 도박을 1번 더 하고(결과가 화면에 뜬 뒤) 새 횟수를 입력하세요. 후보가 10개 이하가 될 때까지 반복합니다."
  Write-Host "   (처음부터 다시: r, 저장하고 끝내기: q)"
  $tf = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ordr_track.json'
  function Save-Track($why) {
    Write-Host "파일을 만드는 중입니다(1~3분)..."
    $o = [Track]::Report($proc.Id, "하급 도박 시도 ($why)", ($steps -join ','))
    [IO.File]::WriteAllText($tf, $o, [Text.Encoding]::UTF8)
    Write-Host "저장: $tf  (이 파일을 보내 주세요)"
  }
  $steps = @(); $first = $true
  while ($true) {
    $t = Read-Host "지금까지 하급 도박 횟수"
    if ($t -eq 'q') { if (-not $first) { Save-Track 'q' }; break }
    if ($t -eq 'r') { $first = $true; $steps = @(); continue }
    $v = 0; if (-not [int]::TryParse($t, [ref]$v) -or $v -lt 1) { Write-Host "1 이상의 숫자를 넣으세요."; continue }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $n = if ($first) { [Track]::First($proc.Id, $v) } else { [Track]::Next($proc.Id, $v) }
    $first = $false; $steps += $v
    Write-Host ("  후보 {0}곳 ({1:N1}초)" -f $n, ($sw.ElapsedMilliseconds / 1000))
    if ($n -lt 0) { Write-Host "  게임을 읽지 못했습니다."; break }
    if ($n -eq 0) {
      Write-Host "  맞는 후보가 없습니다. 직전 후보가 어떤 값으로 바뀌었는지 파일로 남깁니다."
      Save-Track 'none'
      Write-Host "  숫자를 잘못 넣었다면 맞는 숫자를 다시 넣어 계속할 수 있습니다(직전 후보 유지). 끝내려면 q."
      continue
    }
    if ($n -le 10) { Save-Track 'found'; break }
  }
  exit 0
}
if ($Probe) {
  # 수정내역 84: one-shot diagnostic for the coach — every unit record by owner (other players, 오로성 o02E/o031/o032,
  # story/boss units) and the UI texts that carry round, quests, missions and unit count. Read-only.
  Write-Host "코치용 진단 스캔(읽기 전용)입니다. 2~5분 걸릴 수 있습니다. 게임 중(신세계 전이라도 됨)에 실행하세요."
  $pats = @('현재 라운드','보스 라운드','라운드 시작까지','신세계 시작까지','퀘스트 :: ','미션 :: ','유닛 카운트','에그헤드','제한시간','개인미션')
  $units = [OrdrMemScan]::Hand($proc.Id, $Player, '', $true) | ConvertFrom-Json
  $strs = [OrdrMemScan]::Strings($proc.Id, $pats, 200)
  $byOwner = @{}
  foreach ($u in @($units.units)) {
    if ($u.state -eq 17 -or $u.a -eq -1) { continue }
    $k = [string]$u.owner; if (-not $byOwner.ContainsKey($k)) { $byOwner[$k] = @{} }
    $nm = Strip $u.name; $key = "$($u.code) $nm"
    $byOwner[$k][$key] = 1 + [int]($byOwner[$k][$key])
  }
  $gor = @($units.units | Where-Object { $_.code -in @('o02E','o031','o032') } | ForEach-Object { @{ code = $_.code; owner = $_.owner; addr = $_.addr; name = (Strip $_.name) } })
  $o = '{"tool":"ordr-probe 1","time":"' + (Get-Date -Format o) + '","process":"' + $proc.ProcessName + '","version":"' + $ver + '","player":' + $Player +
       ',"note":' + (ConvertTo-Json $Note) + ',"unitsByOwner":' + (ConvertTo-Json -Depth 4 -Compress $byOwner) + ',"gorosei":' + (ConvertTo-Json -Compress -InputObject $gor) +
       ',"strings":' + $strs + '}'
  $pf = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ordr_probe.json'
  [IO.File]::WriteAllText($pf, $o, [Text.Encoding]::UTF8)
  Write-Host "저장: $pf  (이 파일을 보내 주세요)"
  foreach ($k in $byOwner.Keys | Sort-Object) { Write-Host ("  주인 {0}: {1}종" -f $k, $byOwner[$k].Count) }
  if ($gor.Count) { Write-Host ("  오로성 유닛: " + (($gor | ForEach-Object { $_.code + ' ' + $_.name }) -join ', ')) } else { Write-Host '  오로성 유닛을 찾지 못했습니다.' }
  exit 0
}
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
