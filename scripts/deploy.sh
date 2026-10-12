#!/usr/bin/env bash
set -euo pipefail
host=${1:?Usage: scripts/deploy.sh user@host}
[[ "$host" =~ ^[a-zA-Z0-9_.@:-]+$ ]] || exit 2
cd "$(dirname "$0")/.."
revision=$(git rev-parse HEAD)
git diff --quiet
git diff --cached --quiet
if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  echo 'Commit reviewed source before deploying.' >&2; exit 1
fi
archive=$(mktemp /tmp/fleet-release.XXXXXX)
trap 'rm -f "$archive"' EXIT
git archive --format=tar.gz --output="$archive" "$revision"
scp -q "$archive" "$host:/tmp/fleet-$revision.tar.gz"
ssh -o BatchMode=yes "$host" "bash -s -- '$revision'" <<'REMOTE'
set -euo pipefail
revision=$1
release=/opt/fleet/releases/$revision
private=/var/lib/fleet
[ -r "$private/fleet.env" ] || { echo 'Prepare protected /var/lib/fleet/fleet.env first.' >&2; exit 1; }
# A source deployment is not authorization to start inference.
grep -qx 'FLEET_LIVE_ENABLED=0' "$private/fleet.env"
mkdir -p "$release"
tar -xzf "/tmp/fleet-$revision.tar.gz" -C "$release"
rm "/tmp/fleet-$revision.tar.gz"
ln -sfn "$private/fleet.env" "$release/.env"
cd "$release"
docker build --build-arg "FLEET_REVISION=$revision" -t "fleet:$revision" . > "$release/build.log" 2>&1
cat > compose.image.yml <<YAML
services:
  console:
    image: fleet:$revision
  worker:
    image: fleet:$revision
YAML
compose() { docker compose -f compose.yml -f compose.codex.yml -f compose.image.yml "$@"; }
if [ -L /opt/fleet/current ]; then readlink -f /opt/fleet/current > "$private/previous-release"; fi
compose up -d --no-build database
compose run --rm --no-deps console node dist/server/migrate.js
compose up -d --no-build console worker
curl --retry 5 --retry-all-errors --retry-delay 1 -fsS http://127.0.0.1:8820/health > "$release/health.json"
python3 - "$release/health.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
assert x['ok'] and x['service']=='fleet' and x['game']=='pact' and x['liveEnabled'] is False
print('Fleet console healthy; game=pact; execution disabled.')
PY
if [ -f "$private/state/migration-proof.json" ]; then
  compose run --rm --no-deps worker node scripts/state-proof.mjs verify /app/.state/migration-proof.json
fi
ln -sfn "$release" /opt/fleet/current
printf '%s\n' "$revision" > "$private/deployed-revision"
compose ps --format json > "$release/services.json"
echo "Deployed committed Fleet release $revision"
REMOTE
