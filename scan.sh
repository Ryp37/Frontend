#!/usr/bin/env bash
# scan.sh — Advanced Exposed Document Scanner v2
# Probes a domain for sensitive files that should not be publicly accessible.
#
# Usage: ./scan.sh <domain> [options]
# Requires: bash, curl
#
# Only scan domains you own or have explicit authorisation to test.

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'
GREEN='\033[0;32m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ── Help ──────────────────────────────────────────────────────────────────────
usage() {
cat <<EOF

${BOLD}Usage:${RESET} $0 <domain> [options]

  ${BOLD}domain${RESET}            Target, e.g. example.com or https://example.com

${BOLD}Options:${RESET}
  --deep            Phase 3: probe sensitive files inside subdirectories
  --subdomains      Phase 1: brute-force common subdomains
  --crawl           Phase 5: crawl homepage links and check found URLs
  --backup          Phase 4: check backup/swap variants of common files
  --parallel N      Concurrent requests (default: 8, max: 30)
  --timeout N       Seconds per request (default: 6)
  --output FILE     Save findings to a file (plain text)
  --no-color        Disable ANSI colours

Only scan systems you own or have explicit authorisation to test.
EOF
  exit 1
}

[[ $# -lt 1 ]] && usage

# ── Argument parsing ──────────────────────────────────────────────────────────
DOMAIN="$1"; shift
TIMEOUT=6; PARALLEL=8; NO_COLOR=0
DO_DEEP=0; DO_SUBS=0; DO_CRAWL=0; DO_BACKUP=0
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --deep)       DO_DEEP=1;        shift ;;
    --subdomains) DO_SUBS=1;        shift ;;
    --crawl)      DO_CRAWL=1;       shift ;;
    --backup)     DO_BACKUP=1;      shift ;;
    --parallel)   PARALLEL="$2";    shift 2 ;;
    --timeout)    TIMEOUT="$2";     shift 2 ;;
    --output)     OUTPUT="$2";      shift 2 ;;
    --no-color)   NO_COLOR=1;       shift ;;
    -h|--help)    usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

[[ $NO_COLOR -eq 1 ]] && RED='' YELLOW='' BLUE='' GREEN='' CYAN='' MAGENTA='' BOLD='' DIM='' RESET=''
[[ $PARALLEL -gt 30 ]] && PARALLEL=30

# ── Normalise domain ──────────────────────────────────────────────────────────
DOMAIN="${DOMAIN%/}"
[[ "$DOMAIN" != http://* && "$DOMAIN" != https://* ]] && DOMAIN="https://$DOMAIN"
BASE_HOST="${DOMAIN#*://}"   # example.com (no scheme)
SCHEME="${DOMAIN%%://*}"     # https or http

# ── Temp files for cross-subshell IPC ────────────────────────────────────────
# bash arrays/variables modified inside { } & subshells are lost when the
# subshell exits. Writing to files is the portable fix.
TMP_DIR=$(mktemp -d)
touch "$TMP_DIR/critical" "$TMP_DIR/high" "$TMP_DIR/medium" "$TMP_DIR/info"
touch "$TMP_DIR/scanned" "$TMP_DIR/logfile"

# EXIT trap is inherited by every { } & subshell and every $() substitution.
# Without the BASHPID guard, each subshell would run rm -rf on exit, deleting
# TMP_DIR before the main process can read results.
_MAIN_PID=$BASHPID
trap '[[ $BASHPID -eq $_MAIN_PID ]] && rm -rf "$TMP_DIR"' EXIT

# ── Output file setup ─────────────────────────────────────────────────────────
if [[ -n "$OUTPUT" ]]; then
  > "$OUTPUT"
  log_file() { echo "$1" >> "$OUTPUT"; }
else
  log_file() { echo "$1" >> "$TMP_DIR/logfile"; }
fi

# ── Severity helpers ──────────────────────────────────────────────────────────
sev_color() {
  case "$1" in
    critical) echo -n "$RED"     ;;
    high)     echo -n "$YELLOW"  ;;
    medium)   echo -n "$BLUE"    ;;
    info)     echo -n "$CYAN"    ;;
  esac
}
sev_label() {
  case "$1" in
    critical) echo -n "CRITICAL" ;;
    high)     echo -n "HIGH    " ;;
    medium)   echo -n "MEDIUM  " ;;
    info)     echo -n "INFO    " ;;
  esac
}

