#!/usr/bin/env bash
# scan.sh — Exposed Document Scanner
# Probes a domain for sensitive files that should not be publicly accessible.
# Usage: ./scan.sh <domain>   (e.g. ./scan.sh example.com)
# Requires: bash, curl

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Help ─────────────────────────────────────────────────────────────────────
usage() {
  echo -e "${BOLD}Usage:${RESET} $0 <domain> [--timeout N] [--no-color]"
  echo
  echo "  domain        Target to scan, e.g. example.com or https://example.com"
  echo "  --timeout N   Seconds per request (default: 6)"
  echo "  --no-color    Disable ANSI color output"
  echo
  echo "Only scan domains you own or have explicit authorisation to test."
  exit 1
}

[[ $# -lt 1 ]] && usage

# ── Argument parsing ──────────────────────────────────────────────────────────
DOMAIN="$1"; shift
TIMEOUT=6
NO_COLOR=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --no-color) NO_COLOR=1; shift ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ $NO_COLOR -eq 1 ]]; then
  RED=''; YELLOW=''; BLUE=''; GREEN=''; BOLD=''; DIM=''; RESET=''
fi

# ── Normalise domain ──────────────────────────────────────────────────────────
DOMAIN="${DOMAIN%/}"
if [[ "$DOMAIN" != http://* && "$DOMAIN" != https://* ]]; then
  DOMAIN="https://$DOMAIN"
fi

# ── Target list: "severity|path|description" ─────────────────────────────────
TARGETS=(
  # Critical
  "critical|/.env|Environment variables – may contain API keys and passwords"
  "critical|/.env.local|Local environment overrides"
  "critical|/.env.production|Production environment variables"
  "critical|/.env.backup|Environment backup file"
  "critical|/.env.old|Old environment variables file"
  "critical|/.git/config|Git repository configuration"
  "critical|/.git/HEAD|Git HEAD ref – confirms exposed repository"
  "critical|/wp-config.php|WordPress config – database credentials"
  "critical|/config.php|PHP configuration file"
  "critical|/database.yml|Database configuration (Rails)"
  "critical|/config/database.yml|Database config with credentials"
  "critical|/settings.py|Django settings file"
  "critical|/.aws/credentials|AWS credentials file"
  "critical|/credentials.json|Credentials file"
  "critical|/secrets.json|Secrets configuration file"
  "critical|/private.key|Private key file"
  "critical|/server.key|Server private key"
  "critical|/id_rsa|SSH private key"
  "critical|/.ssh/id_rsa|SSH private key in .ssh directory"
  # High
  "high|/config.json|Application config – may contain sensitive settings"
  "high|/config.yml|YAML configuration file"
  "high|/config.yaml|YAML configuration file"
  "high|/.htpasswd|Apache password file – hashed credentials"
  "high|/phpinfo.php|PHP info page – server/environment disclosure"
  "high|/web.config|IIS configuration file"
  "high|/backup.sql|SQL database backup"
  "high|/dump.sql|SQL database dump"
  "high|/db.sql|SQL database file"
  "high|/database.sql|SQL database backup"
  "high|/.DS_Store|macOS directory metadata – reveals file structure"
  "high|/server-status|Apache server-status page"
  "high|/server-info|Apache server-info page"
  "high|/elmah.axd|.NET error log viewer"
  "high|/trace.axd|ASP.NET trace viewer"
  "high|/adminer.php|Adminer database management tool"
  "high|/phpmyadmin/|phpMyAdmin database management interface"
  "high|/admin/|Admin panel"
  "high|/wp-admin/|WordPress admin panel"
  # Medium
  "medium|/robots.txt|Robots.txt – may reveal hidden paths"
  "medium|/composer.json|PHP Composer manifest – dependency disclosure"
  "medium|/package.json|Node.js package manifest – dependency disclosure"
  "medium|/Gemfile|Ruby Gemfile – dependency disclosure"
  "medium|/requirements.txt|Python dependencies"
  "medium|/README.md|README file – may reveal internal details"
  "medium|/CHANGELOG.md|Changelog – version/feature disclosure"
  "medium|/.well-known/security.txt|Security policy contact info"
  "medium|/crossdomain.xml|Flash cross-domain policy"
  "medium|/clientaccesspolicy.xml|Silverlight cross-domain policy"
  "medium|/sitemap.xml|Sitemap – URL structure disclosure"
  "medium|/swagger.json|Swagger API specification"
  "medium|/swagger/v1/swagger.json|Swagger API specification"
  "medium|/api-docs|API documentation page"
  "medium|/api/swagger.json|Swagger API specification"
)

TOTAL=${#TARGETS[@]}

# ── Severity formatting ───────────────────────────────────────────────────────
sev_color() {
  case "$1" in
    critical) echo -n "${RED}" ;;
    high)     echo -n "${YELLOW}" ;;
    medium)   echo -n "${BLUE}" ;;
    *)        echo -n "${RESET}" ;;
  esac
}

