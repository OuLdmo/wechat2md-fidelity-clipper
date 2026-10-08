# Publish WeChat Fidelity Clipper v0.3.0 from Windows PowerShell.
# Interactive GitHub login happens through 'gh auth login', not this script.
param(
    [string] $RepoName = 'wechat-fidelity-clipper',
    [switch] $Public,
    [switch] $SkipRelease
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Check-Exit([string] $Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit=$LASTEXITCODE)" }
}

foreach ($exe in @('git','gh')) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
        throw "Missing $exe. Install Git and GitHub CLI first (see PUBLISH_GITHUB.md)."
    }
}
& gh auth status
Check-Exit 'GitHub login check'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
    if (-not (Test-Path 'manifest.json')) { throw 'Run from the project root (manifest.json required).' }
    if (-not ($RepoName -match '^[A-Za-z0-9_.-]+$')) { throw 'Invalid GitHub repo name.' }
    $login = ((& gh api user --jq '.login') | Out-String).Trim()
    Check-Exit 'Get authenticated GitHub account'
    if (-not $login) { throw 'Cannot find GitHub username.' }
    $fullName = "$login/$RepoName"

    # Never silently upload to an existing repo or overwrite a release.
    & gh repo view $fullName --json name --jq '.name' *> $null
    if ($LASTEXITCODE -eq 0) { throw "Repository $fullName already exists; refusing to overwrite." }
    if (Test-Path '.git') { throw 'This folder already has Git history; publish from a fresh extracted folder.' }

    $name = (& git config user.name | Out-String).Trim()
    $email = (& git config user.email | Out-String).Trim()
    if (-not $name -or -not $email) {
        throw 'Configure git user.name and user.email first (see PUBLISH_GITHUB.md).'
    }

    & git init -b main
    Check-Exit 'Initialize repository'
    & git add -A
    Check-Exit 'Stage project files'
    & git commit -m 'Initial v0.3.0 release candidate'
    Check-Exit 'Commit project files'

    $description='WeChat articles to Markdown/PDF: image links, inline images, ZIP, OCR, layout fallback and preview.'
    $visibility=if ($Public) { '--public' } else { '--private' }
    & gh repo create $RepoName $visibility --source . --remote origin --push --description $description
    Check-Exit 'Create GitHub repository and push main'

    & gh repo edit $fullName --add-topic wechat --add-topic markdown --add-topic chrome-extension --add-topic web-clipper --add-topic pdf --add-topic ocr --add-topic edge-extension
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Repository created, but topics could not be configured.' }

    if (-not $SkipRelease) {
        $asset=Join-Path $root 'release-assets/wechat-fidelity-clipper-v0.3.0.zip'
        if (-not (Test-Path $asset)) { throw 'Release asset missing: release-assets/wechat-fidelity-clipper-v0.3.0.zip' }
        & gh release create 'v0.3.0' $asset --repo $fullName --title 'WeChat Fidelity Clipper v0.3.0' --notes-file 'RELEASE_NOTES.md'
        Check-Exit 'Create GitHub release with installer ZIP'
    }
    Write-Host "Published: https://github.com/$fullName"
    if (-not $SkipRelease) { Write-Host "Release: https://github.com/$fullName/releases/tag/v0.3.0" }
}
finally { Pop-Location }
