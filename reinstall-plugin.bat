@echo off
setlocal
powershell -NoProfile -Command "$c = Get-Content -LiteralPath '%~f0' -Raw -Encoding UTF8; $m = $c.LastIndexOf('#__POWERSHELL__#'); if ($m -lt 0) { Write-Host 'ERROR: script body marker not found' -ForegroundColor Red; exit 1 }; Invoke-Expression ($c.Substring($m + 16))"
exit /b %ERRORLEVEL%
#__POWERSHELL__#
# ============================================================================
#  math-input 插件自恢复脚本
#
#  用途：Typora 自动更新会重写 resources\ 目录，抹掉 window.html 中的
#        插件 loader 注入，导致插件"失效"。双击本文件即可重新注入。
#
#  特性：幂等（已注入则跳过）、自动定位 Typora、非交互、无需管理员权限
#        （per-user 安装）；若为 Program Files 安装请右键"以管理员身份运行"。
# ============================================================================
$ErrorActionPreference = 'Stop'

function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "[--] $msg" -ForegroundColor DarkGray }
function Write-Fail($msg) { Write-Host "[!!] $msg" -ForegroundColor Red }

# ---- 0. Typora 必须处于关闭状态（否则写 window.html 可能被占用/回写覆盖） ----
if (Get-Process -Name Typora -ErrorAction SilentlyContinue) {
    Write-Fail "Typora 正在运行。请先关闭所有 Typora 窗口，再双击本脚本。"
    exit 1
}

# ---- 1. 定位 Typora 安装目录（注册表 -> 常见路径候选） ----
$typoraHome = $null
$uninstallPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)
foreach ($path in $uninstallPaths) {
    Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        if (-not $typoraHome -and $props.DisplayName -like "*Typora*" -and $props.InstallLocation) {
            $typoraHome = $props.InstallLocation
        }
    }
}
if (-not $typoraHome -or -not (Test-Path (Join-Path $typoraHome 'Typora.exe'))) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Typora",
        "$env:ProgramFiles\Typora",
        "${env:ProgramFiles(x86)}\Typora",
        "$env:USERPROFILE\scoop\apps\typora\current"
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c 'Typora.exe')) { $typoraHome = $c; break }
    }
}
if (-not $typoraHome) {
    Write-Fail "未找到 Typora 安装目录。"
    exit 1
}
Write-Ok "Typora 安装目录: $typoraHome"

# ---- 2. 定位 window.html ----
$htmlPath = $null
foreach ($p in @("$typoraHome\resources\window.html",
                 "$typoraHome\resources\app\window.html",
                 "$typoraHome\resources\appsrc\window.html")) {
    if (Test-Path $p) { $htmlPath = $p; break }
}
if (-not $htmlPath) {
    Write-Fail "未找到 window.html（resources\ 下），当前 Typora 版本可能不兼容。"
    exit 1
}

# ---- 3. 写权限检测 ----
try {
    $testFile = Join-Path (Split-Path $htmlPath) '.math-input-write-test'
    [System.IO.File]::WriteAllText($testFile, 'test')
    Remove-Item $testFile -Force
} catch {
    Write-Fail "没有写入权限: $htmlPath"
    Write-Host "    请右键本 bat -> 以管理员身份运行。" -ForegroundColor Yellow
    exit 1
}

# ---- 4. 注入 loader（幂等） ----
$html = Get-Content $htmlPath -Raw -Encoding UTF8
$loaderPattern = '(?is)<script\b[^>]*\bsrc\s*=\s*["'']typora://(?:app/)?userData/plugins/loader\.js["''][^>]*></script>'
if ($html -match $loaderPattern) {
    Write-Skip "window.html 已包含 loader 注入，无需修改。"
} else {
    $m = [regex]::Match($html, 'typora://(?:app/)?userData')
    if (-not $m.Success) {
        Write-Fail "window.html 中未找到 typora://userData scheme，无法安全注入。"
        exit 1
    }
    $inject = '<script src="' + $m.Value + '/plugins/loader.js" type="module"></script>'
    Copy-Item $htmlPath "$htmlPath.math-input.bak" -Force
    if ($html -match '</body></html>\s*$') {
        $html = [regex]::Replace($html, '</body></html>\s*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($mm) $inject + '</body></html>' })
    } else {
        $html = $html + "`n" + $inject
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $False
    [System.IO.File]::WriteAllText($htmlPath, $html, $utf8NoBom)
    Write-Ok "已向 window.html 注入 loader（备份: window.html.math-input.bak）"
}

# ---- 5. 校验插件用户文件（不修改，仅提示） ----
$pluginsDir = "$env:APPDATA\Typora\plugins"
$missing = @()
if (-not (Test-Path "$pluginsDir\loader.js"))                      { $missing += 'loader.js' }
if (-not (Test-Path "$pluginsDir\settings\plugins.json"))          { $missing += 'settings\plugins.json' }
if (-not (Test-Path "$pluginsDir\plugins\math-input\main.js"))     { $missing += 'plugins\math-input\' }
if ($missing.Count) {
    Write-Fail ("插件用户文件缺失: " + ($missing -join ', '))
    Write-Host "    请从仓库重新下载插件文件到 $pluginsDir" -ForegroundColor Yellow
    exit 1
}
Write-Ok "插件用户文件齐全。"

Write-Host ""
Write-Ok "完成。重新打开 Typora，math-input 插件即恢复。"
exit 0
