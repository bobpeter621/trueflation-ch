#!/usr/bin/env bash
# trueflation.ch — Telegram-Notification-Grundgerüst (US 1.7, US 5.3)
#
# Zweck: strukturierte Plausi-Freigabe-Anfragen und Pipeline-Fehler an den
# Betreiber-Telegram-Kanal senden. Keine neue Notification-Infrastruktur —
# das Skript nutzt denselben Kanal wie die übrige Betreiber-Automation (US 5.3).
#
# Konfiguration (Umgebungsvariablen, alle mit dokumentiertem Default —
# rueckwaertskompatibel, kein Breaking Change fuer die Produktivumgebung):
#   TELEGRAM_BOT_TOKEN          Bot-Token direkt als Env-Var (hat VORRANG vor
#                               der Datei — das GitHub-Actions-Muster, analog
#                               TWELVEDATA_API_KEY in der Pipeline).
#   TELEGRAM_CHAT_ID            Chat-ID direkt als Env-Var (hat VORRANG vor
#                               der Extraktion aus der Betreiber-Config).
#   TRUEFLATION_SECRETS_DIR     Basis-Verzeichnis der Secret-Dateien.
#                               Default: ${HOME}/.openclaw/secrets
#                               (Token-Datei: <dir>/telegram-token)
#   TRUEFLATION_OPERATOR_CONFIG Pfad zur Betreiber-Config, aus der die
#                               Telegram-Chat-ID gelesen wird, falls
#                               TELEGRAM_CHAT_ID nicht gesetzt ist.
#                               Default: ${HOME}/.openclaw/openclaw.json
#
# Sicherheitshinweis: Diese Variablen werden ausschliesslich lokal (Betreiber-
# Shell) bzw. in GitHub Actions aus den verschlüsselten Repo-Secrets gesetzt.
# Sie sind NICHT von aussen (HTTP-Input, Nutzereingabe) beeinflussbar — ein
# Pfad-Traversal ueber manipulierte Werte erfordert bereits Shell-Zugriff auf
# die ausfuehrende Umgebung (dann waere der Token ohnehin direkt lesbar).
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

SECRETS_DIR="${TRUEFLATION_SECRETS_DIR:-${HOME}/.openclaw/secrets}"
BOT_TOKEN_FILE="${SECRETS_DIR}/telegram-token"
OPERATOR_CONFIG="${TRUEFLATION_OPERATOR_CONFIG:-${HOME}/.openclaw/openclaw.json}"

# Bot-Token: Env-Var zuerst (GitHub-Actions-Muster), Datei als Fallback
# (lokale/manuelle Laeufe).
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
if [[ -z "$BOT_TOKEN" ]]; then
  if [[ ! -f "$BOT_TOKEN_FILE" ]]; then
    echo "FEHLER: Telegram-Token weder als TELEGRAM_BOT_TOKEN gesetzt noch unter $BOT_TOKEN_FILE gefunden" >&2
    exit 1
  fi
  BOT_TOKEN=$(cat "$BOT_TOKEN_FILE")
fi

# SECURITY-HÄRTUNG (Security-Review 06.09.2026): Token-Format validieren,
# BEVOR es in die curl-Config-Datei geschrieben wird. Telegram-Bot-Tokens
# haben immer die Form <Ziffern>:<Base62+_-> — alles andere (v.a. Anführungs-
# zeichen/Zeilenumbrüche) könnte die Config-Datei-Struktur unten durchbrechen
# und curl-Optionen injizieren (Config-Injection). Token kommt zwar aus
# Betreiber-Env/lokaler Datei (nicht extern erreichbar), aber die Prüfung
# kostet eine Zeile und schliesst die Klasse vollständig aus.
if ! [[ "$BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  echo "FEHLER: Telegram-Token hat kein gueltiges Format (<id>:<secret>)" >&2
  exit 1
fi

# Chat-ID: Env-Var zuerst, sonst Extraktion aus der Betreiber-Config.
# SECURITY-FIX (Security-Review 05.09.2026, Finding 4.2, LOW): grep -A1 auf
# den rohen JSON-Text ist fragil (bricht bei Formatierungsaenderungen der
# Config, z.B. einzeiliges Array) UND liefert die ERSTE Ziffernfolge >=5
# Stellen irgendwo im Match -- ohne Format-Validierung koennte das bei
# einer unerwarteten Config-Struktur eine falsche Chat-ID liefern (Nachricht
# ginge an einen falschen/fremden Chat). Fix: jq statt grep (strukturierte
# JSON-Extraktion statt Text-Pattern-Matching) + explizite Format-Pruefung
# (nur Ziffern, nicht leer) auf das Ergebnis.
CHAT_ID="${TELEGRAM_CHAT_ID:-}"
if [[ -z "$CHAT_ID" ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "FEHLER: jq nicht installiert, kann Chat-ID nicht sicher aus $OPERATOR_CONFIG lesen" >&2
    exit 1
  fi
  CHAT_ID=$(jq -r '.channels.telegram.allowFrom[0] // .telegram[0] // empty' "$OPERATOR_CONFIG" 2>/dev/null)
fi

if [[ -z "$CHAT_ID" ]]; then
  echo "FEHLER: Konnte Chat-ID weder aus TELEGRAM_CHAT_ID noch aus $OPERATOR_CONFIG ermitteln" >&2
  exit 1
fi
if ! [[ "$CHAT_ID" =~ ^-?[0-9]+$ ]]; then
  echo "FEHLER: Chat-ID '$CHAT_ID' hat kein gueltiges Zahlenformat" >&2
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

# Projekt-Prefix, damit Nachrichten im gemeinsamen Betreiber-Kanal eindeutig
# trueflation.ch zuordenbar sind (mehrere Projekte teilen sich den Kanal)
PREFIXED_MESSAGE="[trueflation.ch] ${MESSAGE}"

# SECURITY-FIX (Security-Review 05.09.2026, Finding 4.1, LOW): Den Bot-Token
# als Teil der URL an curl zu uebergeben legt ihn in die Prozessliste
# (ps aux zeigt das volle Kommando inkl. Argumente an jeden anderen lokalen
# Nutzer/Prozess mit Leserechten auf /proc). Fix: Token per curl --config-Datei
# (0600, nur fuer diesen Prozess sichtbar per Datei-Permission statt argv)
# uebergeben statt in die URL zu interpolieren. Config-Datei wird sofort nach
# dem curl-Aufruf geloescht (trap fuer den Fehlerfall).
CURL_CONFIG_FILE=$(mktemp)
chmod 600 "$CURL_CONFIG_FILE"
trap 'rm -f "$CURL_CONFIG_FILE"' EXIT

{
  echo "url = \"https://api.telegram.org/bot${BOT_TOKEN}/sendMessage\""
  echo "data = \"chat_id=${CHAT_ID}\""
} > "$CURL_CONFIG_FILE"

RESPONSE=$(curl -s -X POST --config "$CURL_CONFIG_FILE" \
  --data-urlencode text="${PREFIXED_MESSAGE}")

OK=$(echo "$RESPONSE" | grep -o '"ok":true' || true)
if [[ -z "$OK" ]]; then
  echo "FEHLER: Telegram-Versand fehlgeschlagen: $RESPONSE" >&2
  exit 1
fi

echo "OK: Nachricht zugestellt."
