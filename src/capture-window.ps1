param(
    [Parameter(Mandatory = $true)][long]$Hwnd,
    [Parameter(Mandatory = $true)][string]$OutPath
)

# Force UTF-8 on stdout for the JSON status line.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Cap {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int c);
    public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

# Physical pixels on scaled displays — must match list-windows.ps1 coordinates.
if (-not [Cap]::SetProcessDpiAwarenessContext([IntPtr](-4))) {
    [Cap]::SetProcessDPIAware() | Out-Null
}

function Emit($obj) {
    $obj | ConvertTo-Json -Compress
}

try {
    $h = [IntPtr]$Hwnd

    if ([Cap]::IsIconic($h)) { throw "window is minimized" }

    $r = New-Object Cap+RECT
    if (-not [Cap]::GetWindowRect($h, [ref]$r)) { throw "GetWindowRect failed" }
    $w = $r.Right - $r.Left
    $hgt = $r.Bottom - $r.Top
    if ($w -le 0 -or $hgt -le 0 -or $w -gt 16384 -or $hgt -gt 16384) { throw "invalid window rect ${w}x${hgt}" }

    $screenDc = [Cap]::GetDC([IntPtr]::Zero)
    $memDc = [Cap]::CreateCompatibleDC($screenDc)
    $bmp = [Cap]::CreateCompatibleBitmap($screenDc, $w, $hgt)
    $old = [Cap]::SelectObject($memDc, $bmp)
    $saved = $false

    try {
        # PW_RENDERFULLCONTENT (2) captures DWM-composited content (browsers, modern apps).
        # Fall back to classic GDI rendering (0) for legacy apps.
        $ok = [Cap]::PrintWindow($h, $memDc, 2)
        if (-not $ok) { $ok = [Cap]::PrintWindow($h, $memDc, 0) }
        if (-not $ok) { throw "PrintWindow failed" }

        $img = [System.Drawing.Image]::FromHbitmap($bmp, [IntPtr]::Zero)
        try {
            # GetWindowRect includes invisible resize borders; crop to the visible
            # DWM extended frame bounds so output matches the on-screen window.
            $f = New-Object Cap+RECT
            if ([Cap]::DwmGetWindowAttribute($h, 9, [ref]$f, [System.Runtime.InteropServices.Marshal]::SizeOf($f)) -eq 0) {
                $fx = $f.Left - $r.Left
                $fy = $f.Top - $r.Top
                $fw = $f.Right - $f.Left
                $fh = $f.Bottom - $f.Top
                if ($fx -ge 0 -and $fy -ge 0 -and $fw -gt 0 -and $fh -gt 0 -and ($fx + $fw) -le $img.Width -and ($fy + $fh) -le $img.Height) {
                    $rect = New-Object System.Drawing.Rectangle($fx, $fy, $fw, $fh)
                    $cropped = $img.Clone($rect, $img.PixelFormat)
                    $img.Dispose()
                    $img = $cropped
                }
            }

            $img.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
            $saved = $true
            Emit @{ ok = $true; width = $img.Width; height = $img.Height }
        }
        finally {
            if ($saved) { $img.Dispose() }
        }
    }
    finally {
        [Cap]::SelectObject($memDc, $old) | Out-Null
        [Cap]::DeleteObject($bmp) | Out-Null
        [Cap]::DeleteDC($memDc) | Out-Null
        [Cap]::ReleaseDC([IntPtr]::Zero, $screenDc) | Out-Null
    }
}
catch {
    Emit @{ ok = $false; error = "$_" }
}