# ── Probe (HEAD → GET fallback, IPv4 forced) ─────────────────────────────────
# Mobile/Termux networks often have broken IPv6; --ipv4 prevents hangs.
CURL_BASE=(curl -sk -4 --max-time "$TIMEOUT" --location --max-redirs 3
           -A "SecurityScanner/2.0 (security-audit)")

probe() {
  local url="$1"
  local code
  code=$("${CURL_BASE[@]}" -o /dev/null -w "%{http_code}" -X HEAD "$url" 2>/dev/null)
  [[ -z "$code" ]] && code="000"
  [[ "$code" == "405" || "$code" == "501" ]] && \
    code=$("${CURL_BASE[@]}" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  [[ -z "$code" ]] && code="000"
  echo "$code"
}

# ── Probe + capture body (for crawl/dir-listing) ─────────────────────────────
probe_body() {
  "${CURL_BASE[@]}" "$1" 2>/dev/null
}

# ── Record a finding ──────────────────────────────────────────────────────────
# Writes to a temp file so subshells can persist results to the parent.
record() {
  local sev="$1" url="$2" desc="$3"
  local line
  line="$(sev_color "$sev")$(sev_label "$sev")${RESET}  ${url}  ${DIM}${desc}${RESET}"
  echo "$line" >> "$TMP_DIR/$sev"
  log_file "[${sev^^}] ${url} — ${desc}"
}

# ── Parallel job pool ─────────────────────────────────────────────────────────
# In non-interactive shells, $(jobs -rp) inside a subshell cannot see the
# parent's job table, so the old polling loop never throttled anything —
# all probes were fired at once, causing an OOM kill.
# Fix: track PIDs explicitly in the parent shell and use 'wait $pid'.
declare -a _PIDS=()
wait_for_slot() {
  # Capture PID of the most recently backgrounded job ('&' sets $!)
  local p="$!"
  [[ -n "$p" ]] && _PIDS+=("$p")

  # Block until the number of running jobs drops below $PARALLEL
  while (( ${#_PIDS[@]} >= PARALLEL )); do
    wait "${_PIDS[0]}" 2>/dev/null || true   # wait for oldest
    _PIDS=("${_PIDS[@]:1}")                  # remove it from list
    # Prune any other jobs that already finished
    local still=()
    for p in "${_PIDS[@]}"; do
      kill -0 "$p" 2>/dev/null && still+=("$p")
    done
    _PIDS=("${still[@]}")
  done
}

# ── Progress ──────────────────────────────────────────────────────────────────
PHASE_LABEL=""
show_progress() { printf "\r  ${DIM}[%s] %-55s${RESET}" "$PHASE_LABEL" "${1:0:55}"; }

# ─────────────────────────────────────────────────────────────────────────────
# TARGET LISTS
# Format: "severity|path|description"
# ─────────────────────────────────────────────────────────────────────────────

# ── Root-level sensitive files ────────────────────────────────────────────────
ROOT_TARGETS=(
  # Git / VCS
  "critical|/.git/config|Git repository config"
  "critical|/.git/HEAD|Git HEAD – confirms exposed repository"
  "critical|/.git/COMMIT_EDITMSG|Git last commit message"
  "critical|/.git/index|Git index file"
  "critical|/.git/logs/HEAD|Git reflog"
  "critical|/.git/refs/heads/master|Git master branch ref"
  "critical|/.git/refs/heads/main|Git main branch ref"
  "high|/.svn/entries|SVN repository entries"
  "high|/.svn/wc.db|SVN working copy database"
  "high|/.hg/hgrc|Mercurial config"
  "high|/.hg/store/fncache|Mercurial file index"

  # Environment / secrets
  "critical|/.env|Environment variables"
  "critical|/.env.local|Local env overrides"
  "critical|/.env.production|Production env"
  "critical|/.env.prod|Production env (short)"
  "critical|/.env.staging|Staging env"
  "critical|/.env.dev|Development env"
  "critical|/.env.test|Test env"
  "critical|/.env.backup|Env backup"
  "critical|/.env.old|Old env file"
  "critical|/.env.bak|Env .bak file"
  "critical|/.env.example|Example env – may contain real secrets"
  "critical|/.env.save|Saved env file"
  "critical|/env.js|JavaScript env config"
  "critical|/env.json|JSON env config"

  # SSH / keys / certificates
  "critical|/id_rsa|SSH private key"
  "critical|/id_dsa|SSH DSA private key"
  "critical|/id_ecdsa|SSH ECDSA private key"
  "critical|/id_ed25519|SSH Ed25519 private key"
  "critical|/.ssh/id_rsa|SSH key in .ssh/"
  "critical|/.ssh/authorized_keys|SSH authorized keys"
  "critical|/private.key|Private key"
  "critical|/server.key|Server private key"
  "critical|/certificate.pem|Certificate file"
  "critical|/cert.pem|Certificate file"
  "critical|/privkey.pem|Let's Encrypt private key"
  "critical|/fullchain.pem|Let's Encrypt full chain"
  "critical|/ssl.key|SSL private key"

  # AWS / cloud credentials
  "critical|/.aws/credentials|AWS credentials"
  "critical|/.aws/config|AWS config"
  "critical|/google-services.json|Google Services (Firebase keys)"
  "critical|/service-account.json|GCP service account key"
  "critical|/firebase.json|Firebase config"
  "critical|/storage.json|Cloud storage config"
  "critical|/.gcloud/credentials|GCloud credentials"

  # App credentials / secrets
  "critical|/credentials.json|Credentials file"
  "critical|/secrets.json|Secrets file"
  "critical|/secrets.yml|Secrets YAML"
  "critical|/secrets.yaml|Secrets YAML"
  "critical|/.secrets|Secrets file"
  "critical|/api_keys.json|API keys"
  "critical|/api_key.txt|API key"
  "critical|/token.json|Auth token"
  "critical|/auth.json|Auth config"
  "critical|/passwd|Password file"
  "critical|/shadow|Shadow password file"

  # CMS / framework configs
  "critical|/wp-config.php|WordPress config"
  "critical|/wp-config.php.bak|WordPress config backup"
  "critical|/config.php|PHP config"
  "critical|/configuration.php|Joomla config"
  "critical|/LocalSettings.php|MediaWiki config"
  "critical|/settings.php|Drupal settings"
  "critical|/database.yml|Rails DB config"
  "critical|/config/database.yml|Rails DB config"
  "critical|/config/secrets.yml|Rails secrets"
  "critical|/config/master.key|Rails master key"
  "critical|/config/credentials.yml.enc|Rails encrypted credentials"
  "critical|/settings.py|Django settings"
  "critical|/local_settings.py|Django local settings"
  "critical|/.htpasswd|Apache password file"

  # Infrastructure as code
  "critical|/terraform.tfvars|Terraform variables (may contain secrets)"
  "critical|/terraform.tfstate|Terraform state (contains resource details)"
  "critical|/.terraform/terraform.tfstate|Terraform local state"
  "critical|/ansible.cfg|Ansible config"
  "critical|/inventory|Ansible inventory"
  "high|/Vagrantfile|Vagrant config"
  "high|/Dockerfile|Dockerfile"
  "high|/docker-compose.yml|Docker Compose config"
  "high|/docker-compose.override.yml|Docker Compose override"
  "high|/.dockerenv|Docker environment marker"
  "high|/k8s.yml|Kubernetes manifest"
  "high|/kubernetes.yml|Kubernetes manifest"
  "high|/deployment.yml|Kubernetes deployment"
  "high|/values.yml|Helm values"

  # CI/CD
  "high|/.travis.yml|Travis CI config"
  "high|/.gitlab-ci.yml|GitLab CI config"
  "high|/Jenkinsfile|Jenkins pipeline"
  "high|/.circleci/config.yml|CircleCI config"
  "high|/.github/workflows/|GitHub Actions workflows"
  "high|/bitbucket-pipelines.yml|Bitbucket Pipelines"
  "high|/.drone.yml|Drone CI config"

  # Databases / dumps
  "critical|/backup.sql|SQL backup"
  "critical|/dump.sql|SQL dump"
  "critical|/db.sql|SQL database"
  "critical|/database.sql|SQL database"
  "critical|/data.sql|SQL data"
  "critical|/users.sql|Users dump"
  "high|/backup.tar.gz|Tar backup archive"
  "high|/backup.zip|Zip backup"
  "high|/backup.tar|Tar backup"
  "high|/site.zip|Site backup zip"
  "high|/www.zip|Web root zip"
  "high|/html.zip|Web root zip"
  "high|/dump.rdb|Redis dump"
  "high|/mongodump.gz|MongoDB dump"

  # Log files
  "high|/error.log|Error log"
  "high|/access.log|Access log"
  "high|/debug.log|Debug log"
  "high|/app.log|Application log"
  "high|/laravel.log|Laravel log"
  "high|/application.log|Application log"
  "high|/storage/logs/laravel.log|Laravel storage log"
  "high|/var/log/apache2/error.log|Apache error log"
  "high|/npm-debug.log|NPM debug log"

  # PHP / server info
  "high|/phpinfo.php|PHP info page"
  "high|/info.php|PHP info"
  "high|/test.php|PHP test page"
  "high|/debug.php|PHP debug page"
  "high|/php.php|PHP info page"
  "high|/web.config|IIS config"
  "high|/.htaccess|Apache htaccess"
  "high|/server-status|Apache server status"
  "high|/server-info|Apache server info"
  "high|/.DS_Store|macOS directory metadata"
  "high|/elmah.axd|.NET error log viewer"
  "high|/trace.axd|ASP.NET trace"
  "high|/glimpse_handler.axd|Glimpse .NET profiler"

  # Admin panels / management tools
  "high|/adminer.php|Adminer DB tool"
  "high|/adminer/|Adminer DB tool"
  "high|/phpmyadmin/|phpMyAdmin"
  "high|/pma/|phpMyAdmin (short)"
  "high|/admin/|Admin panel"
  "high|/administrator/|Admin panel"
  "high|/wp-admin/|WordPress admin"
  "high|/manager/|Manager panel"
  "high|/cpanel/|cPanel"
  "high|/webadmin/|Web admin"
  "high|/controlpanel/|Control panel"
  "high|/portal/|Portal"
  "high|/backend/|Backend panel"
  "medium|/kibana/|Kibana dashboard"
  "medium|/grafana/|Grafana dashboard"
  "medium|/prometheus/|Prometheus metrics"
  "medium|/elasticsearch/|Elasticsearch"
  "medium|/_plugin/kibana/|Elasticsearch Kibana plugin"
  "medium|/solr/|Apache Solr"
  "medium|/jenkins/|Jenkins CI"

  # Debug / dev pages
  "high|/__debug__/|Django debug toolbar"
  "high|/debug/|Debug page"
  "high|/console/|Rails/dev console"
  "high|/rails/info/properties|Rails info"
  "medium|/actuator|Spring Boot actuator"
  "medium|/actuator/env|Spring Boot env"
  "medium|/actuator/health|Spring Boot health"
  "medium|/actuator/mappings|Spring Boot routes"
  "medium|/metrics|App metrics endpoint"
  "medium|/health|Health endpoint"
  "medium|/status|Status endpoint"
  "medium|/version|Version endpoint"
  "medium|/build-info|Build info"

  # Package manifests / dependency files
  "medium|/composer.json|PHP Composer manifest"
  "medium|/composer.lock|PHP Composer lock"
  "medium|/package.json|Node.js manifest"
  "medium|/package-lock.json|npm lock file"
  "medium|/yarn.lock|Yarn lock file (version disclosure)"
  "medium|/Gemfile|Ruby Gemfile"
  "medium|/Gemfile.lock|Ruby lock file"
  "medium|/requirements.txt|Python requirements"
  "medium|/Pipfile|Python Pipfile"
  "medium|/Pipfile.lock|Python Pipfile lock"
  "medium|/go.sum|Go module checksums"
  "medium|/go.mod|Go module file"
  "medium|/pom.xml|Maven POM"
  "medium|/build.gradle|Gradle build"

  # API / documentation
  "medium|/swagger.json|Swagger spec"
  "medium|/swagger.yaml|Swagger spec"
  "medium|/swagger/v1/swagger.json|Swagger v1"
  "medium|/api/swagger.json|API Swagger"
  "medium|/api-docs|API docs"
  "medium|/api/docs|API docs"
  "medium|/openapi.json|OpenAPI spec"
  "medium|/openapi.yaml|OpenAPI spec"
  "medium|/graphql|GraphQL endpoint"
  "medium|/graphiql|GraphiQL interface"
  "medium|/wp-json/wp/v2/users|WordPress user enumeration"

  # Source maps (expose full source code)
  "high|/app.js.map|JavaScript source map"
  "high|/bundle.js.map|Bundle source map"
  "high|/main.js.map|Main JS source map"
  "high|/vendor.js.map|Vendor JS source map"
  "high|/app.min.js.map|Minified JS source map"
  "high|/static/js/main.js.map|React/CRA source map"

  # Misc info disclosure
  "medium|/robots.txt|Robots.txt"
  "medium|/sitemap.xml|Sitemap"
  "medium|/crossdomain.xml|Flash cross-domain policy"
  "medium|/clientaccesspolicy.xml|Silverlight policy"
  "medium|/.well-known/security.txt|Security policy"
  "medium|/README.md|README"
  "medium|/CHANGELOG.md|Changelog"
  "medium|/INSTALL.md|Install instructions"
  "medium|/TODO|Todo list"
  "medium|/humans.txt|Humans.txt"
  "info|/.well-known/|Well-known directory"
)

# ── Subdirectories to probe in --deep mode ────────────────────────────────────
DEEP_DIRS=(
  "/api" "/api/v1" "/api/v2" "/v1" "/v2"
  "/app" "/application" "/backend" "/frontend"
  "/public" "/static" "/assets" "/dist" "/build" "/src"
  "/uploads" "/files" "/media" "/storage" "/data"
  "/config" "/conf" "/configuration" "/settings"
  "/private" "/secret" "/internal" "/hidden"
  "/tmp" "/temp" "/cache" "/logs" "/log"
  "/test" "/tests" "/dev" "/development" "/staging"
  "/old" "/backup" "/bak" "/archive"
  "/admin" "/management" "/panel"
)

# Files to check inside each deep dir
DEEP_FILES=(
  "critical|/.env|Environment variables"
  "critical|/.env.local|Local env"
  "critical|/.env.production|Production env"
  "critical|/config.php|PHP config"
  "critical|/config.json|Config file"
  "critical|/config.yml|YAML config"
  "critical|/secrets.json|Secrets"
  "critical|/credentials.json|Credentials"
  "critical|/database.yml|DB config"
  "critical|/.git/config|Git config"
  "high|/phpinfo.php|PHP info"
  "high|/debug.php|Debug page"
  "high|/backup.sql|SQL backup"
  "high|/dump.sql|SQL dump"
  "high|/error.log|Error log"
  "high|/debug.log|Debug log"
  "high|/access.log|Access log"
  "high|/web.config|IIS config"
  "high|/Dockerfile|Dockerfile"
  "high|/docker-compose.yml|Docker Compose"
  "medium|/swagger.json|Swagger spec"
  "medium|/openapi.json|OpenAPI spec"
  "medium|/package.json|Node manifest"
  "medium|/requirements.txt|Python deps"
)

# ── Backup variants of common filenames ───────────────────────────────────────
BACKUP_BASES=(
  "index.php" "config.php" "wp-config.php" "settings.php"
  "database.php" "connect.php" "db.php" "login.php"
  "admin.php" "upload.php" "functions.php" "init.php"
  ".env" "config.json" "config.yml" "settings.py"
  "application.yml" "application.properties"
)
BACKUP_EXTS=(".bak" ".backup" ".old" ".orig" ".copy" ".save" ".swp" "~" ".1" "_backup" ".disabled")

# ── Common subdomains ─────────────────────────────────────────────────────────
SUBDOMAINS=(
  www api dev development staging stage test beta
  admin administrator manager portal backend frontend
  mail smtp pop3 imap webmail m mobile
  ftp sftp files upload cdn static assets media img
  git gitlab github bitbucket svn
  jenkins ci cd jira confluence wiki docs
  vpn remote rdm ssh
  kibana grafana prometheus monitor
  db database mysql postgres redis mongo
  internal intranet corp lan
  old legacy archive backup demo sandbox
  shop store payment checkout
  auth sso login register
  app webapp web
)

# ─────────────────────────────────────────────────────────────────────────────
# SCAN FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

# ── Phase 0: Reachability check ───────────────────────────────────────────────
phase_reachability() {
  echo -e "\n${BOLD}[Phase 0]${RESET} Connectivity check"
  local code
  code=$(probe "$DOMAIN/")

  # If HTTPS fails, try HTTP automatically
  if [[ "$code" == "000" || "$code" == "0" || -z "$code" ]]; then
    echo -e "  ${YELLOW}HTTPS unreachable, trying HTTP…${RESET}"
    if [[ "$DOMAIN" == https://* ]]; then
      local http_domain="http://${DOMAIN#https://}"
      code=$(probe "$http_domain/")
      if [[ "$code" != "000" && "$code" != "0" && -n "$code" ]]; then
        DOMAIN="$http_domain"
        echo -e "  ${YELLOW}Switched to HTTP:${RESET} ${DOMAIN}"
      fi
    fi
  fi

  if [[ "$code" == "000" || "$code" == "0" || -z "$code" ]]; then
    echo -e "  ${RED}Cannot reach ${DOMAIN}${RESET}"
    echo -e "  ${DIM}Tips: check the domain spelling, or try with www. prefix${RESET}"
    exit 1
  fi

  echo -e "  ${GREEN}Reachable${RESET} (HTTP $code)  →  ${DOMAIN}"
}

# ── Phase 1: Subdomain enumeration ────────────────────────────────────────────
phase_subdomains() {
  echo -e "\n${BOLD}[Phase 1]${RESET} Subdomain enumeration (${#SUBDOMAINS[@]} names)"
  PHASE_LABEL="subs"
  local total=${#SUBDOMAINS[@]} i=0
  for sub in "${SUBDOMAINS[@]}"; do
    local target_url="${SCHEME}://${sub}.${BASE_HOST}"
    show_progress "$target_url"
    {
      local code; code=$(probe "$target_url/")
      if [[ "$code" != "0" && "$code" != "000" && "$code" != "400" && -n "$code" ]]; then
        echo "${CYAN}SUBDOMAIN${RESET}  ${target_url}  ${DIM}HTTP ${code}${RESET}" >> "$TMP_DIR/info"
        log_file "[INFO] Subdomain alive: ${target_url} (HTTP ${code})"
      fi
      echo . >> "$TMP_DIR/scanned"
    } &
    i=$((i+1)); wait_for_slot
  done
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${i} names checked"
}

# ── Phase 2: Root-level flat scan ─────────────────────────────────────────────
phase_root() {
  echo -e "\n${BOLD}[Phase 2]${RESET} Root-level scan (${#ROOT_TARGETS[@]} paths)"
  PHASE_LABEL="root"
  local i=0
  for entry in "${ROOT_TARGETS[@]}"; do
    IFS='|' read -r sev path desc <<< "$entry"
    local url="${DOMAIN}${path}"
    show_progress "$path"
    {
      local code; code=$(probe "$url")
      echo . >> "$TMP_DIR/scanned"
      [[ "$code" == "200" ]] && record "$sev" "$url" "$desc"
    } &
    i=$((i+1)); wait_for_slot
  done
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${i} paths checked"
}

# ── Phase 3: Deep directory scan ──────────────────────────────────────────────
phase_deep() {
  local total=$(( ${#DEEP_DIRS[@]} * ${#DEEP_FILES[@]} ))
  echo -e "\n${BOLD}[Phase 3]${RESET} Deep directory scan (${#DEEP_DIRS[@]} dirs × ${#DEEP_FILES[@]} files = ${total} probes)"
  PHASE_LABEL="deep"
  for base in "${DEEP_DIRS[@]}"; do
    for entry in "${DEEP_FILES[@]}"; do
      IFS='|' read -r sev path desc <<< "$entry"
      local url="${DOMAIN}${base}${path}"
      show_progress "${base}${path}"
      {
        local code; code=$(probe "$url")
        echo . >> "$TMP_DIR/scanned"
        [[ "$code" == "200" ]] && record "$sev" "$url" "$desc (in ${base})"
      } &
      wait_for_slot
    done
  done
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${total} paths checked"
}

# ── Phase 4: Backup file variants ─────────────────────────────────────────────
phase_backup() {
  local total=$(( ${#BACKUP_BASES[@]} * ${#BACKUP_EXTS[@]} ))
  echo -e "\n${BOLD}[Phase 4]${RESET} Backup/swap file scan (${total} variants)"
  PHASE_LABEL="backup"
  for base in "${BACKUP_BASES[@]}"; do
    for ext in "${BACKUP_EXTS[@]}"; do
      local path="/${base}${ext}"
      local url="${DOMAIN}${path}"
      show_progress "$path"
      {
        local code; code=$(probe "$url")
        echo . >> "$TMP_DIR/scanned"
        [[ "$code" == "200" ]] && record "high" "$url" "Backup/swap variant of ${base}"
      } &
      wait_for_slot
    done
  done
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${total} variants checked"
}

# ── Phase 5: Directory listing detection ──────────────────────────────────────
phase_dirlisting() {
  local dirs=("/" "/uploads/" "/files/" "/backup/" "/static/" "/assets/"
              "/images/" "/img/" "/css/" "/js/" "/media/" "/data/"
              "/logs/" "/log/" "/tmp/" "/temp/" "/old/" "/test/")
  echo -e "\n${BOLD}[Phase 5]${RESET} Directory listing detection (${#dirs[@]} dirs)"
  PHASE_LABEL="dirlist"
  for dir in "${dirs[@]}"; do
    local url="${DOMAIN}${dir}"
    show_progress "$url"
    {
      local body; body=$(probe_body "$url")
      echo . >> "$TMP_DIR/scanned"
      if echo "$body" | grep -qiE "Index of |Directory listing for |Parent Directory|<title>Index of"; then
        record "high" "$url" "Directory listing enabled – file tree exposed"
      fi
    } &
    wait_for_slot
  done
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${#dirs[@]} dirs checked"
}

# ── Phase 6: Crawl homepage links ─────────────────────────────────────────────
phase_crawl() {
  echo -e "\n${BOLD}[Phase 6]${RESET} Homepage crawl"
  PHASE_LABEL="crawl"
  show_progress "Fetching ${DOMAIN}/"
  local body; body=$(probe_body "${DOMAIN}/")
  # Extract all href and src values
  local links
  links=$(echo "$body" | grep -oiE '(href|src)="[^"#?]*"' | \
    grep -oiE '"[^"]*"' | tr -d '"' | \
    grep -vE '^(#|javascript:|mailto:|tel:)' | \
    sort -u | head -80)
  local count=0
  while IFS= read -r link; do
    [[ -z "$link" ]] && continue
    # Make absolute URL
    local full_url
    if [[ "$link" == http* ]]; then
      full_url="$link"
    elif [[ "$link" == //* ]]; then
      full_url="${SCHEME}:${link}"
    elif [[ "$link" == /* ]]; then
      full_url="${DOMAIN}${link}"
    else
      full_url="${DOMAIN}/${link}"
    fi
    # Only probe same-host URLs
    [[ "$full_url" != *"$BASE_HOST"* ]] && continue
    show_progress "link: $link"
    {
      local code; code=$(probe "$full_url")
      echo . >> "$TMP_DIR/scanned"
      # Flag if it looks like a sensitive file
      if [[ "$code" == "200" ]]; then
        if echo "$link" | grep -qiE '\.(env|sql|bak|backup|key|pem|log|cfg|conf|config|yml|yaml|json|xml|csv|xls|xlsx|gz|tar|zip)$'; then
          record "high" "$full_url" "Sensitive file linked from homepage"
        fi
      fi
    } &
    count=$((count+1)); wait_for_slot
  done <<< "$links"
  wait
  printf "\r%80s\r" ""
  echo -e "  Done — ${count} links checked"
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

echo
echo -e "${BOLD}╔═══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║      Advanced Exposed Document Scanner v2             ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════╝${RESET}"
echo -e "  ${DIM}Target    :${RESET} ${BOLD}${DOMAIN}${RESET}"
echo -e "  ${DIM}Parallel  :${RESET} ${PARALLEL} requests"
echo -e "  ${DIM}Timeout   :${RESET} ${TIMEOUT}s / request"
extras=""
[[ $DO_SUBS   -eq 1 ]] && extras+=" subdomains"
[[ $DO_DEEP   -eq 1 ]] && extras+=" deep"
[[ $DO_BACKUP -eq 1 ]] && extras+=" backup"
[[ $DO_CRAWL  -eq 1 ]] && extras+=" crawl"
[[ -n "$extras" ]] && echo -e "  ${DIM}Extras    :${RESET}${extras}"
[[ -n "$OUTPUT" ]]  && echo -e "  ${DIM}Output    :${RESET} ${OUTPUT}"
echo
echo -e "  ${RED}WARNING: Only scan systems you own or are authorised to test.${RESET}"

phase_reachability
[[ $DO_SUBS   -eq 1 ]] && phase_subdomains
phase_root
[[ $DO_DEEP   -eq 1 ]] && phase_deep
[[ $DO_BACKUP -eq 1 ]] && phase_backup
phase_dirlisting
[[ $DO_CRAWL  -eq 1 ]] && phase_crawl

# ── Results ───────────────────────────────────────────────────────────────────
# Count from temp files (subshells wrote here instead of in-memory variables)
TOTAL_SCANNED=$(wc -l < "$TMP_DIR/scanned" 2>/dev/null | tr -d ' ')
N_CRITICAL=$(wc -l < "$TMP_DIR/critical" 2>/dev/null | tr -d ' ')
N_HIGH=$(wc -l < "$TMP_DIR/high"     2>/dev/null | tr -d ' ')
N_MEDIUM=$(wc -l < "$TMP_DIR/medium"  2>/dev/null | tr -d ' ')
N_INFO=$(wc -l < "$TMP_DIR/info"    2>/dev/null | tr -d ' ')
TOTAL_FOUND=$(( N_CRITICAL + N_HIGH + N_MEDIUM + N_INFO ))

echo
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD} RESULTS — ${DOMAIN}${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════${RESET}"

if [[ $N_INFO -gt 0 ]]; then
  echo -e "\n${CYAN}${BOLD}── Subdomains / Info ────────────────────────────────────${RESET}"
  while IFS= read -r l; do echo -e "  $l"; done < "$TMP_DIR/info"
fi
if [[ $N_CRITICAL -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}── CRITICAL ─────────────────────────────────────────────${RESET}"
  while IFS= read -r l; do echo -e "  $l"; done < "$TMP_DIR/critical"
fi
if [[ $N_HIGH -gt 0 ]]; then
  echo -e "\n${YELLOW}${BOLD}── HIGH ─────────────────────────────────────────────────${RESET}"
  while IFS= read -r l; do echo -e "  $l"; done < "$TMP_DIR/high"
fi
if [[ $N_MEDIUM -gt 0 ]]; then
  echo -e "\n${BLUE}${BOLD}── MEDIUM ───────────────────────────────────────────────${RESET}"
  while IFS= read -r l; do echo -e "  $l"; done < "$TMP_DIR/medium"
fi

if [[ $TOTAL_FOUND -eq 0 ]]; then
  echo -e "\n  ${GREEN}Nothing found across ${TOTAL_SCANNED} probes.${RESET}"
fi

echo
echo -e "${DIM}───────────────────────────────────────────────────────────${RESET}"
echo -e "  Probes   : ${TOTAL_SCANNED}"
echo -e "  Found    : ${BOLD}${TOTAL_FOUND}${RESET}"
echo -e "  Critical : ${RED}${N_CRITICAL}${RESET}  High: ${YELLOW}${N_HIGH}${RESET}  Medium: ${BLUE}${N_MEDIUM}${RESET}  Info: ${CYAN}${N_INFO}${RESET}"
[[ -n "$OUTPUT" ]] && echo -e "  Saved to : ${OUTPUT}"
echo
