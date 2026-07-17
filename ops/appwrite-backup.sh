#!/usr/bin/env bash
# Appwrite-Backup (PHASE-17 A.6, Server 2): MariaDB-Dump + Storage-Volumes
# als tar, Rotation, optional Offsite-Sync auf die Hetzner Storage Box.
# Redis ist reiner Cache → kein Backup. Die RESTORE-PROBE gehört zum
# Go-Live (Teil B Block 9): Dump in eine Wegwerf-MariaDB einspielen —
# ungeprobte Backups sind Hoffnung, keine Backups.
#
# Cron (täglich 03:30), Beispiel:
#   30 3 * * * APPWRITE_COMPOSE_DIR=/root/appwrite BACKUP_DIR=/backup \
#     OFFSITE_TARGET='u123456@u123456.your-storagebox.de:backups/appwrite' \
#     /opt/ops/appwrite-backup.sh >> /var/log/appwrite-backup.log 2>&1
#
# Env:
#   APPWRITE_COMPOSE_DIR  Pflicht — Verzeichnis mit der docker-compose.yml
#   BACKUP_DIR            Default /backup
#   RETENTION_DAYS        Default 14
#   VOLUMES               Default "appwrite-uploads appwrite-config appwrite-functions"
#   OFFSITE_TARGET        optional — rsync-Ziel (SSH, Storage Box)
set -euo pipefail

COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:?APPWRITE_COMPOSE_DIR fehlt}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
VOLUMES="${VOLUMES:-appwrite-uploads appwrite-config appwrite-functions}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"

STAMP="$(date '+%F-%H%M')"
log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

# 1) MariaDB-Dump (konsistent, alle Datenbanken) — Root-Passwort kommt aus
#    der Container-Env (Appwrite-Compose setzt MYSQL_ROOT_PASSWORD)
DUMP="$BACKUP_DIR/db-$STAMP.sql.gz"
log "MariaDB-Dump → $DUMP"
docker compose exec -T mariadb sh -c 'exec mariadb-dump --all-databases -uroot -p"$MYSQL_ROOT_PASSWORD"' | gzip > "$DUMP"
[ -s "$DUMP" ] || { log 'Dump ist LEER — Abbruch'; exit 1; }

# 2) Storage-Volumes als tar. Das Compose-Projekt-Präfix kommt aus dem Label
#    des laufenden mariadb-Containers — NIE per Wildcard raten: auf Maschinen
#    mit mehreren Stacks (dev!) träfe das sonst den falschen.
PROJECT="$(docker compose ps -q mariadb | head -1 | xargs docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}')"
[ -n "$PROJECT" ] || { log 'Compose-Projekt nicht ermittelbar (läuft mariadb?)'; exit 1; }
for short in $VOLUMES; do
  volume="${PROJECT}_${short}"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    log "Volume $volume nicht gefunden — übersprungen"
    continue
  fi
  archive="$BACKUP_DIR/${short}-$STAMP.tar.gz"
  log "Volume $volume → $archive"
  docker run --rm -v "$volume":/data:ro -v "$BACKUP_DIR":/backup alpine \
    tar czf "/backup/$(basename "$archive")" -C /data .
done

# 3) Rotation
log "Rotation: älter als $RETENTION_DAYS Tage löschen"
find "$BACKUP_DIR" -maxdepth 1 -name '*.gz' -mtime "+$RETENTION_DAYS" -delete

# 4) Offsite (Storage Box) — nach 1+2, damit nie ein halber Stand synct
if [ -n "$OFFSITE_TARGET" ]; then
  log "Offsite-Sync → $OFFSITE_TARGET"
  rsync -az --delete-after "$BACKUP_DIR"/ "$OFFSITE_TARGET"/
fi

log "Backup fertig: $(ls -1 "$BACKUP_DIR" | wc -l | tr -d ' ') Dateien in $BACKUP_DIR"
