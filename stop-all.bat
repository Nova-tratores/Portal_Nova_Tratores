@echo off
echo Parando todos os sistemas...
taskkill /FI "WINDOWTITLE eq Portal*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Financeiro*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Requisicoes*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Revisoes*" /F 2>nul
taskkill /FI "WINDOWTITLE eq POS*" /F 2>nul
taskkill /FI "WINDOWTITLE eq PPV*" /F 2>nul
taskkill /FI "WINDOWTITLE eq Propostas*" /F 2>nul
echo Todos os sistemas foram parados.
pause
