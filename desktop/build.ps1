param(
    [string]$OutputName = 'PrettyCopyDesktop.exe'
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Join-Path $projectDir 'dist'
$outputPath = Join-Path $outputDir $OutputName
$compilerCandidates = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $compiler) {
    throw '未找到系统自带的 .NET Framework C# 编译器。'
}

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

& $compiler `
    /nologo `
    /target:winexe `
    /optimize+ `
    /platform:anycpu `
    /reference:System.dll `
    /reference:System.Core.dll `
    /reference:System.Drawing.dll `
    /reference:System.Windows.Forms.dll `
    "/out:$outputPath" `
    "$projectDir\PrettyCopyDesktop.cs"

if ($LASTEXITCODE -ne 0) {
    throw "编译失败，退出码 $LASTEXITCODE。"
}

Write-Output "已生成 $outputPath"
