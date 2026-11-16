# Rebuild unpushed commit messages without the Cursor co-author trailer.
# Does not run git commit or amend (Cursor would re-append attribution).
# Usage: pwsh -File scripts/strip-cursor-coauthor-history.ps1
# Optional: -FirstBad 08ce224  (first commit that has or follows the bad trailer)

param(
  [string] $FirstBad = "08ce224"
)

$ErrorActionPreference = "Stop"
Set-Location (git rev-parse --show-toplevel)

$trailerPattern = '^\s*Co-authored-by:\s*Cursor\s*<cursoragent@cursor.com>\s*$'
$start = (git rev-parse "${FirstBad}^").Trim()
$branch = (git branch --show-current).Trim()
if (-not $branch) { throw "Detached HEAD; checkout a branch first." }

$upstream = $null
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$upstreamCheck = (git rev-parse --abbrev-ref '@{u}' 2>&1 | Out-String).Trim()
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -eq 0 -and $upstreamCheck -and $upstreamCheck -notmatch '^fatal:') {
  $upstream = $upstreamCheck
  $ahead = [int](git rev-list --count "${upstream}..HEAD")
  $behind = [int](git rev-list --count "HEAD..${upstream}")
  if ($behind -gt 0) {
    throw "Branch is behind ${upstream}. Pull or rebase before rewriting."
  }
  Write-Host "Branch is ${ahead} commit(s) ahead of ${upstream}."
}

$commits = @(git rev-list --reverse "${start}..HEAD")
if ($commits.Count -eq 0) { Write-Host "Nothing to rewrite."; exit 0 }

$parent = $start
$gitDir = (git rev-parse --git-dir).Trim()
$msgPath = Join-Path $gitDir "COMMIT_MSG_REWRITE.txt"

foreach ($c in $commits) {
  $tree = (git rev-parse "${c}^{tree}").Trim()
  $raw = git log -1 --format=%B $c
  $clean = (($raw -split "`r?`n") | Where-Object { $_ -notmatch $trailerPattern }) -join "`n"
  $clean = $clean.TrimEnd() + "`n"
  [System.IO.File]::WriteAllText($msgPath, $clean)
  $new = (git commit-tree $tree -p $parent -F $msgPath).Trim()
  if ($new -notmatch '^[0-9a-f]{40}$') {
    throw "commit-tree failed for $c (got: $new)"
  }
  $parent = $new
}

git update-ref "refs/heads/$branch" $parent
Remove-Item -Force $msgPath -ErrorAction SilentlyContinue

Write-Host "Rewrote $($commits.Count) commits on ${branch}. New HEAD: $parent"
Write-Host "Verify:"
Write-Host '  git log --format=%B -n 20 | Select-String Cursor'