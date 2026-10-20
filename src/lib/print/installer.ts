/**
 * Installateur Windows du poste d'impression : UN fichier « .cmd » à double-cliquer,
 * sans droits administrateur ni logiciel à installer (PowerShell est fourni avec Windows).
 *
 * Il copie l'agent dans %LOCALAPPDATA%\YaomaImpression, le lance en arrière-plan, l'ajoute
 * au démarrage de Windows et empêche la mise en veille sur secteur. L'agent interroge le site
 * toutes les 3 secondes, cherche lui-même les imprimantes du réseau (port 9100) et les signale
 * au back-office, où l'on choisit l'imprimante et lance un ticket d'essai — à distance.
 *
 * Les scripts PowerShell évitent l'accent grave (caractère d'échappement PowerShell)
 * pour rester de simples chaînes JavaScript.
 */

export const AGENT_VERSION = "1.0";

const INSTALL = String.raw`
$ErrorActionPreference = 'Stop'
$url = '__URL__'
$dir = Join-Path $env:LOCALAPPDATA 'YaomaImpression'
try {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # Ancien poste encore lancé : arrêté avant la mise à jour.
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*YaomaImpression*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  [IO.File]::WriteAllText((Join-Path $dir 'agent.ps1'), $parts[2], (New-Object Text.UTF8Encoding $true))
  [IO.File]::WriteAllText((Join-Path $dir 'adresse.txt'), $url)
  $exe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $dir 'agent.ps1') + '"'
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Impression Yaoma.lnk'))
  $link.TargetPath = $exe
  $link.Arguments = $arguments
  $link.WindowStyle = 7
  $link.Save()
  Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Hidden
  # Ordinateur toujours éveillé quand il est branché (sinon plus d'impression la nuit / en service).
  powercfg /change standby-timeout-ac 0 2>$null | Out-Null
  powercfg /change hibernate-timeout-ac 0 2>$null | Out-Null
  $msg = 'Le poste d''impression est installé.' + [Environment]::NewLine + [Environment]::NewLine + 'Il démarre tout seul avec l''ordinateur. Laissez cet ordinateur allumé et branché au même réseau (box) que l''imprimante.' + [Environment]::NewLine + [Environment]::NewLine + 'Vous pouvez fermer cette fenêtre : la suite se règle à distance depuis le back-office.'
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($msg, 'Impression Yaoma', 'OK', 'Information') | Out-Null
} catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('Installation impossible : ' + $_.Exception.Message, 'Impression Yaoma', 'OK', 'Error') | Out-Null
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

Write-Log ('Démarrage du poste d''impression ' + $Version + ' sur ' + $env:COMPUTERNAME)
$lastScan = [DateTime]::MinValue
while ($true) {
  $pause = 3
  try {
    $r = Invoke-Site 'GET' $null
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
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$parts = [IO.File]::ReadAllText('%~f0', [Text.Encoding]::UTF8) -split ('#==PAR' + 'TIE==#'); Invoke-Expression $parts[1]"`,
    "exit /b",
  ].join("\n");
  const safeUrl = agentUrl.replace(/'/g, "");
  const content = [header, INSTALL.replace("__URL__", safeUrl), AGENT.replace("__VERSION__", AGENT_VERSION)].join("\n#==PARTIE==#\n");
  return content.replace(/\r?\n/g, "\r\n");
}
