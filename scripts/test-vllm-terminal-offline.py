"""Synthetic ASGI/native abort tests; no model, network, or hardware allocation."""
import asyncio
from contextlib import nullcontext
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).parent / 'lib'))
from fleet_vllm_terminal import TerminalAccountingMiddleware

ID = 'f7941166-3f61-4011-9061-ddb1f1ebbd16'

class TerminalTests(unittest.IsolatedAsyncioTestCase):
    async def scenario(self, partial=False, break_journal=False):
        with tempfile.TemporaryDirectory() as directory:
            ready, aborted = asyncio.Event(), asyncio.Event()
            aborts, sent = [], []
            async def abort(native):
                aborts.append(native)
                aborted.set()
            engine = NS(abort=abort)
            async def app(scope, receive, send):
                scope['state']['request_metadata'] = NS(request_id='native-exact-unprefixed', final_usage_info=None)
                await send({'type':'http.response.start','status':200,'headers':[(b'content-type', b'text/event-stream')]})
                ready.set()
                await aborted.wait()
                finish = {'id':'native-exact-unprefixed','choices':[{'index':0,'delta':{},'finish_reason':'abort'}]}
                await send({'type':'http.response.body','body':f'data: {json.dumps(finish)}\n\n'.encode(), 'more_body':True})
                if not partial:
                    scope['state']['request_metadata'].final_usage_info = NS(prompt_tokens=17, completion_tokens=3, total_tokens=20)
                await send({'type':'http.response.body','body':b'data: [DONE]\n\n','more_body':False})
            middleware = TerminalAccountingMiddleware(app, key='fake', instance_id='fixture-instance', directory=directory)
            def scope(path, method='GET', auth=True):
                return {'type':'http','path':path,'method':method,'headers':([(b'authorization',b'Bearer fake')] if auth else [])+[(b'x-request-id',ID.encode())], 'state':{},'app':NS(state=NS(engine_client=engine))}
            async def receive(): return {'type':'http.request','body':b'', 'more_body':False}
            async def send(message): sent.append(message)
            running = asyncio.create_task(middleware(scope('/v1/chat/completions','POST'), receive, send))
            await ready.wait()
            result=[]
            async def reply(message): result.append(message)
            await middleware(scope(f'/fleet/requests/{ID}/abort','POST',False), receive, reply)
            self.assertEqual(result[0]['status'],401);self.assertEqual(aborts,[])
            result.clear()
            with patch('fleet_vllm_terminal.os.replace', side_effect=OSError('synthetic')) if break_journal else nullcontext():
                await middleware(scope(f'/fleet/requests/{ID}/abort','POST'), receive, reply)
                await running
            self.assertEqual(aborts,['native-exact-unprefixed'])
            result.clear()
            await middleware(scope(f'/fleet/requests/{ID}/terminal'),receive,reply)
            if partial or break_journal:
                self.assertEqual(result[0]['status'],409)
                self.assertEqual(list(Path(directory).glob('*.json')),[])
            else:
                self.assertEqual(result[0]['status'],200)
                receipt=json.loads(result[1]['body'])
                self.assertEqual(receipt['usage'],{'prompt_tokens':17,'completion_tokens':3,'total_tokens':20})
                self.assertEqual(receipt['nativeRequestId'],'native-exact-unprefixed')
                self.assertEqual(receipt['instanceId'],'fixture-instance')
                self.assertEqual(receipt['finishReason'],'abort')
                files=list(Path(directory).glob('*.json'));self.assertEqual(len(files),1)
                self.assertEqual(files[0].stat().st_mode & 0o777,0o600)
                self.assertNotIn('content',files[0].read_text())
            result.clear()
            unknown='11111111-1111-4111-8111-111111111111'
            await middleware(scope(f'/fleet/requests/{unknown}/abort','POST'),receive,reply)
            self.assertEqual(result[0]['status'],404)
    async def test_native_abort_terminal_usage_and_private_atomic_journal(self): await self.scenario()
    async def test_partial_usage_is_not_terminal(self): await self.scenario(partial=True)
    async def test_failed_atomic_journal_does_not_publish_receipt(self): await self.scenario(break_journal=True)

if __name__ == '__main__': unittest.main()
