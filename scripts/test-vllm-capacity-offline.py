"""CPU metadata checks only. Run with the pinned vLLM Python and CUDA_VISIBLE_DEVICES=''."""
import os
os.environ['CUDA_VISIBLE_DEVICES']=''
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
import asyncio,json,sys,unittest
from pathlib import Path
from types import SimpleNamespace as NS
sys.path.insert(0,str(Path(__file__).parent/'lib'))
import torch
from vllm.v1.kv_cache_interface import FullAttentionSpec,MambaSpec,KVCacheGroupSpec,KVCacheConfig
from fleet_vllm_capacity import build_profile,CacheProfileMiddleware

class CapacityExportTests(unittest.TestCase):
 def setUp(self):
  a=FullAttentionSpec(block_size=976,num_kv_heads=8,head_size=128,dtype=torch.bfloat16)
  m=MambaSpec(block_size=16384,shapes=((96,80,128),),dtypes=(torch.float32,),page_size_padded=a.page_size_bytes)
  self.kv=KVCacheConfig(num_blocks=57,kv_cache_tensors=[],kv_cache_groups=[KVCacheGroupSpec(layer_names=[str(i)],kv_cache_spec=m)for i in range(6)]+[KVCacheGroupSpec(layer_names=['a'],kv_cache_spec=a)])
  self.config=NS(cache_config=NS(enable_prefix_caching=False,mamba_cache_mode='none'),speculative_config=None,parallel_config=NS(tensor_parallel_size=1,pipeline_parallel_size=1),model_config=NS(served_model_name=['nemotron-4b'],max_model_len=16384),scheduler_config=NS(max_num_seqs=4),compute_hash=lambda:'synthetic-engine')
 def profile(self):return build_profile(self.config,self.kv,endpoint='http://127.0.0.1:18535/v1',instance_id='synthetic-instance')
 def test_exports_actual_pool_and_group_metadata(self):
  p=self.profile();self.assertEqual(p['poolBlocks'],57);self.assertEqual(len(p['groups']),7);self.assertEqual(p['groups'][0],{'kind':'mamba','mode':'none','blocksPerRequest':1});self.assertEqual(p['groups'][-1],{'kind':'full-attention','blockTokens':976});self.assertEqual(len(p['engineConfigSha256']),64);self.assertFalse(torch.cuda.is_initialized())
 def test_refuses_cache_modes_without_an_implemented_bound(self):
  self.config.cache_config.enable_prefix_caching=True
  with self.assertRaises(ValueError):self.profile()
 def test_authenticated_endpoint_exports_once_and_rejects_public_access(self):
  async def run():
   calls=[];sent=[]
   class Engine:
    async def collective_rpc(inner,method,timeout=None):calls.append(method);return [self.profile()]
   async def app(scope,receive,send):raise AssertionError('metadata request reached inference app')
   middleware=CacheProfileMiddleware(app,key='fake-key')
   state=NS(engine_client=Engine());scope={'type':'http','method':'GET','path':'/fleet/cache-profile','headers':[],'app':NS(state=state)}
   async def send(value):sent.append(value)
   async def receive():return {'type':'http.request'}
   await middleware(scope,receive,send);self.assertEqual(sent[0]['status'],401);self.assertEqual(calls,[])
   scope['headers']=[(b'authorization',b'Bearer fake-key')];sent.clear();await middleware(scope,receive,send);self.assertEqual(sent[0]['status'],200);sent.clear();await middleware(scope,receive,send);self.assertEqual(len(calls),1)
  asyncio.run(run())

if __name__=='__main__':unittest.main()
