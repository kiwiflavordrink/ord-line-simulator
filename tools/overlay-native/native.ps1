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
public class OrdrRow { public string Text; public string Color; public bool Bold; public string Act; public int Indent; }
public class OrdrOverlay : Form {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  public List<OrdrRow> Rows = new List<OrdrRow>();
  public string View = "now"; public string Status = "";
  public static readonly string[] Views = {"now","next","upper","lack","hand"};
  static readonly string[] Labels = {"지금 조합","목표 후보","추천 상위","부족한 것","보유 유닛"};
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
    if (m.Msg == 0x312) { if ((int)m.WParam == 1) { if (Visible) Hide(); else Show(); } else NextTab(); return; }
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
      int top = y, bottom = ClientSize.Height - lh - 8;
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
  int ViewHeight = 400;
  protected override void OnMouseDown(MouseEventArgs e) {
    for (int i = hits.Count - 1; i >= 0; i--) { if (!hits[i].Key.Contains(e.Location)) continue; string a = hits[i].Value;
      if (a == "drag") { dragging = true; dragFrom = e.Location; Capture = true; return; }
      if (a == "up") { scroll = Math.Max(0, scroll - ViewHeight * 2 / 3); Invalidate(); return; }
      if (a == "down") { scroll = Math.Max(0, Math.Min(Math.Max(0, contentH - ViewHeight), scroll + ViewHeight * 2 / 3)); Invalidate(); return; }
      if (a == "tool 0") { FontSize = Math.Max(8, FontSize - 1); Invalidate(); return; }
      if (a == "tool 1") { FontSize = Math.Min(20, FontSize + 1); Invalidate(); return; }
      if (a == "tool 2") { folded = !folded; Height = folded ? (int)(FontSize * 2.6) + 12 : fullH; Invalidate(); return; }
      if (a == "tool 3") { Close(); return; }
      if (a.StartsWith("view ")) { View = a.Substring(5); scroll = 0; Send(a); Invalidate(); return; }
      Send(a); return; }
  }
  protected override void OnMouseMove(MouseEventArgs e) { if (dragging) Location = new Point(Location.X + e.X - dragFrom.X, Location.Y + e.Y - dragFrom.Y); }
  protected override void OnMouseUp(MouseEventArgs e) { dragging = false; Capture = false; }
}
'@
$keys = @{ F1=0x70; F2=0x71; F3=0x72; F4=0x73; F5=0x74; F6=0x75; F7=0x76; F8=0x77; F9=0x78; F10=0x79; F11=0x7A; F12=0x7B }
$form = New-Object OrdrOverlay $Width, $Height
if ($keys.ContainsKey($HideKey)) { $form.HideVk = $keys[$HideKey] }
if ($keys.ContainsKey($TabKey)) { $form.TabVk = $keys[$TabKey] }
$viewFile = Join-Path $env:TEMP 'ordr_overlay_view.json'
$script:last = $null
$timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 120   # 수정내역 79: 0.4 s -> 0.12 s
$timer.Add_Tick({
  if (-not (Test-Path $viewFile)) { $form.Status = '계산 준비 중… (엣지 백그라운드)'; $form.Invalidate(); return }
  $t = (Get-Item $viewFile).LastWriteTimeUtc.Ticks
  if ($t -eq $script:last) { return }
  $script:last = $t
  try { $j = Get-Content $viewFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return }
  $rows = New-Object 'System.Collections.Generic.List[OrdrRow]'
  foreach ($r in $j.rows) { $o = New-Object OrdrRow; $o.Text = [string]$r.t; $o.Color = [string]$r.c; $o.Bold = [bool]$r.b; $o.Act = [string]$r.a; $o.Indent = [int]$r.i; $rows.Add($o) }
  $form.Rows = $rows; $form.Status = [string]$j.status
  if ($j.view) { $form.View = [string]$j.view }
  $form.Invalidate()
})
$timer.Start()
Write-Host "네이티브 오버레이: $HideKey 숨기기/보이기, $TabKey 다음 탭. 이 창을 닫으면 오버레이가 꺼집니다."
[System.Windows.Forms.Application]::Run($form)
# Window closed: stop the hidden Edge that did the calculation.
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*ordr-overlay-edge*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
