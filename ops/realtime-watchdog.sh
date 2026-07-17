#!/usr/bin/env bash
# Realtime-Watchdog (PHASE-17 A.9, Server 2): Der appwrite-realtime-Container
# kann nach einem Swoole-Crash DEGRADIERT weiterlaufen — Docker-Status
# „running", aber keine Events; `restart: unless-stopped` greift dann nicht.
# Der Beweis ist ein echter WebSocket-Handshake (HTTP 101), kein
# docker-inspect-Healthcheck. Bei Fehlschlag wird der Container neu ERSTELLT
# (verifizierter Fix: up -d --no-deps --force-recreate, 2026-07-01/16).
#
# Cron (alle 5 min), Beispiel:
#   */5 * * * * APPWRITE_COMPOSE_DIR=/root/appwrite /opt/ops/realtime-watchdog.sh >> /var/log/realtime-watchdog.log 2>&1
#
# Env:
#   APPWRITE_COMPOSE_DIR  Pflicht — Verzeichnis mit der docker-compose.yml
#   REALTIME_URL          Default http://localhost/v1/realtime?project=console
#                         (lokaler Pfad, unabhängig von TLS/DNS; project=console
#                         existiert immer)
#   ALERT_WEBHOOK         optional — wird bei Restart per POST benachrichtigt
set -u

COMPOSE_DIR="${APPWRITE_COMPOSE_DIR:?APPWRITE_COMPOSE_DIR fehlt}"
REALTIME_URL="${REALTIME_URL:-http://localhost/v1/realtime?project=console}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }

handshake_ok() {
  # 101 Switching Protocols innerhalb des Timeouts = Realtime lebt. curl
  # bleibt nach dem Upgrade am Socket hängen — der Timeout ist erwartet,
  # entscheidend ist die empfangene Statuszeile.
  curl -sS -i -m 8 --http1.1 \
    -H 'Connection: Upgrade' \
    -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: cGhhc2UxNy13YXRjaGRvZw==' \
    "$REALTIME_URL" 2>/dev/null | head -1 | grep -q ' 101 '
}

if handshake_ok; then
  # Still bei Erfolg — das Log soll nur Vorfälle zeigen
  exit 0
fi

log "Realtime-Handshake FEHLGESCHLAGEN gegen $REALTIME_URL — Container wird neu erstellt"
cd "$COMPOSE_DIR" || { log "Compose-Verzeichnis $COMPOSE_DIR fehlt"; exit 1; }
docker compose up -d --no-deps --force-recreate appwrite-realtime

sleep 15
if handshake_ok; then
  log 'Realtime erholt (Handshake 101 nach Neustart)'
  STATUS='recovered'
else
  log 'Realtime WEITER GESTOERT nach Neustart — manuell eingreifen'
  STATUS='still-down'
fi

if [ -n "$ALERT_WEBHOOK" ]; then
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
    -d "{\"source\":\"realtime-watchdog\",\"status\":\"$STATUS\",\"at\":\"$(date -u '+%FT%TZ')\"}" \
    "$ALERT_WEBHOOK" >/dev/null 2>&1 || log 'Alert-Webhook nicht erreichbar'
fi

[ "$STATUS" = 'recovered' ]
