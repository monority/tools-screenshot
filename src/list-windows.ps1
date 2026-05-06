Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
    public struct RECT { public int Left, Top, Right, Bottom; }
    public struct POINT { public int X, Y; }
    public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    public const uint GW_CHILD = 5;
    public const uint GW_HWNDNEXT = 2;
}
"@

function Get-ContentBounds($hwnd, $procName) {
    $contentClasses = @{
        'firefox' = @('MozillaCompositorWindowClass', 'MozillaWindowClass')
        'chrome'  = @('Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1')
        'msedge'  = @('Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1')
        'brave'   = @('Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1')
        'opera'   = @('Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1')
        'vivaldi' = @('Chrome_RenderWidgetHostHWND', 'Chrome_WidgetWin_1')
    }

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

                $frameRect = New-Object WinAPI+RECT
                [WinAPI]::DwmGetWindowAttribute($hwnd, [WinAPI]::DWMWA_EXTENDED_FRAME_BOUNDS, [ref]$frameRect, [System.Runtime.InteropServices.Marshal]::SizeOf($frameRect)) | Out-Null

                $fw = $frameRect.Right - $frameRect.Left
                $fh = $frameRect.Bottom - $frameRect.Top

                if ($fw -gt 0 -and $fh -gt 0) {
                    $contentBounds = Get-ContentBounds $hwnd $procName

                    $isBrowser = @('firefox', 'chrome', 'msedge', 'brave', 'opera', 'vivaldi', 'arc') -contains $procName.ToLower()

                    $result = [PSCustomObject]@{
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
                    }
                    $results += $result
                }
            } catch {}
        }
    }
    $hwnd = [WinAPI]::GetWindow($hwnd, $GW_HWNDNEXT)
}

$results | ConvertTo-Json -Compress
