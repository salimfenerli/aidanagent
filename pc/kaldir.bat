@echo off
rem Aidan ekran suresi gonderimini durdurur (ActivityWatch'a dokunmaz).
schtasks /Delete /F /TN "Aidan Ekran Suresi"
del /q "%~dp0ayar.txt" 2>nul
echo Durduruldu.
pause
