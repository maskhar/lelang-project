param(
  [Parameter(Mandatory = $true)][string]$SshTarget,
  [string]$Container = 'postgres'
)
$ErrorActionPreference = 'Stop'
if ($Container -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid container name.' }
if ($SshTarget -notmatch '^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$') { throw 'Use user@host.' }
$workspace = Split-Path $PSScriptRoot -Parent
$database = 'lelang_verify_' + [guid]::NewGuid().ToString('N')
$created = $false
$sshOptions = @('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', $SshTarget)

function Invoke-DatabaseSql([string]$DatabaseName, [string]$Sql) {
  $Sql | & ssh @sshOptions "docker exec -i $Container psql -U postgres -d $DatabaseName -X -v ON_ERROR_STOP=1"
  if ($LASTEXITCODE -ne 0) { throw "Database verification failed: $DatabaseName" }
}

try {
  Invoke-DatabaseSql 'postgres' "CREATE DATABASE $database TEMPLATE template0;"
  $created = $true
  $journal = Get-Content -LiteralPath (Join-Path $workspace 'drizzle/meta/_journal.json') -Raw | ConvertFrom-Json
  foreach ($entry in $journal.entries) {
    if ($entry.tag -notmatch '^[A-Za-z0-9_-]+$') { throw 'Invalid migration filename.' }
    $migration = Join-Path $workspace ('drizzle/' + $entry.tag + '.sql')
    Invoke-DatabaseSql $database ("BEGIN;`n" + (Get-Content -LiteralPath $migration -Raw) + "`nCOMMIT;")
  }
  Invoke-DatabaseSql $database (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verify-database.sql') -Raw)
  Write-Output 'PASS: migration SQL and database constraints verified.'
} finally {
  if ($created) {
    Invoke-DatabaseSql 'postgres' "DROP DATABASE $database;"
    Write-Output "Temporary database removed: $database"
  }
}
