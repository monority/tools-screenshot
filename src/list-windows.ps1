Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
}
"@

$desktop = [WinAPI]::GetDesktopWindow()
$GW_CHILD = 5
$GW_HWNDNEXT = 2
$hwnd = [WinAPI]::GetWindow($desktop, $GW_CHILD)
$results = @()

while ($hwnd -ne [IntPtr]::Zero) {
    if ([WinAPI]::IsWindowVisible($hwnd)) {
        $sb = New-Object System.Text.StringBuilder 256
        [WinAPI]::GetWindowText($hwnd, $sb, 256) | Out-Null
        $title = $sb.ToString()
        if ($title -ne "") {
            [uint32]$procId = 0
            [WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
            try {
                $proc = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
                $procName = if ($proc) { $proc.ProcessName } else { "unknown" }
                $rect = New-Object WinAPI+RECT
                $hr = [WinAPI]::DwmGetWindowAttribute($hwnd, [WinAPI]::DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf($rect))
                $w = $rect.Right - $rect.Left
                $h = $rect.Bottom - $rect.Top
                if ($w -gt 0 -and $h -gt 0) {
                    $results += [PSCustomObject]@{
                        title   = $title
                        process = $procName
                        x       = $rect.Left
                        y       = $rect.Top
                        width   = $w
                        height  = $h
                    }
                }
            } catch {}
        }
    }
    $hwnd = [WinAPI]::GetWindow($hwnd, $GW_HWNDNEXT)
}

$results | ConvertTo-Json -Compress
