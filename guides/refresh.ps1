# Refresh the EVE guides data from CCP and the EVE University Wiki.
#
# Safe to run repeatedly. It does not touch the curated Fractured Skies /
# event entries or the hand-written mining sites (Phased Field, SARO Ore
# Holding) - those are maintained in the data files directly.
#
# Usage:
#   .\refresh.ps1
#   .\refresh.ps1 -SkipMissions

param(
    [switch]$SkipMissions
)

$ErrorActionPreference = 'Stop'

$Guides = Split-Path -Parent $MyInvocation.MyCommand.Path
$Services = Split-Path -Parent $Guides
$Root = Split-Path -Parent $Services
$SdeUpdater = Join-Path $Root 'SDE updater'
$Tracker = Join-Path $Root 'SDE tracker'
$Scrape = Join-Path $Guides 'scrape'

function Step([int]$number, [string]$text) {
    Write-Host "`n[$number] $text" -ForegroundColor Cyan
}

function Invoke-Node([string]$workingDirectory, [string[]]$arguments) {
    Push-Location $workingDirectory
    try {
        & node @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "node $($arguments -join ' ') failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

Step 1 'Updating the EVE SDE'
Invoke-Node $SdeUpdater @('update-sde.mjs', '--source', 'api')

Step 2 'Updating the SDE tracker and regenerating the guides audit'
Invoke-Node $Tracker @('tracker.mjs')
Invoke-Node $Tracker @('audit-guides.mjs')

Step 3 'Scraping EVE University Wiki site pages'
Invoke-Node $Scrape @('fetch-uniwiki-sites.js')

Step 4 'Refreshing anomaly detail data (info, descriptions, spawns)'
Invoke-Node $Scrape @('merge-uniwiki-sites.js', '--apply', '--refresh')

if (-not $SkipMissions) {
    Step 5 'Refreshing the mission list from EVE-Survival'
    Invoke-Node $Scrape @('fetch-missions.js')
} else {
    Step 5 'Skipping the mission list refresh (-SkipMissions)'
}

Step 6 'Writing data freshness metadata'
$statePath = Join-Path $SdeUpdater 'state.json'
$uniwikiPath = Join-Path $Guides 'data\uniwiki-sites.json'
$state = Get-Content $statePath -Raw | ConvertFrom-Json
$uniwiki = Get-Content $uniwikiPath -Raw | ConvertFrom-Json
$payload = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    sdeBuild = [string]$state.buildNumber
    sdeReleasedAt = [string]$state.releaseDate
    uniwikiScrapedAt = [string]$uniwiki._meta.generatedAt
    sources = @(
        'CCP SDE build ' + [string]$state.buildNumber,
        'EVE University Wiki (CC BY-SA 4.0)',
        'EVE-Survival (classic mission data)',
        'wiki.erst.live Fractured Skies shelf',
        'CCP patch notes (latest version)'
    )
}
$payload | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Guides 'data\last-updated.json') -Encoding utf8

Write-Host "`nDone. Review data\uniwiki-merge-report.json and SDE tracker\site-audit.md for anything that needs manual attention." -ForegroundColor Green