sev_label() {
  case "$1" in
    critical) echo -n "CRITICAL" ;;
    high)     echo -n "HIGH    " ;;
    medium)   echo -n "MEDIUM  " ;;
  esac
}

# ── Probe function ─────────────────────────────────────────────────────────────
# Returns HTTP status code or 0 on network error.
probe() {
  local url="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time "$TIMEOUT" \
    --location \
    --max-redirs 3 \
    -A "ExposedDocScanner/1.0 (security-audit)" \
    -X HEAD \
    "$url" 2>/dev/null) || code=0

  # Fall back to GET if server rejects HEAD
  if [[ "$code" == "405" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time "$TIMEOUT" \
      --location \
      --max-redirs 3 \
      -A "ExposedDocScanner/1.0 (security-audit)" \
      "$url" 2>/dev/null) || code=0
  fi

  echo "$code"
}

# ── Header ─────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        Exposed Document Scanner                  ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo -e "  ${DIM}Target :${RESET} ${BOLD}${DOMAIN}${RESET}"
echo -e "  ${DIM}Paths  :${RESET} ${TOTAL}"
echo -e "  ${DIM}Timeout:${RESET} ${TIMEOUT}s per request"
echo

# ── Scan ───────────────────────────────────────────────────────────────────────
FOUND=0
SCANNED=0
declare -a RESULTS_CRITICAL=()
declare -a RESULTS_HIGH=()
declare -a RESULTS_MEDIUM=()

for entry in "${TARGETS[@]}"; do
  IFS='|' read -r severity path desc <<< "$entry"
  url="${DOMAIN}${path}"

  # Progress indicator
  printf "\r  ${DIM}[%3d/%d] Probing %-40s${RESET}" \
    "$((SCANNED+1))" "$TOTAL" "${path:0:40}"

  code=$(probe "$url")
  SCANNED=$((SCANNED + 1))

  if [[ "$code" == "200" ]]; then
    FOUND=$((FOUND + 1))
    line="$(sev_color "$severity")$(sev_label "$severity")${RESET}  ${path}  ${DIM}${desc}${RESET}"
    case "$severity" in
      critical) RESULTS_CRITICAL+=("$line") ;;
      high)     RESULTS_HIGH+=("$line") ;;
      medium)   RESULTS_MEDIUM+=("$line") ;;
    esac
  fi
done

# Clear progress line
printf "\r%80s\r" ""

# ── Results ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}Results — ${DOMAIN}${RESET}"
echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"

if [[ $FOUND -eq 0 ]]; then
  echo -e "  ${GREEN}No exposed files found across ${SCANNED} paths.${RESET}"
else
  for line in "${RESULTS_CRITICAL[@]}"; do
    echo -e "  $line"
  done
  for line in "${RESULTS_HIGH[@]}"; do
    echo -e "  $line"
  done
  for line in "${RESULTS_MEDIUM[@]}"; do
    echo -e "  $line"
  done
fi

echo
echo -e "${DIM}─────────────────────────────────────────────────────────────${RESET}"
echo -e "  Scanned : ${SCANNED}  |  Found : ${BOLD}${FOUND}${RESET}"
echo -e "  Critical: ${RED}${#RESULTS_CRITICAL[@]}${RESET}  |  High: ${YELLOW}${#RESULTS_HIGH[@]}${RESET}  |  Medium: ${BLUE}${#RESULTS_MEDIUM[@]}${RESET}"
echo
