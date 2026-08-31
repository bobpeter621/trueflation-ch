#!/usr/bin/env bash
# trueflation.ch — Telegram-Notification-Grundgerüst (US 1.7, US 5.3)
#
# Zweck: strukturierte Plausi-Freigabe-Anfragen und Pipeline-Fehler an den
# bestehenden Telegram-Kanal des Betreibers senden. Bot-Token und Chat-ID
# werden aus je einer eigenen Secrets-Datei gelesen, keine neue
# Notification-Infrastruktur aufgebaut (siehe US 5.3).
#
# Usage:
#   ./notify-telegram.sh "Nachrichtentext"
#   echo "Nachrichtentext" | ./notify-telegram.sh
#
# Strukturierter Kontext bei Plausi-Eskalation (US 1.7) sollte vom Aufrufer
# bereits als fertig formatierter Text übergeben werden, z.B.:
#   ./notify-telegram.sh "⚠️ Plausi-Check: LIK
#   Alter Wert: 106.9
#   Neuer Wert: 118.2 (+10.6%)
#   Schwellwert überschritten: ja (>2%/Monat)
#   Quelle: https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master
#   Freigabe erforderlich."

set -euo pipefail

BOT_TOKEN_FILE="${HOME}/.secrets/telegram-token"
CHAT_ID_FILE="${HOME}/.secrets/telegram-chat-id"

if [[ ! -f "$BOT_TOKEN_FILE" ]]; then
  echo "FEHLER: Telegram-Token nicht gefunden unter $BOT_TOKEN_FILE" >&2
  exit 1
fi

if [[ ! -f "$CHAT_ID_FILE" ]]; then
  echo "FEHLER: Chat-ID nicht gefunden unter $CHAT_ID_FILE" >&2
  exit 1
fi

BOT_TOKEN=$(cat "$BOT_TOKEN_FILE")
CHAT_ID=$(cat "$CHAT_ID_FILE")

if [[ -z "$CHAT_ID" ]]; then
  echo "FEHLER: Chat-ID-Datei $CHAT_ID_FILE ist leer" >&2
  exit 1
fi

# Nachricht aus Argument oder stdin lesen
if [[ $# -gt 0 ]]; then
  MESSAGE="$1"
else
  MESSAGE=$(cat)
fi

if [[ -z "$MESSAGE" ]]; then
  echo "FEHLER: Keine Nachricht übergeben" >&2
  exit 1
fi

# Projekt-Prefix, damit Nachrichten im gemeinsam genutzten Kanal eindeutig
# trueflation.ch zuordenbar sind (mehrere Projekte teilen sich den Kanal)
PREFIXED_MESSAGE="[trueflation.ch] ${MESSAGE}"

RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  --data-urlencode text="${PREFIXED_MESSAGE}")

OK=$(echo "$RESPONSE" | grep -o '"ok":true' || true)
if [[ -z "$OK" ]]; then
  echo "FEHLER: Telegram-Versand fehlgeschlagen: $RESPONSE" >&2
  exit 1
fi

echo "OK: Nachricht zugestellt."
