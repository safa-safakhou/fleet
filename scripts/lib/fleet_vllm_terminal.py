"""Authenticated exact-native-request abort and final usage journal. No inference/content logging."""
import hashlib
import hmac
import json
import os
import re
import tempfile
from pathlib import Path

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
NATIVE = re.compile(r'^[A-Za-z0-9._:-]{1,200}$')
FINISH = {'stop', 'length', 'abort', 'tool_calls', 'content_filter'}


class TerminalAccountingMiddleware:
    def __init__(self, app, key=None, instance_id=None, directory=None):
        self.app = app
        self.key = os.environ.get('VLLM_API_KEY', '') if key is None else key
        self.instance = instance_id or os.environ.get('FLEET_PROVIDER_INSTANCE_ID', '')
        raw = directory or os.environ.get('FLEET_VLLM_TERMINAL_DIRECTORY', '')
        if not self.key or not NATIVE.fullmatch(self.instance) or not raw:
            raise ValueError('TERMINAL_ACCOUNTING_CONFIGURATION_REQUIRED')
        self.directory = Path(raw)
        if self.directory.is_symlink():
            raise ValueError('PRIVATE_TERMINAL_DIRECTORY_REQUIRED')
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.directory.stat().st_mode & 0o077 or any(self.directory.iterdir()):
            raise ValueError('FRESH_PRIVATE_TERMINAL_DIRECTORY_REQUIRED')
        self.requests = {}

    async def reply(self, send, status, data):
        body = json.dumps(data, separators=(',', ':')).encode()
        await send({'type':'http.response.start', 'status':status,
                    'headers':[(b'content-type', b'application/json'), (b'cache-control', b'no-store')]})
        await send({'type':'http.response.body', 'body':body})

    def journal(self, client, entry, finish):
        metadata = entry.get('scope', {}).get('state', {}).get('request_metadata')
        native = getattr(metadata, 'request_id', '')
        usage = getattr(metadata, 'final_usage_info', None)
        values = {name: getattr(usage, name, None) for name in ('prompt_tokens','completion_tokens','total_tokens')}
        if (not NATIVE.fullmatch(native) or finish not in FINISH
                or any(type(n) is not int or n < 0 for n in values.values())
                or values['total_tokens'] != values['prompt_tokens'] + values['completion_tokens']):
            return
        data = {'schemaVersion':'fleet.vllm-terminal.v1', 'instanceId':self.instance,
                'clientRequestId':client, 'nativeRequestId':native, 'finishReason':finish, 'usage':values}
        encoded = json.dumps(data, sort_keys=True, separators=(',', ':')).encode()
        fd, temporary = tempfile.mkstemp(prefix='.pending-', dir=self.directory)
        try:
            with os.fdopen(fd, 'wb') as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.directory / (client + '.json'))
            directory_fd = os.open(self.directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
            entry['receipt'] = {**data, 'sha256':hashlib.sha256(encoded).hexdigest()}
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path, method = scope.get('path', ''), scope.get('method', '')
        control = path.startswith('/fleet/') and path != '/fleet/cache-profile'
        generation = path == '/v1/chat/completions' and method == 'POST'
        if not control and not generation:
            return await self.app(scope, receive, send)
        authorization = dict(scope.get('headers', [])).get(b'authorization', b'')
        if not hmac.compare_digest(authorization, ('Bearer ' + self.key).encode()):
            return await self.reply(send, 401, {'error':'AUTHENTICATION_REQUIRED'})
        if control:
            if path == '/fleet/terminal-accounting' and method == 'GET':
                return await self.reply(send, 200, {'schemaVersion':'fleet.vllm-terminal-capabilities.v1',
                    'instanceId':self.instance, 'nativeAbort':True, 'atomicTerminalJournal':True})
            parts = path.split('/')
            if len(parts) != 5 or parts[2] != 'requests' or not UUID.fullmatch(parts[3]):
                return await self.reply(send, 404, {'error':'REQUEST_NOT_FOUND'})
            entry = self.requests.get(parts[3])
            if entry is None:
                return await self.reply(send, 404, {'error':'REQUEST_NOT_FOUND'})
            if parts[4] == 'terminal' and method == 'GET':
                return await self.reply(send, 200 if entry.get('receipt') else 409,
                                        entry.get('receipt') or {'error':'TERMINAL_USAGE_UNAVAILABLE'})
            if parts[4] == 'abort' and method == 'POST':
                if entry.get('receipt'):
                    return await self.reply(send, 200, {'instanceId':self.instance, 'clientRequestId':parts[3], 'terminal':True})
                metadata = entry.get('scope', {}).get('state', {}).get('request_metadata')
                native = getattr(metadata, 'request_id', '')
                if entry.get('closed') or not NATIVE.fullmatch(native):
                    return await self.reply(send, 409, {'error':'NATIVE_REQUEST_UNAVAILABLE'})
                try:
                    await scope['app'].state.engine_client.abort(native)
                    return await self.reply(send, 200, {'instanceId':self.instance, 'clientRequestId':parts[3], 'nativeRequestId':native})
                except Exception:
                    return await self.reply(send, 503, {'error':'NATIVE_ABORT_UNAVAILABLE'})
            return await self.reply(send, 405, {'error':'METHOD_NOT_ALLOWED'})
        client = dict(scope.get('headers', [])).get(b'x-request-id', b'').decode('ascii', errors='replace')
        if not UUID.fullmatch(client):
            return await self.reply(send, 400, {'error':'CLIENT_REQUEST_ID_REQUIRED'})
        if client in self.requests or len(self.requests) >= 4096:
            return await self.reply(send, 409, {'error':'REQUEST_ID_OR_JOURNAL_CAPACITY'})
        scope.setdefault('state', {})
        entry = self.requests[client] = {'scope':scope}
        pending, finish, native_id, failed, sse = b'', None, None, False, False
        async def observe(message):
            nonlocal pending, finish, native_id, failed, sse
            if message['type'] == 'http.response.start':
                sse = message['status'] == 200 and b'text/event-stream' in dict(message.get('headers', [])).get(b'content-type', b'')
            if message['type'] == 'http.response.body' and sse and not failed:
                pending += message.get('body', b'')
                if len(pending) > 1_000_000:
                    failed, pending = True, b''
                while not failed and b'\n\n' in pending:
                    raw, pending = pending.split(b'\n\n', 1)
                    try:
                        data = b'\n'.join(line[5:].lstrip() for line in raw.splitlines() if line.startswith(b'data:'))
                        if data == b'[DONE]':
                            metadata = scope.get('state', {}).get('request_metadata')
                            if native_id != getattr(metadata, 'request_id', None):
                                raise ValueError('NATIVE_REQUEST_ID_MISMATCH')
                            self.journal(client, entry, finish)
                        elif data:
                            packet = json.loads(data)
                            packet_id = packet.get('id')
                            if not isinstance(packet_id, str) or not NATIVE.fullmatch(packet_id) or (native_id is not None and native_id != packet_id):
                                raise ValueError('NATIVE_REQUEST_ID_MISMATCH')
                            native_id = packet_id
                            if packet.get('error'):
                                failed = True
                            for choice in packet.get('choices', []):
                                reason = choice.get('finish_reason')
                                if reason is not None:
                                    if finish is not None or choice.get('index') != 0:
                                        raise ValueError('AMBIGUOUS_TERMINAL_RESPONSE')
                                    finish = reason
                    except Exception:
                        failed, pending = True, b''
            await send(message)
        try:
            await self.app(scope, receive, observe)
        finally:
            entry['closed'] = True
            entry.pop('scope', None)  # Do not retain prompts, content or ASGI request state.
