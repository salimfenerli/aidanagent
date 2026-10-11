' Aidan ekran suresi - PowerShell'i PENCERE ACMADAN calistirir (Gorev Zamanlayici bunu cagirir).
Set sh = CreateObject("WScript.Shell")
klasor = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & klasor & "\aidan-ekran.ps1""", 0, False
