"""Independent fail-closed clock/process guardian. No model calls, replay or GUI."""
from pathlib import Path
import hashlib
import json
import os
import selectors
import signal
import subprocess
import sys
import time
import uuid

HOST = r'''$ErrorActionPreference="Stop";
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class FleetAwake{[DllImport("kernel32.dll")]public static extern uint SetThreadExecutionState(uint flags);}';
try {
 [FleetAwake]::SetThreadExecutionState(2147483649) | Out-Null;
 [Console]::Out.WriteLine("ready");
 while(($line=[Console]::ReadLine()) -ne $null){if($line -eq "stop"){break};[Console]::Out.WriteLine(("{0},{1},{2}" -f [Diagnostics.Stopwatch]::GetTimestamp(),[Diagnostics.Stopwatch]::Frequency,[DateTime]::UtcNow.Ticks))}
} finally {[FleetAwake]::SetThreadExecutionState(2147483648) | Out-Null}'''


def private_json(path, value):
    temp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.next')
    with temp.open('x') as stream:
        json.dump(value, stream, indent=2)
    temp.chmod(0o600)
    temp.replace(path)


def identity(pid):
    proc = Path('/proc') / str(pid)
    s = (proc / 'stat').read_text()
    values = s[s.rfind(')') + 2:].split()
    return {'pid': pid, 'startTicks': values[19], 'state': values[0], 'cwd': str((proc / 'cwd').resolve()),
            'commandSha256': hashlib.sha256((proc / 'cmdline').read_bytes()).hexdigest()}


def matches(record):
    try:
        current = identity(record['pid'])
        return current['state'] != 'Z' and all(current[k] == record[k] for k in ['startTicks', 'cwd', 'commandSha256'])
    except (FileNotFoundError, ProcessLookupError):
        return False


