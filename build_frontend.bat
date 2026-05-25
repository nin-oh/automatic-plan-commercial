@echo off
REM Build the Plan Commercial React app into frontend/apps/plan-commercial/dist/.
REM Required once before single-process mode (run_api.bat).
cd /d "%~dp0\frontend"
call pnpm install
call pnpm --dir apps\plan-commercial build
