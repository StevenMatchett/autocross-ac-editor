# SPDX-License-Identifier: GPL-3.0-only
[CmdletBinding()]
param(
    [Parameter(Position = 0)] [string] $ExportPath = $PSScriptRoot,
    [switch] $Install,
    [string] $BlenderPath,
    [string] $ACPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Find-Blender {
    if ($BlenderPath) {
        $candidate = $BlenderPath
        if (Test-Path -LiteralPath $candidate -PathType Container) { $candidate = Join-Path $candidate 'blender.exe' }
        if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Blender executable not found: $candidate" }
        return (Resolve-Path -LiteralPath $candidate).Path
    }
    $command = Get-Command blender.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if (!$base) { continue }
        $vendor = Join-Path $base 'Blender Foundation'
        if (Test-Path -LiteralPath $vendor) {
            $candidates += @(Get-ChildItem -LiteralPath $vendor -Filter blender.exe -Recurse -File -ErrorAction SilentlyContinue)
        }
    }
    $candidate = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
    throw 'Blender was not found. Install Blender or pass -BlenderPath "C:\path\to\blender.exe".'
}

function Find-AssettoCorsa {
    if ($ACPath) {
        $root = (Resolve-Path -LiteralPath $ACPath).Path
        if (!(Test-Path -LiteralPath (Join-Path $root 'acs.exe') -PathType Leaf)) { throw "No acs.exe in AC path: $root" }
        return $root
    }
    $steamRoots = @()
    foreach ($entry in @(
        @{ Key = 'HKCU:\Software\Valve\Steam'; Value = 'SteamPath' },
        @{ Key = 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam'; Value = 'InstallPath' },
        @{ Key = 'HKLM:\SOFTWARE\Valve\Steam'; Value = 'InstallPath' }
    )) {
        $value = Get-ItemPropertyValue -LiteralPath $entry.Key -Name $entry.Value -ErrorAction SilentlyContinue
        if ($value -and (Test-Path -LiteralPath $value)) { $steamRoots += $value }
    }
    # HKCU is the active user's Steam installation; registry machine roots are fallbacks.
    $libraries = @()
    foreach ($root in ($steamRoots | Select-Object -Unique)) {
        $libraries += $root
        $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf) {
            $text = Get-Content -LiteralPath $vdf -Raw
            foreach ($match in [regex]::Matches($text, '"path"\s+"((?:\\.|[^"\\])*)"')) {
                $libraries += $match.Groups[1].Value.Replace('\\', '\').Replace('\"', '"')
            }
            # Older Steam libraryfolders.vdf stores paths directly under numeric keys.
            foreach ($match in [regex]::Matches($text, '"\d+"\s+"((?:\\.|[^"\\])*)"')) {
                $path = $match.Groups[1].Value.Replace('\\', '\')
                if ([IO.Path]::IsPathRooted($path)) { $libraries += $path }
            }
        }
    }
    foreach ($library in ($libraries | Select-Object -Unique)) {
        $manifest = Join-Path $library 'steamapps\appmanifest_244210.acf'
        if (!(Test-Path -LiteralPath $manifest)) { continue }
        $text = Get-Content -LiteralPath $manifest -Raw
        if ($text -notmatch '"appid"\s+"244210"') { continue }
        $match = [regex]::Match($text, '"installdir"\s+"([^"\r\n]+)"')
        if (!$match.Success) { continue }
        $name = $match.Groups[1].Value
        if ($name -match '[/\\]' -or $name -eq '.' -or $name -eq '..') { throw "Invalid Steam install directory in $manifest" }
        $root = Join-Path (Join-Path $library 'steamapps\common') $name
        if (Test-Path -LiteralPath (Join-Path $root 'acs.exe') -PathType Leaf) { return $root }
    }
    throw 'Assetto Corsa (Steam app 244210) was not found with acs.exe. Pass -ACPath "D:\SteamLibrary\steamapps\common\assettocorsa".'
}

try {
    $root = (Resolve-Path -LiteralPath $ExportPath).Path
    foreach ($file in @('build.json', 'build_track.py', 'direct_kn5.py', 'validate_track.py', 'layout.json')) {
        if (!(Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) { throw "Missing source export file: $file in $root" }
    }
    $slug = (Get-Content -LiteralPath (Join-Path $root 'build.json') -Raw | ConvertFrom-Json).slug
    if ($slug -notmatch '^[a-z0-9_]{1,32}$') { throw 'Invalid track slug in build.json.' }
    $destination = $null
    if ($Install) {
        $game = Find-AssettoCorsa
        $destination = Join-Path (Join-Path $game 'content\tracks') $slug
        if (Test-Path -LiteralPath $destination) { throw "Track already exists: $destination. Move or remove it yourself before installing this build." }
    }
    $blender = Find-Blender
    Write-Host "Building $slug with $blender"
    & $blender --background --python-exit-code 1 --python (Join-Path $root 'build_track.py')
    if ($LASTEXITCODE -ne 0) { throw "Blender build/validation failed (exit $LASTEXITCODE)." }
    $archive = Join-Path $root "$slug-install.zip"
    if (!(Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Build produced no installation ZIP: $archive" }
    Write-Host "Compiled and validated: $archive"
    if ($Install) {
        # Stage the ZIP first, then move the complete track; an existing destination
        # is never merged or overwritten, including if it appeared during the build.
        $parent = Split-Path -Parent $destination
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        $staging = Join-Path $parent ('.padwork-' + [Guid]::NewGuid().ToString('N'))
        try {
            Expand-Archive -LiteralPath $archive -DestinationPath $staging
            $source = Join-Path (Join-Path $staging 'content\tracks') $slug
            if (!(Test-Path -LiteralPath (Join-Path $source "$slug.kn5") -PathType Leaf)) { throw 'Installation ZIP contains no track KN5.' }
            if (Test-Path -LiteralPath $destination) { throw "Track already exists: $destination" }
            # Directory.Move fails if another process creates the destination.
            [IO.Directory]::Move($source, $destination)
            Write-Host "Installed: $destination"
        } finally {
            if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
        }
    }
    Write-Host 'Run the first-run Practice checklist: verify spawn, start/finish timing, and fixed-cone collisions in Assetto Corsa.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
