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
    async def zero_token(self, native_reason='abort', finished=True, wrong_id=False, missing_usage=False, sse_finish=None, duplicate=False, done=True):
        with tempfile.TemporaryDirectory() as directory:
            class Chat:
                async def chat_completion_stream_generator(self, request, result_generator, request_id,
                        model_name, conversation, tokenizer, request_metadata, **kwargs):
                    async for result in result_generator:
                        # Pinned upstream skips a terminal choice when no text/token was produced.
                        yield ('data: '+json.dumps({'id':request_id,'choices':[{'index':0,
                            'delta':{'content':''},'finish_reason':sse_finish}]})+'\n\n').encode()
                    request_metadata.final_usage_info = None if missing_usage else NS(
                        prompt_tokens=17,completion_tokens=0,total_tokens=17)
                    yield ('data: '+json.dumps({'id':request_id,'choices':[],
                        'usage':{'prompt_tokens':17,'completion_tokens':0,'total_tokens':17}})+'\n\n').encode()
                    if done:yield b'data: [DONE]\n\n'
            chat=Chat()
            async def app(scope, receive, send):
                meta=scope['state']['request_metadata']=NS(request_id='native-zero',final_usage_info=None)
                async def output():
                    for _ in range(2 if duplicate else 1):
                        yield NS(request_id='foreign' if wrong_id else 'native-zero',finished=finished,
                            outputs=[NS(index=0,finish_reason=native_reason)])
                await send({'type':'http.response.start','status':200,
                    'headers':[(b'content-type',b'text/event-stream')]})
                async for chunk in chat.chat_completion_stream_generator(NS(n=1),output(),
                        'native-zero','fake',[],None,meta):
                    await send({'type':'http.response.body','body':chunk,'more_body':True})
                await send({'type':'http.response.body','body':b'','more_body':False})
            middleware=TerminalAccountingMiddleware(app,key='fake',instance_id='fixture-instance',directory=directory)
            state=NS(engine_client=NS(),openai_serving_chat=chat)
            def scope(path,method='GET'):
                return {'type':'http','path':path,'method':method,'headers':[(b'authorization',b'Bearer fake'),
                    (b'x-request-id',ID.encode())],'state':{},'app':NS(state=state)}
            async def receive():return {'type':'http.request','body':b''}
            async def discard(message):pass
            await middleware(scope('/v1/chat/completions','POST'),receive,discard)
            replies=[]
            async def reply(message):replies.append(message)
            await middleware(scope(f'/fleet/requests/{ID}/terminal'),receive,reply)
            valid=(finished and done and not wrong_id and not missing_usage and not duplicate
                and native_reason in ['abort','stop'] and (sse_finish is None or sse_finish==native_reason))
            self.assertEqual(replies[0]['status'],200 if valid else 409)
            if valid:
                receipt=json.loads(replies[1]['body'])
                self.assertEqual(receipt['finishReason'],native_reason)
                self.assertEqual(receipt['usage'],{'prompt_tokens':17,'completion_tokens':0,'total_tokens':17})
                self.assertNotIn('content',next(Path(directory).glob('*.json')).read_text())
            else:self.assertEqual(list(Path(directory).glob('*.json')),[])

    async def test_native_iterator_is_closed_when_stream_consumer_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            closed=False
            class Chat:
                async def chat_completion_stream_generator(self, request, result_generator, request_id,
                        model_name, conversation, tokenizer, request_metadata, **kwargs):
                    async for result in result_generator:
                        yield b'unchanged-native-packet'
            async def native():
                nonlocal closed
                try:
                    yield NS(finished=False)
                    await asyncio.Event().wait()
                finally:closed=True
            chat=Chat()
            middleware=TerminalAccountingMiddleware(None,key='fake',instance_id='fixture-instance',directory=directory)
            self.assertTrue(middleware.observe_native_chat({'app':NS(state=NS(openai_serving_chat=chat))}))
            stream=chat.chat_completion_stream_generator(NS(n=1),native(),'native-zero','fake',[],None,
                NS(request_id='native-zero'))
            self.assertEqual(await anext(stream),b'unchanged-native-packet')
            await stream.aclose()
            self.assertTrue(closed)

    async def test_missing_done_stays_unknown(self):await self.zero_token(done=False)
    async def test_native_zero_token_abort_has_exact_terminal_receipt(self):await self.zero_token()
    async def test_native_zero_token_stop_is_not_invented_as_abort(self):await self.zero_token(native_reason='stop')
    async def test_unfinished_zero_token_stream_stays_unknown(self):await self.zero_token(finished=False)
    async def test_foreign_native_zero_token_id_stays_unknown(self):await self.zero_token(wrong_id=True)
    async def test_missing_final_native_usage_stays_unknown(self):await self.zero_token(missing_usage=True)

    async def test_conflicting_native_and_sse_finishes_stay_unknown(self):await self.zero_token(sse_finish='stop')
    async def test_duplicate_native_terminal_output_stays_unknown(self):await self.zero_token(duplicate=True)

    async def test_native_abort_terminal_usage_and_private_atomic_journal(self): await self.scenario()
    async def test_partial_usage_is_not_terminal(self): await self.scenario(partial=True)
    async def test_failed_atomic_journal_does_not_publish_receipt(self): await self.scenario(break_journal=True)

if __name__ == '__main__': unittest.main()
