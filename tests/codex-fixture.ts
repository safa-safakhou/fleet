import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export async function codexFixture(mode = "ok") {
  const root = await mkdtemp(join(tmpdir(), "pact-fake-cli-"));
  const home = join(root, "home");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(home, { mode: 0o700 });
  const executable = join(root, "codex");
  await writeFile(join(home, "mode"), mode);
  await writeFile(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const home = process.env.CODEX_HOME;
const mode = fs.readFileSync(path.join(home,'mode'),'utf8');
const args = process.argv.slice(2);
fs.appendFileSync(path.join(home,'invocations'),JSON.stringify({args,cwd:process.cwd(),env:process.env})+'\\n');
if(args.includes('login')) {
  console.error(mode === 'api' ? 'Logged in using an API key' : 'Logged in using ChatGPT');
  process.exit(mode === 'no-auth' ? 1 : 0);
}
let input = '';
process.stdin.on('data', b => input += b);
process.stdin.on('end', () => {
  fs.writeFileSync(path.join(home,'prompt'),input);
  if (mode === 'fail') { console.error('synthetic PRIVATE_TEXT'); process.exit(1); }
  if (mode === 'large') { process.stdout.write('x'.repeat(1100000)); return; }
  if (mode === 'sleep') {
    process.on('SIGTERM',()=>{});
    const c = cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
    fs.writeFileSync(path.join(home,'child'),String(c.pid));
    setInterval(()=>{},1000); return;
  }
  const output = args[args.indexOf('--output-last-message')+1];
  fs.writeFileSync(output, mode === 'bad-output' ? '{' : JSON.stringify({decisionJson: JSON.stringify(mode === 'custom' ? JSON.parse(fs.readFileSync(path.join(home,'response.json'),'utf8')) : mode === 'action'
    ? {kind:'action',action:{kind:'game.message.send',recipientKingdomId:'00000000-0000-4000-8000-000000000001',body:'Synthetic offer'},summary:'Offer'}
    : mode === 'cognition'
      ? {kind:'wait',summary:'Await evidence',cognition:{expectedVersion:JSON.parse(JSON.parse(input).messages[1].content).cognition.version,plan:{goal:'Maintain a reliable supply relationship',steps:['Review the next delivery'],status:'waiting',reconsiderWhen:'New receipt contradicts the prediction',evidenceRefs:[JSON.parse(JSON.parse(input).messages[1].content).cognition.evidence[0].id]}}}
      : {kind:'wait',summary:'Wait for observed changes'})}));
  console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread'}));
  if (mode === 'bad-events') { console.log('bad json'); return; }
  if (mode === 'turn-failed') { console.log(JSON.stringify({type:'turn.failed',error:{message:'PRIVATE_TEXT'}})); return; }
  if (mode === 'no-completed') return;
  const event = JSON.stringify({type:'turn.completed',usage:mode === 'unknown' ? {} : {input_tokens:mode === 'overrun' ? 45000 : 123,cached_input_tokens:100,output_tokens:45}});
  console.log(event);
  if(mode === 'duplicate') console.log(event);
});
`,
    { mode: 0o700 },
  );
  await chmod(executable, 0o700);
  return {
    root,
    home,
    executable,
    invocations: async () =>
      (await readFile(join(home, "invocations"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
  };
}
