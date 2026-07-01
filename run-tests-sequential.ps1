$TestFiles = @(
    "tests/admin-categorias.spec.ts",
    "tests/admin-configuracoes-frete.spec.ts",
    "tests/admin-produtos.spec.ts",
    "tests/cart-journey.spec.ts",
    "tests/checkout-idempotency.spec.ts",
    "tests/checkout-pagamentos.spec.ts",
    "tests/cloud-cart.spec.ts",
    "tests/configuracoes-dinamicas.spec.ts",
    "tests/produtos-status.spec.ts",
    "tests/vitrine-produto.spec.ts"
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Iniciando execução sequencial estrita dos testes" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$failedTests = @()

foreach ($file in $TestFiles) {
    Write-Host ""
    Write-Host "▶ Executando suíte: $file ..." -ForegroundColor Yellow
    
    # Chama o Playwright travando a execução (Wait) para o próximo só começar quando este terminar
    $process = Start-Process -FilePath "npx.cmd" -ArgumentList "playwright test $file --workers=1" -Wait -NoNewWindow -PassThru
    
    if ($process.ExitCode -ne 0) {
        Write-Host "❌ [FALHA] A suíte $file encontrou erros." -ForegroundColor Red
        $failedTests += $file
    } else {
        Write-Host "✅ [SUCESSO] Suíte $file concluída." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Relatório Final da Execução" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if ($failedTests.Count -gt 0) {
    Write-Host "⚠️ As seguintes suítes apresentaram falhas:" -ForegroundColor Red
    foreach ($failed in $failedTests) {
        Write-Host " - $failed" -ForegroundColor Red
    }
} else {
    Write-Host "🎉 MARAVILHA! Todas as suítes passaram perfeitamente!" -ForegroundColor Green
}
