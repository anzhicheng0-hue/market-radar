param([switch]$Open)
$ErrorActionPreference='Stop'
$siteRoot=$PSScriptRoot
$dataDirectory=Join-Path $siteRoot 'data'
New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$nodeCommand=(Get-Command node -ErrorAction SilentlyContinue).Source
if(!$nodeCommand){$bundledNode=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe';if(Test-Path -LiteralPath $bundledNode){$nodeCommand=$bundledNode}}
if(!$nodeCommand){throw '未找到 Node.js。请先安装 Node.js 22 或更高版本。'}
$serverFile=Join-Path $siteRoot 'server.mjs'
$stateFile=Join-Path $siteRoot 'data/server-process.json'
if(Test-Path -LiteralPath $stateFile){
  $serverState=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  $existingProcess=Get-Process -Id $serverState.pid -ErrorAction SilentlyContinue
  if($existingProcess -and $existingProcess.StartTime.ToUniversalTime().Ticks -eq [long]$serverState.startTicks){
    Write-Output '网站已运行：http://localhost:5180'
    if($Open){Start-Process 'http://localhost:5180'}
    exit 0
  }
}
$portUse=Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue
if($portUse){throw '端口 5180 已被使用，请先确认并关闭原网站程序。'}
$serverProcess=Start-Process -FilePath $nodeCommand -ArgumentList ('"'+$serverFile+'"') -WorkingDirectory $siteRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $siteRoot 'data/server-output.log') -RedirectStandardError (Join-Path $siteRoot 'data/server-error.log')
Start-Sleep -Milliseconds 700
if($serverProcess.HasExited){throw '启动失败，请查看 data/server-error.log。'}
@{pid=$serverProcess.Id;startTicks=$serverProcess.StartTime.ToUniversalTime().Ticks;executable=$nodeCommand;serverFile=$serverFile} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
Write-Output '网站已启动：http://localhost:5180；价格更新程序随网站运行。'
if($Open){Start-Process 'http://localhost:5180'}

