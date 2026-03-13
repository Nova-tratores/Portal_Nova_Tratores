@echo off
echo ============================================
echo    NOVA TRATORES - Portal Corporativo
echo    Iniciando todos os sistemas...
echo ============================================
echo.

echo [PORTAL]       localhost:3000
start "Portal" cmd /c "cd /d C:\projetos\portal && npm run dev"

timeout /t 3 >nul

echo [FINANCEIRO]   localhost:3001
start "Financeiro" cmd /c "cd /d C:\projetos\sistema-financeiro && npm run dev"

echo [REQUISICOES]  localhost:3002
start "Requisicoes" cmd /c "cd /d C:\projetos\app-requisicoes && npm run dev"

echo [REVISOES]     localhost:3003
start "Revisoes" cmd /c "cd /d C:\projetos\controle-revisao\controle-revisao && npm run dev"

echo [POS]          localhost:3004
start "POS" cmd /c "cd /d C:\projetos\pos\pos && npm run dev"

echo [PPV]          localhost:3005
start "PPV" cmd /c "cd /d C:\projetos\ppv\ppv && npm run dev"

echo [PROPOSTAS]    localhost:5173
start "Propostas" cmd /c "cd /d C:\projetos\proposta-comercial && npm run dev"

echo.
echo ============================================
echo    Todos os sistemas iniciados!
echo    Acesse: http://localhost:3000
echo ============================================
echo.
pause
