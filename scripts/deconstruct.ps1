# Deconstruct all raw games for a player in batches, with progress feedback.
# Usage: .\scripts\deconstruct.ps1
# Usage: .\scripts\deconstruct.ps1 -Player stricade -BatchSize 200 -Port 3020

param(
    [string]$Player    = 'stricade',
    [int]   $BatchSize = 500,
    [int]   $Port      = 3020
)

$url      = "http://localhost:$Port/api/analysis/deconstruct?player=$Player&limit=$BatchSize&onebatch=1"
$total    = 0
$errors   = 0
$batch    = 0
$start    = Get-Date

Write-Host "Deconstructing games for '$Player' (batch size $BatchSize)..." -ForegroundColor Cyan

while ($true) {
    $batch++
    try {
        $res       = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 120
        $processed = $res.results[0].processed
        $batchErr  = $res.results[0].errors
        $total    += $processed
        $errors   += $batchErr
        $elapsed   = [math]::Round(((Get-Date) - $start).TotalSeconds)

        if ($processed -eq 0 -and $batchErr -eq 0) {
            Write-Host "`nDone. Total processed: $total  Errors: $errors  Time: ${elapsed}s" -ForegroundColor Green
            break
        }

        Write-Host "Batch $batch : +$processed games  (total $total  errors $errors  ${elapsed}s)"

        if ($processed -eq 0 -and $batchErr -gt 0) {
            Write-Host "Stopping - batch returned only errors. Run again to retry." -ForegroundColor Yellow
            break
        }
    } catch {
        Write-Host "Request failed: $_" -ForegroundColor Red
        break
    }
}
