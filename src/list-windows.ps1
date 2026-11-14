# Force UTF-8 on stdout so accented window titles survive the Node pipe.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
}
"@

# Per-Monitor-V2 DPI awareness so coordinates match physical pixels on scaled displays.
# Falls back to system-DPI-aware on older Windows. Must run before any GetWindow*/Dwm* call.
if (-not [WinAPI]::SetProcessDpiAwarenessContext([IntPtr](-4))) {
    [WinAPI]::SetProcessDPIAware() | Out-Null
}

# Browser list and content window classes come from src/config.js (single source of truth),
# passed as JSON in SW_WINDOW_CONFIG by finder.js. Empty fallback = plain enumeration.
$browsers = @()
$contentClasses = @{}
if ($env:SW_WINDOW_CONFIG) {
    try {
        $cfg = $env:SW_WINDOW_CONFIG | ConvertFrom-Json
        $browsers = @($cfg.browsers)
        if ($cfg.contentClasses) {
            $contentClasses = $cfg.contentClasses
        }
    } catch {}
}

function Get-ContentBounds($hwnd, $procName) {
    $targets = $contentClasses[$procName.ToLower()]
    if (-not $targets) { return $null }

    $bestContent = $null
    $maxArea = 0

    foreach ($className in $targets) {
        $child = [IntPtr]::Zero
        while ($true) {
            $child = [WinAPI]::FindWindowEx($hwnd, $child, $className, $null)
            if ($child -eq [IntPtr]::Zero) { break }

            $pt = New-Object WinAPI+POINT
            $pt.X = 0; $pt.Y = 0
            [WinAPI]::ClientToScreen($child, [ref]$pt) | Out-Null
            $cr = New-Object WinAPI+RECT
            [WinAPI]::GetClientRect($child, [ref]$cr) | Out-Null

            $area = $cr.Right * $cr.Bottom
            if ($area -gt $maxArea -and $cr.Right -gt 100 -and $cr.Bottom -gt 100) {
                $maxArea = $area
                $bestContent = [PSCustomObject]@{
                    x      = $pt.X
                    y      = $pt.Y
                    width  = $cr.Right
                    height = $cr.Bottom
                }
            }
        }
    }

    return $bestContent
}

$desktop = [WinAPI]::GetDesktopWindow()
$GW_CHILD = 5
$GW_HWNDNEXT = 2
$hwnd = [WinAPI]::GetWindow($desktop, $GW_CHILD)
$results = @()
$foreground = [WinAPI]::GetForegroundWindow()
# Resolving a process name costs a lookup per PID; browsers commonly own
# several windows, so cache it for the duration of the enumeration.
$processNames = @{}

while ($hwnd -ne [IntPtr]::Zero) {
    if ([WinAPI]::IsWindowVisible($hwnd) -and -not [WinAPI]::IsIconic($hwnd)) {
        $sb = New-Object System.Text.StringBuilder 256
        [WinAPI]::GetWindowText($hwnd, $sb, 256) | Out-Null
        $title = $sb.ToString()
        if ($title -ne "") {
            [uint32]$procId = 0
            [WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
            try {
                $procKey = [int]$procId
                if (-not $processNames.ContainsKey($procKey)) {
                    $proc = Get-Process -Id $procKey -ErrorAction SilentlyContinue
                    $processNames[$procKey] = if ($proc) { $proc.ProcessName } else { "unknown" }
                }
                $procName = $processNames[$procKey]

                $frameRect = New-Object WinAPI+RECT
                [WinAPI]::DwmGetWindowAttribute($hwnd, [WinAPI]::DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$frameRect, [System.Runtime.InteropServices.Marshal]::SizeOf($frameRect)) | Out-Null

                $fw = $frameRect.Right - $frameRect.Left
                $fh = $frameRect.Bottom - $frameRect.Top

                if ($fw -gt 0 -and $fh -gt 0) {
                    $contentBounds = Get-ContentBounds $hwnd $procName

                    $isBrowser = $browsers -contains $procName.ToLower()

                    $result = [PSCustomObject]@{
                        id            = $hwnd.ToInt64().ToString()
                        title         = $title
                        process       = $procName
                        x             = $frameRect.Left
                        y             = $frameRect.Top
                        width         = $fw
                        height        = $fh
                        contentX      = if ($contentBounds) { $contentBounds.x }      else { $null }
                        contentY      = if ($contentBounds) { $contentBounds.y }      else { $null }
                        contentWidth  = if ($contentBounds) { $contentBounds.width }  else { $null }
                        contentHeight = if ($contentBounds) { $contentBounds.height } else { $null }
                        isBrowser     = $isBrowser
                        isForeground  = ($hwnd -eq $foreground)
                    }
                    $results += $result
                }
            } catch {}
        }
    }
    $hwnd = [WinAPI]::GetWindow($hwnd, $GW_HWNDNEXT)
}

$results | ConvertTo-Json -Compress
