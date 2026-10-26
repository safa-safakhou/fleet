"""Create private, separately owned real PACT/Fleet storage. No provider or gameplay starts."""
from pathlib import Path
import base64
import datetime
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
import uuid

os.umask(0o077)
fleet = Path(__file__).resolve().parents[1]
pact = fleet.parent / 'pact'
node = shutil.which('node')
if not node or not subprocess.check_output([node, '--version'], text=True).startswith('v24.'):
    raise SystemExit('Node 24 required')
ident = 'fresh-canary-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d') + '-' + uuid.uuid4().hex[:8]
root = Path.home() / '.local/share' / ('pact-' + ident)
root.mkdir(mode=0o700)
for name in ['logs', 'keys', 'evidence', 'provider']:
    (root / name).mkdir(mode=0o700)


def private_json(name, data):
    with (root / name).open('x') as stream:
        json.dump(data, stream, indent=2)
    (root / name).chmod(0o600)


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


api_port, fleet_port, model_port = free_port(), free_port(), free_port()
secret = lambda: secrets.token_urlsafe(32)
b64 = lambda: base64.b64encode(secrets.token_bytes(32)).decode()
image = subprocess.check_output(['docker', 'image', 'inspect', 'postgres:17-alpine', '--format', '{{.Id}}'], text=True).strip()
containers = {}
for kind in ['pact', 'fleet']:
    password = secret()
    envfile = root / (kind + '-postgres.env')
    envfile.write_text(f'POSTGRES_USER={kind}\nPOSTGRES_DB={kind}\nPOSTGRES_PASSWORD={password}\n')
    envfile.chmod(0o600)
    name = f'{ident}-{kind}-db'
    subprocess.run(['docker', 'run', '--pull=never', '-d', '--name', name, '--label', f'pact.fresh-world={ident}',
                    '--env-file', str(envfile), '-p', '127.0.0.1::5432', '-v', f'{name}-data:/var/lib/postgresql/data', image],
                   check=True, stdout=subprocess.DEVNULL)
    info = json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]
    port = info['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']
    containers[kind] = {'name': name, 'id': info['Id'], 'port': int(port), 'url': f'postgres://{kind}:{password}@127.0.0.1:{port}/{kind}'}
origin = f'http://127.0.0.1:{api_port}'
config = {
    'schemaVersion': 'pact.fresh-24h.v1', 'purpose': 'real-workflow-canary', 'id': ident, 'root': str(root),
    'node': node, 'fleetRepo': str(fleet), 'pactRepo': str(pact), 'postgresImage': image, 'containers': containers,
    'pactContainer': containers['pact']['name'], 'fleetContainer': containers['fleet']['name'],
    'proposalDeadline': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=2)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
    'model': {'endpoint': f'http://127.0.0.1:{model_port}/v1', 'servedName': 'nemotron-4b',
              'repository': 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16', 'revision': 'dfaf35de3e30f1867dd8dbc38a7fc9fb52d3914f'},
    'pactEnv': {'NODE_ENV': 'development', 'HOST': '127.0.0.1', 'PORT': str(api_port), 'DATABASE_URL': containers['pact']['url'],
                'PACT_ORIGIN': origin, 'PACT_PUBLIC_BASE_URL': origin, 'CURRENT_TERMS_VERSION': 'development-v1',
                'IDENTITY_TOKEN_PEPPER': secret(), 'IDENTITY_ENCRYPTION_KEY': secret(), 'RAID_SEED_ENCRYPTION_KEY_BASE64': b64(),
                'SEAL_ENCRYPTION_KEY_BASE64': b64(), 'PACT_GUEST_PLAY': '1', 'PACT_ENABLE_LIVE_MODEL_CALLS': '0',
                'PACT_A2A_ENABLED': '0', 'PACT_AGENT_EVENTS_ENABLED': '1', 'PACT_AGENT_OUTLOOK_ENABLED': '1',
                'PACT_AGENT_ACTION_EFFECTS_ENABLED': '1', 'LOG_LEVEL': 'warn', 'PACT_DELETION_REGISTRY_FILE': str(root / 'deletion-registry.ndjson')},
    'fleetEnv': {'DATABASE_URL': containers['fleet']['url'], 'FLEET_OPERATOR_SECRET': secret(), 'FLEET_VAULT_KEY': b64(),
                 'FLEET_ORIGIN': f'http://127.0.0.1:{fleet_port}', 'FLEET_BIND': '127.0.0.1', 'PORT': str(fleet_port),
                 'FLEET_GAME': 'pact', 'FLEET_GAME_BASE_URL': origin, 'FLEET_ALLOW_HTTP': '1', 'FLEET_LIVE_ENABLED': '0',
                 'FLEET_ENVIRONMENT_ID': 'pact', 'FLEET_ENVIRONMENT_VERSION': '1', 'FLEET_ENVIRONMENT_INSTANCE': ident,
                 'FLEET_RUN_WINDOW_FILE': str(root / 'window.json'), 'FLEET_CONCURRENCY': '8', 'FLEET_COMPATIBLE_CONCURRENCY': '4',
                 'FLEET_STATE_PATH': str(root), 'FLEET_MIN_FREE_BYTES': str(10 * 1024**3),
                 'FLEET_PACT_EVENT_FEED_VERSION': 'pact.agent-events.v1', 'FLEET_PACT_OUTLOOK_VERSION': 'pact.agent-outlook.v1',
                 'FLEET_PACT_ACTION_EFFECTS_VERSION': 'fleet.action-effects.v1', 'FLEET_PACT_COORDINATION_VERSION': 'pact.coordination.v1',
                 'MODEL_BASE_URL': f'http://127.0.0.1:{model_port}/v1'},
}
private_json('config.json', config)
private_json('window.json', {'id': ident, 'status': 'prepared', 'durationMs': 900000, 'startsAt': None, 'endsAt': None,
                             'blockedScenarios': ['E4', 'KQ1'], 'callLimit': 144})
envbase = {'PATH': str(Path(node).parent) + ':/usr/local/bin:/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8'}
for kind in ['pact', 'fleet']:
    for _ in range(100):
        if subprocess.run(['docker', 'exec', containers[kind]['name'], 'pg_isready', '-h', '127.0.0.1', '-U', kind],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.2)
    else:
        raise SystemExit('Owned database readiness failed; private state retained')
    args = ['packages/db/dist/cli.js'] if kind == 'pact' else ['--import', 'tsx', 'scripts/migrate.ts']
    with (root / 'logs' / (kind + '-migration.log')).open('x') as log:
        result = subprocess.run([node, *args], cwd=config[kind + 'Repo'], env={**envbase, **config[kind + 'Env']}, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit('Migration failed; inspect private log, no automatic retry')
bootstrap = "import {createPool} from './packages/db/dist/index.js';import {WorldClockService} from './packages/world/dist/index.js';const p=createPool(process.env.DATABASE_URL);try{const w=new WorldClockService(p,'pact');await w.bootstrap();await w.pause();}finally{await p.end();}"
subprocess.run([node, '--input-type=module', '-e', bootstrap], cwd=pact, env={**envbase, **config['pactEnv']}, check=True, stdout=subprocess.DEVNULL)
print(str(root))
