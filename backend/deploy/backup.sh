#!/usr/bin/env bash
# Respaldo diario de JARVIS al NAS: copia consistente de la DB + fotos; guarda 30 días.
# Uso: NAS_DIR=/mnt/nas/respaldos JARVIS_DATA=/srv/jarvis/data backup.sh
set -euo pipefail
: "${NAS_DIR:?falta NAS_DIR}"
DATA="${JARVIS_DATA:-/srv/jarvis/data}"
HOY="$(date +%F)"
DEST="$NAS_DIR/jarvis/$HOY"
mountpoint -q "$NAS_DIR" 2>/dev/null || [ "${NAS_NO_MOUNT_CHECK:-}" = 1 ] || { echo "NAS no montado en $NAS_DIR" >&2; exit 1; }
mkdir -p "$DEST"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
node --no-warnings -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\");
" "$DATA/jarvis.db" "$TMP/jarvis.db"
cp "$TMP/jarvis.db" "$DEST/jarvis.db"
rsync -a "$DATA/fotos/" "$DEST/fotos/"
find "$NAS_DIR/jarvis" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
echo "respaldo OK: $DEST"
