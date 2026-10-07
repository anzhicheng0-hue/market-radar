$ErrorActionPreference='Stop'
$stateFile=Join-Path $PSScriptRoot 'data/server-process.json'
if(!(Test-Path -LiteralPath $stateFile)){Write-Output '没有记录到运行中的网站。';exit 0}
$serverState=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$serverProcess=Get-Process -Id $serverState.pid -ErrorAction SilentlyContinue
if(!$serverProcess){Write-Output '网站已经停止。';exit 0}
$processInfo=Get-CimInstance Win32_Process -Filter ('ProcessId='+$serverState.pid)
if($serverProcess.StartTime.ToUniversalTime().Ticks -ne [long]$serverState.startTicks -or $processInfo.ExecutablePath -ne $serverState.executable -or !$processInfo.CommandLine.Contains($serverState.serverFile)){throw '进程身份不符，未停止任何程序。'}
Stop-Process -Id $serverState.pid
Write-Output '网站与自动价格更新已停止。'

