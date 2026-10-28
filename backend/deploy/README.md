# Despliegue de JARVIS en alex-llm

Requisitos: Node 22+, Ollama corriendo en 127.0.0.1:11434, NAS montado (ej. `/mnt/nas/respaldos`), Tailscale.

```bash
sudo useradd -r -m -d /srv/jarvis jarvis
sudo rsync -a --exclude data --exclude node_modules backend/ /srv/jarvis/backend/
echo "NAS_DIR=/mnt/nas/respaldos" | sudo tee /srv/jarvis/backup.env
sudo cp /srv/jarvis/backend/deploy/jarvis-*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now jarvis-api jarvis-backup.timer
sudo ufw allow in on tailscale0 to any port 3019 proto tcp   # solo Tailscale
# usuarios (la contraseña se imprime UNA vez → credentials.md, nunca a git)
cd /srv/jarvis/backend && sudo -u jarvis JARVIS_DATA=/srv/jarvis/data node src/cli.js add-user Alex
cd /srv/jarvis/backend && sudo -u jarvis JARVIS_DATA=/srv/jarvis/data node src/cli.js add-user Tere
ollama pull qwen2.5vl:7b   # visión para comprobantes (qwen3:14b ya está por Lexium)
```

El mismo `add-user` resetea la contraseña si alguien la olvida.

## Restaurar un respaldo

```bash
sudo systemctl stop jarvis-api
sudo -u jarvis cp /mnt/nas/respaldos/jarvis/AAAA-MM-DD/jarvis.db /srv/jarvis/data/jarvis.db
sudo -u jarvis rm -f /srv/jarvis/data/jarvis.db-wal /srv/jarvis/data/jarvis.db-shm
sudo -u jarvis rsync -a /mnt/nas/respaldos/jarvis/AAAA-MM-DD/fotos/ /srv/jarvis/data/fotos/
sudo systemctl start jarvis-api
```
