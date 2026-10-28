# Estacao de impressao da termica (ROGERIA) - instalador do PC da impressora.
# Rodar UMA vez, no PC da ROGERIA, logado no Windows com o usuario que fica nele:
#   powershell -ExecutionPolicy Bypass -File instalar.ps1
#
# Cria C:\EstacaoImpressao com:
#   perfil\        perfil proprio do Chrome (separado do Chrome do usuario)
#   vigia.ps1      mantem o Chrome da estacao aberto (reabre em ate 30 s se fecharem)
#   configurar.ps1 abre a estacao NORMAL, na tela, para entrar no portal e escolher a impressora
#   voltar.ps1     volta ao modo estacao (escondido, imprimindo sem perguntar)
# e poe o vigia para iniciar com o Windows (pasta Inicializar) + 2 atalhos na Area de Trabalho.
#
# Parametros:
#   -Url       endereco da estacao (padrao: producao)
#   -Visivel   deixa a janela da estacao na tela (canto) em vez de fora da tela

param(
  [string]$Url = 'https://portal.novatratores.com/estacao-impressao',
  [switch]$Visivel
)

$ErrorActionPreference = 'Stop'
$base = 'C:\EstacaoImpressao'
New-Item -ItemType Directory -Force -Path $base | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $base 'perfil') | Out-Null

$candidatos = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw 'Google Chrome nao encontrado neste computador. Instale o Chrome e rode de novo.' }

if ($Visivel) { $posicao = '0,0'; $tamanho = '900,700' } else { $posicao = '-32000,-32000'; $tamanho = '900,700' }

# ---------- configuracao comum ----------
@"
`$chrome = '$chrome'
`$url = '$Url'
`$perfil = '$base\perfil'
`$posicao = '$posicao'
`$tamanho = '$tamanho'
function Get-ChromeEstacao {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { `$_.CommandLine -like '*EstacaoImpressao\perfil*' }
}
function Stop-ChromeEstacao {
  Get-ChromeEstacao | ForEach-Object { try { Stop-Process -Id `$_.ProcessId -Force -ErrorAction Stop } catch {} }
}
"@ | Set-Content -Path (Join-Path $base 'comum.ps1') -Encoding ASCII

# ---------- vigia: mantem a estacao aberta ----------
@'
. 'C:\EstacaoImpressao\comum.ps1'
$criado = $false
$trava = New-Object System.Threading.Mutex($true, 'Local\EstacaoImpressaoVigia', [ref]$criado)
if (-not $criado) { exit }   # ja tem um vigia rodando
$sinal = 'C:\EstacaoImpressao\configurando.txt'
while ($true) {
  $configurando = (Test-Path $sinal) -and (((Get-Date) - (Get-Item $sinal).LastWriteTime).TotalMinutes -lt 60)
  if (-not $configurando -and -not (Get-ChromeEstacao)) {
    $argumentos = @(
      "--user-data-dir=`"$perfil`"", "--app=$url", '--kiosk-printing',
      '--no-first-run', '--no-default-browser-check', '--hide-crash-restore-bubble',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
      "--window-position=$posicao", "--window-size=$tamanho"
    )
    Start-Process -FilePath $chrome -ArgumentList $argumentos
  }
  Start-Sleep -Seconds 30
}
'@ | Set-Content -Path (Join-Path $base 'vigia.ps1') -Encoding ASCII

# ---------- configurar: estacao normal, na tela, com dialogo de impressao ----------
@'
. 'C:\EstacaoImpressao\comum.ps1'
Set-Content -Path 'C:\EstacaoImpressao\configurando.txt' -Value (Get-Date) -Encoding ASCII
Stop-ChromeEstacao
Start-Sleep -Seconds 2
Start-Process -FilePath $chrome -ArgumentList @("--user-data-dir=`"$perfil`"", "--app=$url", '--no-first-run', '--no-default-browser-check', '--window-position=60,60', '--window-size=1100,800')
'@ | Set-Content -Path (Join-Path $base 'configurar.ps1') -Encoding ASCII

# ---------- voltar ao modo estacao ----------
@'
. 'C:\EstacaoImpressao\comum.ps1'
Remove-Item 'C:\EstacaoImpressao\configurando.txt' -ErrorAction SilentlyContinue
Stop-ChromeEstacao
'@ | Set-Content -Path (Join-Path $base 'voltar.ps1') -Encoding ASCII

# ---------- iniciar com o Windows (sem janela de console) ----------
$vbs = 'CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\EstacaoImpressao\vigia.ps1""", 0, False'
$inicializar = [Environment]::GetFolderPath('Startup')
Set-Content -Path (Join-Path $inicializar 'estacao-impressao.vbs') -Value $vbs -Encoding ASCII
Set-Content -Path (Join-Path $base 'iniciar-vigia.vbs') -Value $vbs -Encoding ASCII

# ---------- atalhos na Area de Trabalho ----------
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($a in @(
  @{ nome = 'Estacao de impressao - configurar'; arq = 'configurar.ps1' },
  @{ nome = 'Estacao de impressao - voltar ao modo estacao'; arq = 'voltar.ps1' }
)) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop ($a.nome + '.lnk')))
  $lnk.TargetPath = 'powershell.exe'
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$base\$($a.arq)`""
  $lnk.IconLocation = "$chrome,0"
  $lnk.Save()
}

# ---------- energia: nao suspender na tomada ----------
try {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Write-Host 'Energia: o computador nao suspende mais (na tomada).'
} catch {
  Write-Host 'Nao consegui mudar a energia - ajuste em Configuracoes > Energia: Suspender = Nunca.' -ForegroundColor Yellow
}

# ---------- 1a vez: ja abre no modo configurar ----------
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'configurar.ps1')
Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$base\iniciar-vigia.vbs`""

Write-Host ''
Write-Host 'Instalado. Agora, na janela do Chrome que abriu:' -ForegroundColor Green
Write-Host ' 1. Entre no portal (usuario com acesso as etiquetas).'
Write-Host ' 2. Clique em "Imprimir etiqueta de teste". Na janela de impressao escolha a ROGERIA,'
Write-Host '    margens Nenhuma, escala 100% e SEM cabecalhos e rodapes. Imprima.'
Write-Host ' 3. Saiu certa? De dois cliques no atalho "Estacao de impressao - voltar ao modo estacao".'
Write-Host '    Em ate 30 s a estacao volta escondida e passa a imprimir sem perguntar.'
