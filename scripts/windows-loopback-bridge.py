"""Private empty-instance bridge: WSL loopback -> Windows curl -> Windows loopback.
Starts no model server. No credentials, request bodies or responses are logged.
"""
import argparse, json, subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
CURL='/mnt/c/Windows/System32/curl.exe'
MAX_BYTES=16*1024*1024
class Handler(BaseHTTPRequestHandler):
 protocol_version='HTTP/1.1'
 def log_message(self,*args):pass
 def reply(self,status,body,headers=()):
  self.send_response(status)
  for key,value in headers:
   if key.lower() not in {'connection','keep-alive','transfer-encoding','trailer','upgrade','content-length','server','date'}:self.send_header(key,value)
  self.send_header('Content-Length',str(len(body)))
  self.send_header('Connection','close');self.end_headers();self.wfile.write(body)
  self.close_connection=True
 def error_reply(self,status,code):
  self.reply(status,json.dumps({'error':code}).encode(),[('Content-Type','application/json')])
 def forward(self):
  target=urlsplit(self.path)
  if target.scheme or target.netloc or not target.path.startswith('/api/') or target.fragment:
   self.error_reply(404,'UNSUPPORTED_PATH');return
  if self.headers.get('Transfer-Encoding'):
   self.error_reply(400,'CONTENT_LENGTH_REQUIRED');return
  try:length=int(self.headers.get('Content-Length','0'))
  except ValueError:self.error_reply(400,'INVALID_LENGTH');return
  if length<0 or length>MAX_BYTES:self.error_reply(413,'REQUEST_TOO_LARGE');return
  self.connection.settimeout(180)
  body=self.rfile.read(length)
  if len(body)!=length:self.error_reply(400,'INCOMPLETE_BODY');return
  args=[CURL,'-q','--noproxy','*','--silent','--show-error','--globoff','--http1.1','--include','--connect-timeout','3','--max-time','180','--request',self.command,'--header','Expect:','--header','Accept-Encoding: identity','--header','Connection: close']
  for name in ['Content-Type','Accept']:
   value=self.headers.get(name)
   if value:args.extend(['--header',f'{name}: {value}'])
  if self.command=='POST':args.extend(['--data-binary','@-'])
  args.append(f'http://127.0.0.1:{self.server.upstream_port}{self.path}')
  try:
   r=subprocess.run(args,input=body,capture_output=True,timeout=185)
  except (OSError,subprocess.TimeoutExpired):self.error_reply(502,'WINDOWS_TRANSPORT_UNAVAILABLE');return
  if r.returncode:
   self.error_reply(502,'WINDOWS_UPSTREAM_UNAVAILABLE' if r.returncode==7 else 'WINDOWS_UPSTREAM_REQUEST_FAILED');return
  try:
   header,data=r.stdout.split(b'\r\n\r\n',1)
   lines=header.decode('iso-8859-1').split('\r\n');status=int(lines[0].split(' ',2)[1])
   headers=[line.split(':',1) for line in lines[1:] if ':' in line]
  except (ValueError,IndexError):self.error_reply(502,'INVALID_WINDOWS_RESPONSE');return
  self.reply(status,data,[(k,v.strip()) for k,v in headers])
 def do_GET(self):self.forward()
 def do_POST(self):self.forward()
class Server(ThreadingHTTPServer):daemon_threads=True
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--listen-port',type=int,default=11435);p.add_argument('--upstream-port',type=int,default=11434);a=p.parse_args()
 if not all(1<=x<=65535 for x in [a.listen_port,a.upstream_port]):p.error('Invalid port')
 server=Server(('127.0.0.1',a.listen_port),Handler);server.upstream_port=a.upstream_port
 server.serve_forever()
