#!/usr/bin/env bash
# Run on the deployment host from the reviewed Fleet checkout/release.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
old=/opt/pact-agent-fleet/current
private=/var/lib/fleet
[ -L "$old" ]
[ ! -e "$private/fleet.env" ] || { echo 'Migration already prepared; inspect state instead of overwriting it.' >&2; exit 1; }
if docker volume inspect fleet_fleet_database >/dev/null 2>&1; then
  echo 'Fresh Fleet database volume required; existing volume will not be reset.' >&2; exit 1
fi
available=$(df --output=avail -B1 / | tail -1)
[ "$available" -ge 2147483648 ] || { echo 'Insufficient host disk headroom.' >&2; exit 1; }
mkdir -p "$private/backups"
# Preserve original game-container uptime as a migration assertion.
docker ps --filter label=com.docker.compose.project=pact-production --format '{{.ID}}' | sort > "$private/game-container-ids.before"
docker stop pact-agent-fleet-worker-1
restart_old_worker() { docker start pact-agent-fleet-worker-1 >/dev/null; }
trap restart_old_worker ERR
# No model transport or game calls: proof queries only the independent fleet database.
docker run --rm --user 995:983 --network pact-agent-fleet_default \
  --env-file /var/lib/pact-agent-fleet/fleet.env \
  -v /var/lib/pact-agent-fleet/state:/app/.state \
  -v "$PWD/scripts/state-proof.mjs:/app/state-proof.mjs:ro" \
  pact-agent-fleet:luna-pilot-20261012-11 node /app/state-proof.mjs capture /app/.state/migration-proof.json
backup="$private/backups/pre-migration-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec pact-agent-fleet-database-1 pg_dump -U fleet -d fleet --format=custom > "$backup"
cp -a /var/lib/pact-agent-fleet/state "$private/state"
cp /var/lib/pact-agent-fleet/fleet.env "$private/fleet.env"
python3 - "$private/fleet.env" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); lines=p.read_text().splitlines()
updates={'FLEET_LIVE_ENABLED':'0','FLEET_GAME':'pact','FLEET_HOST_STATE_PATH':'/var/lib/fleet/state','FLEET_WORKER_UID':'995','FLEET_WORKER_GID':'983'}
lines=[line for line in lines if line.split('=',1)[0] not in updates]
lines += [f'{k}={v}' for k,v in updates.items()]
p.write_text('\n'.join(lines)+'\n'); p.chmod(0o600)
PY
ln -sfn "$private/fleet.env" .env
docker compose -f compose.yml up -d database
for _ in $(seq 1 30); do
  if docker compose -f compose.yml exec -T database pg_isready -U fleet -d fleet >/dev/null; then break; fi
  sleep 1
done
docker compose -f compose.yml exec -T database pg_restore -U fleet -d fleet --exit-on-error < "$backup"
printf '%s\n' "$backup" > "$private/migration-backup-path"
docker stop pact-agent-fleet-console-1
trap - ERR
echo 'Fresh Fleet database restored; original fleet stopped and retained. Deploy committed Fleet source next.'
