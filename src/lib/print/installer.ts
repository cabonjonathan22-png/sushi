/**
 * Installateur Windows du poste d'impression : UN fichier « .cmd » à double-cliquer,
 * sans logiciel à installer (PowerShell est fourni avec Windows 10 et 11).
 *
 * Avec l'accord de Windows (« Oui ») : tâche planifiée au démarrage, sous le compte système,
 * donc active même sans session ouverte (redémarrage après une mise à jour). Sinon : démarrage
 * à l'ouverture de la session. Mise en veille sur secteur désactivée dans les deux cas.
 * En mode système, installe aussi RustDesk (accès à distance de maintenance, service Windows)
 * et envoie son n° et son mot de passe au back-office (chiffré, visible du propriétaire). L'agent interroge le site
 * toutes les 3 secondes, cherche lui-même les imprimantes du réseau (port 9100) et les signale
 * au back-office, où l'on choisit l'imprimante et lance un ticket d'essai — à distance.
 *
 * Les scripts PowerShell évitent l'accent grave (caractère d'échappement PowerShell)
 * pour rester de simples chaînes JavaScript.
 */

export const AGENT_VERSION = "1.3";

const INSTALL = String.raw`
$ErrorActionPreference = 'Stop'
$url = '__URL__'
$exe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$nl = [Environment]::NewLine
function Show-Box([string]$text, [string]$icon) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($text, 'Impression Yaoma', 'OK', $icon) | Out-Null
}
function Stop-OldAgents {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*YaomaImpression*agent.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Write-AgentFiles([string]$dir) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  [IO.File]::WriteAllText((Join-Path $dir 'agent.ps1'), $parts[2], (New-Object Text.UTF8Encoding $true))
  [IO.File]::WriteAllText((Join-Path $dir 'adresse.txt'), $url)
  return ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $dir 'agent.ps1') + '"')
}
# Accès à distance pour la maintenance (RustDesk, gratuit) : installé comme service Windows,
# il redémarre tout seul avec l'ordinateur. Son n° et son mot de passe sont envoyés au back-office.
function Install-RemoteAccess {
  $rd = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
  if (-not (Test-Path $rd)) {
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/rustdesk/rustdesk/releases/latest' -UseBasicParsing -Headers @{ 'User-Agent' = 'yaoma-installer' }
    $asset = $release.assets | Where-Object { $_.name -match '^rustdesk-[0-9.]+-x86_64\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw 'RustDesk introuvable' }
    $setup = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $setup -UseBasicParsing
    Start-Process -FilePath $setup -ArgumentList '--silent-install'
    for ($i = 0; $i -lt 60 -and -not (Test-Path $rd); $i++) { Start-Sleep -Seconds 2 }
    Start-Sleep -Seconds 10
    # Repère : RustDesk installé par nous, donc retiré par « Désinstaller du PC ».
    [IO.File]::WriteAllText((Join-Path $env:ProgramData 'YaomaImpression\rustdesk-par-yaoma.txt'), (Get-Date -Format 's'))
  }
  if (-not (Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $rd -ArgumentList '--install-service' -Wait
    Start-Sleep -Seconds 10
  }
  Set-Service -Name 'RustDesk' -StartupType Automatic -ErrorAction SilentlyContinue
  $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'.ToCharArray()
  $password = -join (1..14 | ForEach-Object { $chars | Get-Random })
  & $rd --password $password | Out-Null
  $id = ''
  for ($i = 0; $i -lt 10 -and -not $id; $i++) { $id = ((& $rd --get-id | Out-String).Trim()) -replace '\s', ''; if (-not $id) { Start-Sleep -Seconds 3 } }
  if (-not $id) { throw 'n° RustDesk non disponible' }
  $body = @{ report = @{ remote = @{ tool = 'RustDesk'; id = $id; password = $password; host = $env:COMPUTERNAME } } } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Uri $url -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json' -UseBasicParsing | Out-Null
}

$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Impression Yaoma.lnk'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# Pas encore administrateur : relance avec la confirmation Windows (« Oui »), pour démarrer
# avec Windows même sans ouvrir de session (redémarrage après une mise à jour, une coupure…).
if (-not $isAdmin) {
  try {
    Start-Process -FilePath $self -Verb RunAs
    exit
  } catch { }
}

$mode = 'user'
try {
  if ($isAdmin) {
    try {
      $arguments = Write-AgentFiles (Join-Path $env:ProgramData 'YaomaImpression')
      $action = New-ScheduledTaskAction -Execute $exe -Argument $arguments
      $trigger = New-ScheduledTaskTrigger -AtStartup
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
      $system = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
      Register-ScheduledTask -TaskName 'Impression Yaoma' -Action $action -Trigger $trigger -Settings $settings -Principal $system -Force | Out-Null
      Stop-OldAgents
      if (Test-Path $startupLink) { Remove-Item $startupLink -Force }
      Start-ScheduledTask -TaskName 'Impression Yaoma'
      $remote = 'ok'
      try { Install-RemoteAccess } catch { $remote = $_.Exception.Message }
      powercfg /change standby-timeout-ac 0 2>$null | Out-Null
      powercfg /change hibernate-timeout-ac 0 2>$null | Out-Null
      $mode = 'system'
    } catch { $mode = 'user' }
  }
  if ($mode -eq 'user') {
    # Sans droits administrateur : démarrage à l'ouverture de la session Windows.
    $arguments = Write-AgentFiles (Join-Path $env:LOCALAPPDATA 'YaomaImpression')
    Stop-OldAgents
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($startupLink)
    $link.TargetPath = $exe
    $link.Arguments = $arguments
    $link.WindowStyle = 7
    $link.Save()
    Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden
    powercfg /change standby-timeout-ac 0 2>$null | Out-Null
  }
  if ($mode -eq 'system') {
    $remoteLine = 'L''accès à distance pour la maintenance est installé.'
    if ($remote -ne 'ok') { $remoteLine = 'L''accès à distance n''a pas pu être installé (' + $remote + ') : prévenez Jonathan.' }
    Show-Box ('Le poste d''impression est installé.' + $nl + $nl + $remoteLine + $nl + $nl + 'Tout démarre seul avec l''ordinateur, même sans ouvrir de session Windows. Laissez cet ordinateur allumé et branché à la box.' + $nl + $nl + 'Vous pouvez fermer cette fenêtre : la suite se règle à distance.') 'Information'
  } else {
    Show-Box ('Le poste d''impression est installé, en mode limité.' + $nl + $nl + 'Il ne démarre que lorsque la session Windows est ouverte. Pour qu''il démarre tout seul, relancez l''installation et répondez « Oui » à la question de Windows.') 'Warning'
  }
} catch {
  Show-Box ('Installation impossible : ' + $_.Exception.Message) 'Error'
}
`;

