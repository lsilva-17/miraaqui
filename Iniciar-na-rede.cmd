@echo off
cd /d "%~dp0"
echo Miraaqui na rede interna. Mantenha esta janela aberta.
echo Os colegas devem usar http://IP-DESTE-COMPUTADOR:4317
echo Use apenas em uma rede corporativa confiavel. Para acesso remoto, configure HTTPS.
set HOST=0.0.0.0
node server.mjs
pause
