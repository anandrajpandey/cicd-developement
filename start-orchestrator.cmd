@echo off
start "Agentic Orchestrator" /min powershell.exe -NoProfile -NoExit -Command "Set-Location 'C:\Users\pc\Desktop\Cicd\apps\orchestrator'; & 'C:\Program Files\nodejs\node.exe' 'C:\Users\pc\Desktop\Cicd\apps\orchestrator\dist\server.js'"