class HostClock:
    """Replace a lost pipe at most twice; the caller retains the original clock anchors."""
    def __init__(self, command, errors, record):
        self.command, self.errors, self.record = command, errors, record
        self.restarts = 0
        self.process = None
        self.selector = None
        try:
            self.start()
        except Exception:
            self.close()
            raise

    def start(self):
        self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.errors, text=True, bufsize=1)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        if self.read() != 'ready':
            raise RuntimeError('WINDOWS_CLOCK_PROTOCOL')

    def read(self):
        if not self.selector.select(3):
            raise RuntimeError('WINDOWS_CLOCK_UNAVAILABLE')
        line = self.process.stdout.readline().strip()
        if not line:
            raise EOFError('WINDOWS_CLOCK_EOF')
        return line

    def sample(self):
        for attempt in range(2):
            try:
                before = time.monotonic_ns()
                self.process.stdin.write('sample\n')
                self.process.stdin.flush()
                qpc, frequency, utc = map(int, self.read().split(','))
                after = time.monotonic_ns()
                return {'qpc': qpc, 'frequency': frequency, 'utcTicks': utc,
                        'monoMs': (before + after) / 2e6, 'roundTripMs': (after - before) / 1e6,
                        'wallMs': time.time() * 1000}
            except (BrokenPipeError, EOFError) as error:
                self.record({'event': 'clock-helper-lost', 'pid': self.process.pid,
                             'exitCode': self.process.poll(), 'errorType': type(error).__name__,
                             'restart': self.restarts + 1, 'at': time.time()})
                if attempt or self.restarts >= 2:
                    raise RuntimeError('WINDOWS_CLOCK_RESTART_LIMIT') from error
                self.restarts += 1
                self.close()
                self.start()

    def close(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
            self.process.wait(timeout=3)
            try:
                self.process.stdin.close()
            except BrokenPipeError:
                pass
            self.process.stdout.close()
        if self.selector is not None:
            self.selector.close()


def invalid_clock(sample, start, previous):
    if (sample['frequency'] != start['frequency'] or sample['frequency'] <= 0
            or sample['qpc'] < start['qpc'] or sample['roundTripMs'] > 500):
        return 'HOST_CLOCK_INVALID'
    if previous:
        host_ms = (sample['qpc'] - previous['qpc']) / sample['frequency'] * 1000
        if (host_ms < 0 or abs(host_ms - sample['monoMs'] + previous['monoMs']) > 250
                or abs((sample['utcTicks'] - previous['utcTicks']) / 10000 - host_ms) > 250):
            return 'HOST_CLOCK_DISAGREEMENT'
    return None


def loop(root):
    c = json.loads((root / 'config.json').read_text())
    assert c['root'] == str(root) and c['schemaVersion'] == 'pact.fresh-24h.v1'
    fixture = c.get('purpose') == 'clock-only-guardian-fixture'
    record = json.loads((root / 'supervisor.json').read_text())
    primary = json.loads((root / 'supervisor.process.json').read_text())
    log = (root / 'logs/guardian-clock.ndjson').open('x')
    error_log = (root / 'logs/guardian-host-stderr.txt').open('x')
    def helper_event(event):
        with (root / 'logs/guardian-helper-events.ndjson').open('a') as events:
            events.write(json.dumps(event) + '\n')
    host = None

    def trip(reason):
        path = root / 'window.json'
        marker = Path(str(path) + '.closed')
        try:
            with marker.open('x') as stream:
                json.dump({'reason': reason, 'at': int(time.time() * 1000)}, stream)
            marker.chmod(0o600)
        except FileExistsError:
            pass
        first = json.loads(marker.read_text())
        window = json.loads(path.read_text())
        private_json(path, {**window, 'status': 'closed', 'reason': first['reason'], 'closedAt': first['at']})
        private_json(root / 'stop-request.json', {'reason': first['reason']})
        if not fixture:
            env = {'PATH': str(Path(c['node']).parent) + ':/usr/local/bin:/usr/bin:/bin', 'HOME': str(Path.home()), 'LANG': 'C.UTF-8'}
            # The Node controller revalidates both database labels and process identities.
            with (root / 'logs/guardian-park.log').open('x') as out:
                result = subprocess.run([c['node'], '--import', 'tsx', 'scripts/control-real-pact.ts', 'park', str(root), reason],
                                        cwd=c['fleetRepo'], env=env, stdout=out, stderr=subprocess.STDOUT, timeout=120)
            if result.returncode:
                raise RuntimeError('GUARDIAN_PARK_FAILED')
        private_json(root / 'evidence/guardian-final.json', {'reason': first['reason'], 'admissionClosed': True,
                     'fixture': fixture, 'modelCalls': 0, 'at': time.time()})

    try:
        host = HostClock(['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-NonInteractive', '-Command', HOST], error_log, helper_event)
        private_json(root / 'guardian-ready.json', {'pid': os.getpid(), 'ready': True, 'processScopedAwake': True})
        previous = None
        while True:
            current = json.loads((root / 'supervisor.json').read_text())
            if current.get('status') == 'parked':
                private_json(root / 'evidence/guardian-final.json', {'reason': 'PRIMARY_PARKED', 'admissionClosed': True,
                             'fixture': fixture, 'modelCalls': 0, 'at': time.time()})
                return
            if not matches(primary):
                trip('PRIMARY_PROCESS_LOST')
                return
            beat = json.loads((root / 'supervisor-heartbeat.json').read_text())
            if time.monotonic() * 1000 - beat['monoMs'] > 5000 or beat['bootId'] != Path('/proc/sys/kernel/random/boot_id').read_text().strip():
                trip('PRIMARY_HEARTBEAT_LOST')
                return
            if time.monotonic() * 1000 - beat.get('controlMonoMs', beat['monoMs']) > 15000:
                trip('PRIMARY_CONTROL_STALLED')
                return
            sample = host.sample()
            log.write(json.dumps(sample) + '\n')
            log.flush()
            start = record['hostStart']
            invalid = invalid_clock(sample, start, previous)
            if invalid:
                trip(invalid)
                return
            previous = sample
            if (sample['qpc'] - start['qpc']) / sample['frequency'] * 1000 >= record['durationMs']:
                trip('HOST_DEADLINE')
                return
            time.sleep(.5)
    except Exception as error:
        helper_event({'event': 'guardian-error', 'errorType': type(error).__name__,
                      'code': str(error) if isinstance(error, RuntimeError) else 'GUARDIAN_CONTROL_FAILURE',
                      'helperPid': host.process.pid if host else None,
                      'exitCode': host.process.poll() if host else None, 'at': time.time()})
        trip(str(error) if isinstance(error, RuntimeError) else 'GUARDIAN_CONTROL_FAILURE')
        raise
    finally:
        if host:
            host.close()
        log.close()
        error_log.close()


def start(root):
    c = json.loads((root / 'config.json').read_text())
    assert c['root'] == str(root)
    log = (root / 'logs/guardian.log').open('x')
    child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_loop', str(root)], cwd=c['fleetRepo'],
                             stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    private_json(root / 'guardian.process.json', {**identity(child.pid), 'root': str(root), 'name': 'guardian'})
    for _ in range(100):
        if child.poll() is not None:
            raise RuntimeError('GUARDIAN_START_FAILED')
        if (root / 'guardian-ready.json').exists():
            print(json.dumps({'guardianStarted': True, 'pid': child.pid, 'GUI': False}))
            return
        time.sleep(.05)
    raise RuntimeError('GUARDIAN_START_TIMEOUT')


def verify(root):
    original = json.loads((root / 'config.json').read_text())
    assert original.get('purpose') == 'real-workflow-canary'
    assert json.loads((root / 'window.json').read_text())['status'] == 'prepared'
    fixture = root / 'evidence' / ('guardian-clock-only-' + uuid.uuid4().hex[:8])
    fixture.mkdir(mode=0o700)
    for name in ['logs', 'evidence']:
        (fixture / name).mkdir(mode=0o700)
    config = {**original, 'root': str(fixture), 'purpose': 'clock-only-guardian-fixture'}
    private_json(fixture / 'config.json', config)
    private_json(fixture / 'window.json', {'status': 'running'})
    primary = subprocess.Popen([original['node'], '-e', 'setInterval(()=>{},1000)'], cwd=original['fleetRepo'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    private_json(fixture / 'supervisor.process.json', {**identity(primary.pid), 'root': str(fixture)})
    # The verification exercises primary loss with a real Windows clock process and a
    # separate guardian, but does not connect to a database or create a worker/model.
    host_now = subprocess.check_output(['/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                    '[Console]::WriteLine(("{0},{1},{2}" -f [Diagnostics.Stopwatch]::GetTimestamp(),[Diagnostics.Stopwatch]::Frequency,[DateTime]::UtcNow.Ticks))'], text=True, timeout=5)
    qpc, frequency, utc = map(int, host_now.strip().split(','))
    private_json(fixture / 'supervisor.json', {'id': original['id'], 'status': 'running', 'durationMs': 86400000,
                 'hostStart': {'qpc': qpc, 'frequency': frequency, 'utcTicks': utc}})
    private_json(fixture / 'supervisor-heartbeat.json', {'monoMs': time.monotonic() * 1000,
                 'bootId': Path('/proc/sys/kernel/random/boot_id').read_text().strip()})
    try:
        start(fixture)
        primary.terminate()
        primary.wait(timeout=3)
        for _ in range(100):
            if (fixture / 'evidence/guardian-final.json').exists():
                proof = json.loads((fixture / 'evidence/guardian-final.json').read_text())
                assert proof['reason'] == 'PRIMARY_PROCESS_LOST' and proof['admissionClosed']
                private_json(root / 'evidence/guardian-clock-only-verification.json', {'passed': True, 'fixture': str(fixture), 'proof': proof})
                print(json.dumps({'clockOnlyGuardianPassed': True, 'modelCalls': 0, 'workerCalls': 0}))
                return
            time.sleep(.1)
        raise RuntimeError('GUARDIAN_FIXTURE_TIMEOUT')
    finally:
        if primary.poll() is None:
            primary.terminate()
            primary.wait(timeout=3)


if __name__ == '__main__':
    os.umask(0o077)
    action, directory = sys.argv[1:3]
    location = Path(directory).resolve()
    if action == 'start':
        start(location)
    elif action == '_loop':
        loop(location)
    elif action == 'verify':
        verify(location)
    else:
        raise SystemExit('Explicit start/verify operation required')
