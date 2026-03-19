$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2

    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()

    return $path
}

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "build"
$pngPath = Join-Path $buildDir "icon.png"
$icoPath = Join-Path $buildDir "icon.ico"
$icnsPath = Join-Path $buildDir "icon.icns"
$icoTempDir = Join-Path $buildDir ".icon-ico"
$icnsTempDir = Join-Path $buildDir ".icon-icns"
$appBuilder = Join-Path $root "node_modules\app-builder-bin\win\x64\app-builder.exe"

$size = 1024
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$canvasPath = New-RoundedRectanglePath -X 80 -Y 80 -Width 864 -Height 864 -Radius 220
$backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point -ArgumentList 80, 80),
    (New-Object System.Drawing.Point -ArgumentList 944, 944),
    ([System.Drawing.ColorTranslator]::FromHtml("#0B1320")),
    ([System.Drawing.ColorTranslator]::FromHtml("#122235"))
)
$graphics.FillPath($backgroundBrush, $canvasPath)

$highlightBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($canvasPath)
$highlightBrush.CenterColor = [System.Drawing.Color]::FromArgb(58, 162, 223, 255)
$highlightBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 162, 223, 255))
$graphics.FillEllipse($highlightBrush, 110, 95, 760, 430)

$glowRect = New-Object System.Drawing.RectangleF -ArgumentList 146, 142, 732, 732
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse($glowRect)
$glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
$glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(46, 63, 198, 255)
$glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 63, 198, 255))
$graphics.FillEllipse($glowBrush, $glowRect)

$ringPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$ringPath.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
$ringPath.AddEllipse(244, 228, 536, 536)
$ringPath.AddEllipse(346, 330, 332, 332)
$ringBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point -ArgumentList 300, 250),
    (New-Object System.Drawing.Point -ArgumentList 760, 760),
    ([System.Drawing.ColorTranslator]::FromHtml("#89E7FF")),
    ([System.Drawing.ColorTranslator]::FromHtml("#43B9F6"))
)
$graphics.FillPath($ringBrush, $ringPath)

$ringHighlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 255, 255, 255), 16)
$graphics.DrawArc($ringHighlightPen, 262, 246, 500, 500, 212, 106)

$tailPen = New-Object System.Drawing.Pen($ringBrush, 96)
$tailPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$tailPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($tailPen, 618, 620, 782, 784)

$tailHighlightPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(72, 255, 255, 255), 18)
$tailHighlightPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$tailHighlightPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($tailHighlightPen, 596, 598, 700, 702)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(52, 170, 220, 255), 6)
$graphics.DrawPath($borderPen, $canvasPath)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
$backgroundBrush.Dispose()
$highlightBrush.Dispose()
$glowBrush.Dispose()
$glowPath.Dispose()
$ringBrush.Dispose()
$ringPath.Dispose()
$ringHighlightPen.Dispose()
$tailPen.Dispose()
$tailHighlightPen.Dispose()
$borderPen.Dispose()
$canvasPath.Dispose()

if (Test-Path $appBuilder) {
    if (Test-Path $icoPath) {
        Remove-Item $icoPath -Recurse -Force
    }
    if (Test-Path $icnsPath) {
        Remove-Item $icnsPath -Recurse -Force
    }
    if (Test-Path $icoTempDir) {
        Remove-Item $icoTempDir -Recurse -Force
    }
    if (Test-Path $icnsTempDir) {
        Remove-Item $icnsTempDir -Recurse -Force
    }

    & $appBuilder icon --input $pngPath --format ico --out $icoTempDir
    & $appBuilder icon --input $pngPath --format icns --out $icnsTempDir

    Copy-Item (Join-Path $icoTempDir "icon.ico") $icoPath -Force
    Copy-Item (Join-Path $icnsTempDir "icon.icns") $icnsPath -Force

    Remove-Item $icoTempDir -Recurse -Force
    Remove-Item $icnsTempDir -Recurse -Force
}
else {
    throw "app-builder executable not found at $appBuilder"
}

Write-Host "Generated:"
Write-Host " - $pngPath"
Write-Host " - $icoPath"
Write-Host " - $icnsPath"
