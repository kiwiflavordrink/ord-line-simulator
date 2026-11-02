<#
원랜디 오버레이 - 네이티브 창 (수정내역 68).
엣지(크로미움) 창은 클릭하면 스스로 활성화되어 전체 화면 워크3가 최소화된다. 이 창은 WinForms로 직접 그리고
WS_EX_NOACTIVATE + WM_MOUSEACTIVATE=MA_NOACTIVATE 로 클릭해도 활성화되지 않는다(게임 포커스 유지).
계산은 보이지 않는 엣지(headless)가 overlay/renderer/index.html?native=1 에서 하고, 화면 내용을 /view 로 보내면
serve.ps1 이 %TEMP%\ordr_overlay_view.json 에 쓴다. 이 창은 그 파일을 0.4초마다 읽어 그린다. 클릭(탭, 목표, 종류)은
%TEMP%\ordr_overlay_cmd.txt 에 써서 페이지로 보낸다. 단축키: F1 숨기기/보이기, F2 다음 탭.
#>
param([string]$HideKey = 'F1', [string]$TabKey = 'F2', [int]$Width = 430, [int]$Height = 720)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class OrdrRow { public string Text; public string Color; public bool Bold; public string Act; public int Indent; public string[] Menu; }
public class OrdrOverlay : Form {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  // 수정내역 94: F1로 숨긴 뒤 다시 안 열리던 문제 — Hide()/Show() 대신 투명 + 클릭 통과로 숨기고, 보일 때마다 맨 위로 다시 올린다.
  public bool Hidden = false;
  public void Toggle() {
    Hidden = !Hidden; int ex = GetWindowLong(Handle, -20);
    if (Hidden) { Opacity = 0; SetWindowLong(Handle, -20, GetWindowLong(Handle, -20) | 0x20 | 0x80000); }
    else { SetWindowLong(Handle, -20, ex & ~0x20); Opacity = 0.93; Raise(); }
  }
  public void Raise() { SetWindowPos(Handle, (IntPtr)(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040); }   // TOPMOST, NOSIZE|NOMOVE|NOACTIVATE|SHOWWINDOW
  public List<OrdrRow> Rows = new List<OrdrRow>();
  public string View = "now"; public string Status = "";
  public static readonly string[] Views = {"now","next","upper","lack","hand"};
  static readonly string[] Labels = {"지금 조합","목표·찾기","가이드","부족한 것","보유 유닛"};
  public float FontSize = 11f; int scroll = 0, contentH = 0; bool folded = false; int fullH;
  Point dragFrom; bool dragging = false;
  readonly List<KeyValuePair<Rectangle,string>> hits = new List<KeyValuePair<Rectangle,string>>();
  int seq = Environment.TickCount;
  public uint HideVk = 0x70, TabVk = 0x71;
  public OrdrOverlay(int w, int h) {
    Text = "원랜디 오버레이(네이티브)"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual;
    var wa = Screen.PrimaryScreen.WorkingArea; Bounds = new Rectangle(wa.Right - w - 8, wa.Top + 60, w, h); fullH = h;
    BackColor = Color.FromArgb(20, 23, 31); DoubleBuffered = true; TopMost = true; ShowInTaskbar = false; Opacity = 0.93;
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000008 | 0x00000080; return cp; } }   // NOACTIVATE | TOPMOST | TOOLWINDOW
  protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); RegisterHotKey(Handle, 1, 0x4000, HideVk); RegisterHotKey(Handle, 2, 0x4000, TabVk); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x21) { m.Result = (IntPtr)3; return; }   // WM_MOUSEACTIVATE -> MA_NOACTIVATE
    if (m.Msg == 0x312) { if ((int)m.WParam == 1) Toggle(); else NextTab(); return; }
    base.WndProc(ref m);
  }
  public void Send(string cmd) {
    try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "ordr_overlay_cmd.txt"), (++seq) + " " + cmd); } catch {}
  }
  void NextTab() { int i = Array.IndexOf(Views, View); View = Views[(i + 1) % Views.Length]; scroll = 0; Send("view " + View); Invalidate(); }
  Color C(string c) {
    switch (c) { case "ok": return Color.FromArgb(90,209,154); case "bad": return Color.FromArgb(255,122,122); case "warn": return Color.FromArgb(255,209,102);
      case "muted": return Color.FromArgb(154,164,181); case "acc": return Color.FromArgb(124,184,255); default: return Color.FromArgb(232,236,243); }
  }
  protected override void OnPaint(PaintEventArgs e) {
    var g = e.Graphics; g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit; hits.Clear();
    using (var f = new Font("Malgun Gothic", FontSize)) using (var fb = new Font("Malgun Gothic", FontSize, FontStyle.Bold)) using (var fs = new Font("Malgun Gothic", FontSize - 1)) {
      int W = ClientSize.Width, y = 4, lh = (int)(f.GetHeight(g) + 3);
      // header: status + buttons
      string[] tools = {"가−","가+","▤","✕"}; int bx = W - 4;
      for (int i = tools.Length - 1; i >= 0; i--) { int bw = (int)g.MeasureString(tools[i], fs).Width + 10; bx -= bw + 3; var r = new Rectangle(bx, y, bw, lh);
        using (var br = new SolidBrush(Color.FromArgb(45,50,62))) g.FillRectangle(br, r); TextRenderer.DrawText(g, tools[i], fs, r, C(""), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        hits.Add(new KeyValuePair<Rectangle,string>(r, "tool " + i)); }
      TextRenderer.DrawText(g, Status, fb, new Rectangle(6, y, bx - 10, lh), C("acc"), TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter);
      hits.Add(new KeyValuePair<Rectangle,string>(new Rectangle(0, 0, bx, lh + 6), "drag"));
      y += lh + 6;
      if (folded) return;
      // tabs
      int tw = (W - 8) / Views.Length;
      for (int i = 0; i < Views.Length; i++) { var r = new Rectangle(4 + i * tw, y, tw - 3, lh + 4); bool on = Views[i] == View;
        using (var br = new SolidBrush(on ? C("acc") : Color.FromArgb(45,50,62))) g.FillRectangle(br, r);
        TextRenderer.DrawText(g, Labels[i], on ? fb : fs, r, on ? Color.FromArgb(11,15,23) : C(""), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        hits.Add(new KeyValuePair<Rectangle,string>(r, "view " + Views[i])); }
      y += lh + 10;
      int top = y, bottom = ClientSize.Height - lh - 8; contentTop = top; contentBottom = bottom;
      // rows (word-wrapped), clipped to the content area
      g.SetClip(new Rectangle(0, top, W, bottom - top));
      int cy = top - scroll;
      foreach (var row in Rows) {
        var font = row.Bold ? fb : (row.Color == "muted" ? fs : f);
        int x = 8 + row.Indent * 14, w = W - x - 8;
        var sz = TextRenderer.MeasureText(g, row.Text ?? "", font, new Size(w, 10000), TextFormatFlags.WordBreak);
        var r = new Rectangle(x, cy, w, sz.Height + 2);
        if (!string.IsNullOrEmpty(row.Act)) { using (var br = new SolidBrush(Color.FromArgb(32,37,48))) g.FillRectangle(br, new Rectangle(4, cy, W - 8, sz.Height + 2));
          if (cy + sz.Height > top && cy < bottom) hits.Add(new KeyValuePair<Rectangle,string>(Rectangle.Intersect(new Rectangle(4, cy, W - 8, sz.Height + 2), new Rectangle(0, top, W, bottom - top)), row.Act)); }
        TextRenderer.DrawText(g, row.Text ?? "", font, r, C(row.Color), TextFormatFlags.WordBreak);
        cy += sz.Height + 4;
      }
      contentH = cy + scroll - top; g.ResetClip();
      // scroll buttons
      var up = new Rectangle(4, bottom + 4, W / 2 - 6, lh); var dn = new Rectangle(W / 2 + 2, bottom + 4, W / 2 - 6, lh);
      foreach (var p in new[] { new KeyValuePair<Rectangle,string>(up, "▲ 위로"), new KeyValuePair<Rectangle,string>(dn, "▼ 아래로") }) {
        using (var br = new SolidBrush(Color.FromArgb(45,50,62))) g.FillRectangle(br, p.Key);
        TextRenderer.DrawText(g, p.Value, fs, p.Key, C(""), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter); }
      hits.Add(new KeyValuePair<Rectangle,string>(up, "up")); hits.Add(new KeyValuePair<Rectangle,string>(dn, "down"));
      ViewHeight = bottom - top;
    }
  }
  int ViewHeight = 400, contentTop = 0, contentBottom = 0;
  // 수정내역 97: 목록 영역은 끌어서 스크롤(6px 넘게 움직이면 스크롤, 아니면 놓을 때 클릭). ▼ 줄은 목록 메뉴, ✎ 줄은 입력 창.
  bool pressing = false, scrolling = false; int pressY = 0, scrollStart = 0; string pressAct = null; Point pressPt;
  void DoAct(string a, Point pt) {
    if (a.StartsWith("input ")) { string txt = OrdrInput.Ask("유닛 찾기 검색어", ""); if (txt != null) Send(a.Substring(6) + " " + txt); return; }
    var row = Rows.Find(r => r.Act == a && r.Menu != null && r.Menu.Length > 0);
    if (row != null) { var cm = new ContextMenuStrip(); cm.Font = new Font("Malgun Gothic", FontSize);
      for (int k = 0; k < row.Menu.Length; k++) { int idx = k; cm.Items.Add(row.Menu[k], null, (s2, ev) => Send(a + " " + idx)); }
      cm.Show(this, pt); return; }
    Send(a);
  }
  protected override void OnMouseDown(MouseEventArgs e) {
    if (e.Y >= contentTop && e.Y < contentBottom && !folded) {
      pressing = true; scrolling = false; pressY = e.Y; pressPt = e.Location; scrollStart = scroll; pressAct = null; Capture = true;
      for (int i = hits.Count - 1; i >= 0; i--) if (hits[i].Key.Contains(e.Location)) { pressAct = hits[i].Value; break; }
      return;
    }
    for (int i = hits.Count - 1; i >= 0; i--) { if (!hits[i].Key.Contains(e.Location)) continue; string a = hits[i].Value;
      if (a == "drag") { dragging = true; dragFrom = e.Location; Capture = true; return; }
      if (a == "up") { scroll = Math.Max(0, scroll - ViewHeight * 2 / 3); Invalidate(); return; }
      if (a == "down") { scroll = Math.Max(0, Math.Min(Math.Max(0, contentH - ViewHeight), scroll + ViewHeight * 2 / 3)); Invalidate(); return; }
      if (a == "tool 0") { FontSize = Math.Max(8, FontSize - 1); Invalidate(); return; }
      if (a == "tool 1") { FontSize = Math.Min(20, FontSize + 1); Invalidate(); return; }
      if (a == "tool 2") { folded = !folded; Height = folded ? (int)(FontSize * 2.6) + 12 : fullH; Invalidate(); return; }
      if (a == "tool 3") { Close(); return; }
      if (a.StartsWith("view ")) { View = a.Substring(5); scroll = 0; Send(a); Invalidate(); return; }
      DoAct(a, e.Location); return; }
  }
  protected override void OnMouseMove(MouseEventArgs e) {
    if (dragging) { Location = new Point(Location.X + e.X - dragFrom.X, Location.Y + e.Y - dragFrom.Y); return; }
    if (pressing) { int dy = e.Y - pressY; if (Math.Abs(dy) > 6) scrolling = true;
      if (scrolling) { scroll = Math.Max(0, Math.Min(Math.Max(0, contentH - ViewHeight), scrollStart - dy)); Invalidate(); } }
  }
  protected override void OnMouseUp(MouseEventArgs e) {
    if (pressing && !scrolling && pressAct != null) DoAct(pressAct, pressPt);
    pressing = false; scrolling = false; dragging = false; Capture = false;
  }
}

// 수정내역 94: 알람 배너 — 화면 위쪽 가운데, 맨 위, 포커스를 뺏지 않음. 오버레이를 F1로 숨겨도 뜬다. 누르면 닫힘, 10초 뒤 자동으로 닫힘.
public class OrdrBanner : Form {
  public string Title = "", Detail = ""; public bool Red = true; readonly Timer close = new Timer();
  public OrdrBanner() {
    FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual; TopMost = true; ShowInTaskbar = false; DoubleBuffered = true; Opacity = 0.95;
    var wa = Screen.PrimaryScreen.Bounds; Bounds = new Rectangle(wa.Left + wa.Width / 2 - 380, wa.Top + 90, 760, 110);
    close.Interval = 10000; close.Tick += (s, e) => { close.Stop(); Hide(); };
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000008 | 0x00000080; return cp; } }
  protected override void WndProc(ref Message m) { if (m.Msg == 0x21) { m.Result = (IntPtr)3; return; } base.WndProc(ref m); }
  public void ShowAlarm(string title, string detail, bool red) {
    Title = title; Detail = detail; Red = red; BackColor = red ? Color.FromArgb(150, 20, 20) : Color.FromArgb(120, 95, 0);
    if (!Visible) Show(); OrdrOverlay.SetWindowPos(Handle, (IntPtr)(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040);
    Invalidate(); close.Stop(); close.Start();
    try { if (red) System.Media.SystemSounds.Hand.Play(); else System.Media.SystemSounds.Exclamation.Play(); } catch {}
  }
  protected override void OnPaint(PaintEventArgs e) {
    using (var fb = new Font("Malgun Gothic", 20f, FontStyle.Bold)) using (var fs = new Font("Malgun Gothic", 12f)) {
      TextRenderer.DrawText(e.Graphics, Title, fb, new Rectangle(10, 8, Width - 20, 50), Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.EndEllipsis);
      TextRenderer.DrawText(e.Graphics, Detail, fs, new Rectangle(10, 60, Width - 20, Height - 64), Color.FromArgb(240, 240, 240), TextFormatFlags.HorizontalCenter | TextFormatFlags.WordBreak);
    }
  }
  // 수정내역 97: 끌어서 옮긴다(위치는 %TEMP%\ordr_banner_pos.txt 에 기억). 끌지 않고 누르면 닫힌다.
  bool down = false, moved = false; Point from;
  static string PosFile { get { return System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ordr_banner_pos.txt"); } }
  public void LoadPos() { try { var t = System.IO.File.ReadAllText(PosFile).Split(','); Location = new Point(int.Parse(t[0]), int.Parse(t[1])); } catch {} }
  protected override void OnMouseDown(MouseEventArgs e) { down = true; moved = false; from = e.Location; Capture = true; close.Stop(); }
  protected override void OnMouseMove(MouseEventArgs e) {
    if (!down) return; if (Math.Abs(e.X - from.X) + Math.Abs(e.Y - from.Y) > 3) moved = true;
    if (moved) Location = new Point(Location.X + e.X - from.X, Location.Y + e.Y - from.Y);
  }
  protected override void OnMouseUp(MouseEventArgs e) {
    down = false; Capture = false;
    if (!moved) { Hide(); return; }
    try { System.IO.File.WriteAllText(PosFile, Location.X + "," + Location.Y); } catch {}
    close.Start();
  }
}

// 수정내역 97: 검색어 입력 창. 글자를 받으려면 창이 포커스를 가져야 해서, 닫은 뒤 원래 창(게임)으로 포커스를 돌려준다.
public class OrdrInput : Form {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  readonly TextBox box = new TextBox();
  OrdrInput(string title, string init) {
    Text = title; FormBorderStyle = FormBorderStyle.FixedToolWindow; StartPosition = FormStartPosition.CenterScreen; TopMost = true;
    ClientSize = new Size(360, 72); Font = new Font("Malgun Gothic", 12f);
    box.SetBounds(10, 10, 340, 28); box.Text = init;
    var ok = new Button { Text = "찾기", DialogResult = DialogResult.OK }; ok.SetBounds(190, 40, 76, 28);
    var no = new Button { Text = "취소", DialogResult = DialogResult.Cancel }; no.SetBounds(274, 40, 76, 28);
    Controls.Add(box); Controls.Add(ok); Controls.Add(no); AcceptButton = ok; CancelButton = no;
    Shown += (s, e) => { Activate(); box.Focus(); };
  }
  public static string Ask(string title, string init) {
    IntPtr prev = GetForegroundWindow(); string r = null;
    using (var f = new OrdrInput(title, init)) { if (f.ShowDialog() == DialogResult.OK) r = f.box.Text.Trim(); }
    if (prev != IntPtr.Zero) SetForegroundWindow(prev);
    return r;
  }
}
'@
$keys = @{ F1=0x70; F2=0x71; F3=0x72; F4=0x73; F5=0x74; F6=0x75; F7=0x76; F8=0x77; F9=0x78; F10=0x79; F11=0x7A; F12=0x7B }
$form = New-Object OrdrOverlay $Width, $Height
if ($keys.ContainsKey($HideKey)) { $form.HideVk = $keys[$HideKey] }
if ($keys.ContainsKey($TabKey)) { $form.TabVk = $keys[$TabKey] }
$viewFile = Join-Path $env:TEMP 'ordr_overlay_view.json'
$script:last = $null; $script:seen = @{}; $script:raiseAt = 0
$banner = New-Object OrdrBanner; $banner.LoadPos()
$timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 120   # 수정내역 79: 0.4 s -> 0.12 s
$timer.Add_Tick({
  # 수정내역 94: 게임이 맨 위를 가져가도 2초마다 다시 올린다(숨김 상태가 아닐 때).
  if ([Environment]::TickCount - $script:raiseAt -gt 2000) { $script:raiseAt = [Environment]::TickCount; if (-not $form.Hidden -and $form.IsHandleCreated) { $form.Raise() } }
  if (-not (Test-Path $viewFile)) { $form.Status = '계산 준비 중… (엣지 백그라운드)'; $form.Invalidate(); return }
  $t = (Get-Item $viewFile).LastWriteTimeUtc.Ticks
  if ($t -eq $script:last) { return }
  $script:last = $t
  try { $j = Get-Content $viewFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
  $rows = New-Object 'System.Collections.Generic.List[OrdrRow]'
  foreach ($r in $j.rows) { $o = New-Object OrdrRow; $o.Text = [string]$r.t; $o.Color = [string]$r.c; $o.Bold = [bool]$r.b; $o.Act = [string]$r.a; $o.Indent = [int]$r.i; if ($r.m) { $o.Menu = [string[]]@($r.m) }; $rows.Add($o) }
  $form.Rows = $rows; $form.Status = [string]$j.status
  foreach ($a in @($j.alarms)) { if ($a -and $a.id -and -not $script:seen.ContainsKey([string]$a.id)) { $script:seen[[string]$a.id] = 1; $banner.ShowAlarm([string]$a.text, [string]$a.detail, ([string]$a.level -eq 'red')) } }
  if ($j.view) { $form.View = [string]$j.view }
  $form.Invalidate()
})
$timer.Start()
Write-Host "네이티브 오버레이: $HideKey 숨기기/보이기(숨겨도 보스·스토리 알람은 뜸), $TabKey 다음 탭. 이 창을 닫으면 오버레이가 꺼집니다."
[System.Windows.Forms.Application]::Run($form)
# Window closed: stop the hidden Edge that did the calculation.
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ordr-overlay-edge*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