const AGENT = String.raw`
# Poste d'impression Yaoma : va chercher les tickets sur le site et les envoie à l'imprimante réseau.
$ErrorActionPreference = 'Stop'
$Version = '__VERSION__'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = ([IO.File]::ReadAllText((Join-Path $dir 'adresse.txt'))).Trim()
$log = Join-Path $dir 'journal.txt'
$first = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\YaomaImpression', [ref]$first)
if (-not $first) { exit }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

function Write-Log([string]$m) {
  try {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Remove-Item $log -Force }
    Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $m) -Encoding UTF8
  } catch {}
}

function Invoke-Site([string]$method, $body) {
  $p = @{ Uri = $url; Method = $method; TimeoutSec = 20; UseBasicParsing = $true; Headers = @{ 'X-Agent' = ('yaoma-ps/' + $Version) } }
  if ($body) { $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6 -Compress)); $p.ContentType = 'application/json' }
  return Invoke-RestMethod @p
}

function Send-Printer([string]$address, [byte[]]$bytes) {
  $hostPart = $address.Split(':')[0]
  $port = 9100
  if ($address.Contains(':')) { $port = [int]$address.Split(':')[1] }
  $client = New-Object Net.Sockets.TcpClient
  try {
    $pending = $client.BeginConnect($hostPart, $port, $null, $null)
    if (-not $pending.AsyncWaitHandle.WaitOne(5000)) { throw ('Imprimante ' + $address + ' injoignable (éteinte, débranchée ou adresse changée)') }
    $client.EndConnect($pending)
    $stream = $client.GetStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    Start-Sleep -Milliseconds 400
  } finally { $client.Close() }
}

# Imprimantes du réseau local : tout appareil qui répond sur le port 9100 (ESC/POS brut).
function Find-Printers {
  $prefixes = @()
  foreach ($a in [Net.Dns]::GetHostAddresses([Net.Dns]::GetHostName())) {
    $s = $a.ToString()
    if ($a.AddressFamily -eq 'InterNetwork' -and -not $s.StartsWith('127.') -and -not $s.StartsWith('169.254.')) {
      $b = $s.Split('.')
      $prefixes += ($b[0] + '.' + $b[1] + '.' + $b[2])
    }
  }
  $targets = New-Object System.Collections.Generic.List[string]
  foreach ($p in ($prefixes | Select-Object -Unique)) { for ($i = 1; $i -le 254; $i++) { $targets.Add($p + '.' + $i) } }
  $tries = @()
  foreach ($ip in $targets) {
    $c = New-Object Net.Sockets.TcpClient
    try { $tries += ,@($ip, $c, $c.BeginConnect($ip, 9100, $null, $null)) } catch { $c.Close() }
  }
  Start-Sleep -Milliseconds 2000
  $found = @()
  foreach ($t in $tries) {
    if ($t[2].IsCompleted -and $t[1].Connected) { $found += @{ address = ($t[0] + ':9100') } }
    try { $t[1].Close() } catch {}
  }
  return ,$found
}

# « Désinstaller du PC » (back-office) : retire le poste, sa tâche de démarrage et RustDesk s'il l'a installé.
function Uninstall-Poste {
  Write-Log 'Désinstallation demandée depuis le back-office'
  $rd = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
  if ((Test-Path (Join-Path $dir 'rustdesk-par-yaoma.txt')) -and (Test-Path $rd)) {
    try { Start-Process -FilePath $rd -ArgumentList '--uninstall' -Wait } catch {}
    Start-Sleep -Seconds 5
    if (Get-Service -Name 'RustDesk' -ErrorAction SilentlyContinue) {
      Stop-Service -Name 'RustDesk' -Force -ErrorAction SilentlyContinue
      sc.exe delete RustDesk | Out-Null
    }
    Get-Process -Name 'rustdesk' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $env:ProgramFiles 'RustDesk') -Recurse -Force -ErrorAction SilentlyContinue
  }
  try { Unregister-ScheduledTask -TaskName 'Impression Yaoma' -Confirm:$false -ErrorAction SilentlyContinue } catch {}
  $link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Impression Yaoma.lnk'
  if (Test-Path $link) { Remove-Item $link -Force -ErrorAction SilentlyContinue }
  try { Invoke-Site 'POST' @{ report = @{ uninstalled = $true; host = $env:COMPUTERNAME } } | Out-Null } catch {}
  # Le dossier du poste est effacé juste après l'arrêt de ce script.
  Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c timeout /t 5 /nobreak >nul & rmdir /s /q "' + $dir + '"') -WindowStyle Hidden
  exit
}

Write-Log ('Démarrage du poste d''impression ' + $Version + ' sur ' + $env:COMPUTERNAME)
$lastScan = [DateTime]::MinValue
while ($true) {
  $pause = 3
  try {
    $r = Invoke-Site 'GET' $null
    if ($r.config.uninstall) { Uninstall-Poste }
    if ($r.config.wait) { $pause = [int]$r.config.wait }
    if ($r.config.scan -and ((Get-Date) - $lastScan).TotalSeconds -gt 20) {
      $lastScan = Get-Date
      $found = Find-Printers
      Invoke-Site 'POST' @{ report = @{ host = $env:COMPUTERNAME; version = $Version; discovered = $found } } | Out-Null
      Write-Log ('Recherche sur le réseau : ' + $found.Count + ' imprimante(s) trouvée(s)')
    }
    if ($r.job) {
      try {
        if (-not $r.config.address) { throw 'Aucune imprimante choisie dans le back-office' }
        Send-Printer $r.config.address ([Convert]::FromBase64String($r.job.data))
        Invoke-Site 'POST' @{ jobId = $r.job.id; ok = $true } | Out-Null
        Write-Log ('Imprimé : ' + $r.job.reference)
        $pause = 0
      } catch {
        $err = $_.Exception.Message
        Write-Log ('Échec ' + $r.job.reference + ' : ' + $err)
        try { Invoke-Site 'POST' @{ jobId = $r.job.id; ok = $false; error = $err } | Out-Null } catch {}
        $pause = 15
      }
    }
  } catch {
    Write-Log ('Site injoignable : ' + $_.Exception.Message)
    $pause = 10
  }
  if ($pause -gt 0) { Start-Sleep -Seconds $pause }
}
`;

/** Fichier « Installer-impression-Yaoma.cmd » propre à une imprimante (URL secrète intégrée). */
export function buildInstaller(agentUrl: string): string {
  const header = [
    "@echo off",
    "title Installation de l'impression Yaoma",
    "echo Installation en cours, patientez...",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$self = '%~f0'; $parts = [IO.File]::ReadAllText('%~f0', [Text.Encoding]::UTF8) -split ('#==PAR' + 'TIE==#'); Invoke-Expression $parts[1]"`,
    "exit /b",
  ].join("\n");
  const safeUrl = agentUrl.replace(/'/g, "");
  const content = [header, INSTALL.replace("__URL__", safeUrl), AGENT.replace("__VERSION__", AGENT_VERSION)].join("\n#==PARTIE==#\n");
  return content.replace(/\r?\n/g, "\r\n");
}
