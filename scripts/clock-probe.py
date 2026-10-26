"""Collect Windows-referenced clocks without changing clocks or calling a model."""
import argparse
import json
import os
import selectors
import statistics
import subprocess
import time
from pathlib import Path

HOST_SCRIPT = '''$ErrorActionPreference="Stop";
[Console]::Out.WriteLine("ready");
while (($line=[Console]::ReadLine()) -ne $null) {
 if($line -eq "stop"){break};
 $q=[Diagnostics.Stopwatch]::GetTimestamp();
 $w=[DateTime]::UtcNow.Ticks;
 $f=[Diagnostics.Stopwatch]::Frequency;
 [Console]::Out.WriteLine(("{0},{1},{2},{3}" -f $line,$q,$w,$f))
}'''


def clocks():
    return {
        'wall': time.time_ns(), 'mono': time.monotonic_ns(),
        'raw': time.clock_gettime_ns(time.CLOCK_MONOTONIC_RAW),
        'boot': time.clock_gettime_ns(time.CLOCK_BOOTTIME),
    }


def collect(output, rate_helper):
    rows = []
    stderr = output.with_name(output.stem + '-stderr.txt').open('x')
    os.chmod(stderr.name, 0o600)
    process = subprocess.Popen([
        '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        '-NoProfile', '-NonInteractive', '-Command', HOST_SCRIPT,
    ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True, bufsize=1)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ)

    def line():
        if not selector.select(15):
            raise TimeoutError('WINDOWS_CLOCK_RESPONSE_TIMEOUT')
        value = process.stdout.readline().strip()
        if not value:
            raise RuntimeError('WINDOWS_CLOCK_EOF')
        return value

    try:
        if line() != 'ready':
            raise RuntimeError('WINDOWS_CLOCK_PROTOCOL')
        for index in range(301):
            before = clocks()
            process.stdin.write(str(index) + '\n')
            process.stdin.flush()
            value = line()
            after = clocks()
            received, qpc, ticks, frequency = map(int, value.split(','))
            if received != index:
                raise RuntimeError('WINDOWS_CLOCK_SEQUENCE')
            rows.append({
                'index': index, 'before': before, 'after': after, 'qpc': qpc,
                'hostUtcTicks': ticks, 'hostFrequency': frequency,
                'timex': json.loads(subprocess.check_output([str(rate_helper)], text=True, timeout=5)),
            })
            if index < 300:
                time.sleep(1)
        process.stdin.write('stop\n')
        process.stdin.flush()
        process.wait(timeout=5)
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        selector.close()
        stderr.close()
    first, last = rows[0], rows[-1]
    return {
        'samples': rows,
        'hostElapsedSeconds': (last['qpc'] - first['qpc']) / first['hostFrequency'],
        'hostWallElapsedSeconds': (last['hostUtcTicks'] - first['hostUtcTicks']) / 1e7,
        'wslElapsedSeconds': {
            key: (last['before'][key] + last['after'][key] - first['before'][key] - first['after'][key]) / 2e9
            for key in first['before']
        },
        'roundTripMs': {
            'median': statistics.median((row['after']['mono'] - row['before']['mono']) / 1e6 for row in rows),
            'max': max((row['after']['mono'] - row['before']['mono']) / 1e6 for row in rows),
        },
        'modelCalls': 0, 'settingsChanged': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--rate-helper', required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    if output.exists():
        raise SystemExit('NEW_PRIVATE_CLOCK_EVIDENCE_REQUIRED')
    result = collect(output, Path(args.rate_helper).resolve())
    with output.open('x') as target:
        os.chmod(output, 0o600)
        json.dump(result, target, indent=2)
    print(json.dumps({key: value for key, value in result.items() if key != 'samples'}))


if __name__ == '__main__':
    main()
