#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CliError, HttpLaunchClient, type LaunchClient, SessionFile } from "./cli-client.js";
import { LaunchSpecSchema, LaunchStartRequest } from "./platform/launch-contracts.js";

type IO = {
  out(text: string): void;
  error(text: string): void;
  readFile(path: string): Promise<string>;
  secret(): Promise<string>;
};
const usage =
  "Usage: fleet architectures list | launch check --file FILE | launch draft --file FILE [--request-id UUID] | launch start --draft UUID --expected-digest SHA256 [--request-id UUID] | login | logout";
export async function runCli(argv: string[], io: IO, client: LaunchClient): Promise<number> {
  try {
    if (argv.length === 1 && ["login", "logout"].includes(argv[0])) {
      if (argv[0] === "login") await client.login(await io.secret());
      else await client.logout();
      io.out(argv[0] === "login" ? "Authenticated. No execution started." : "Logged out.");
      return 0;
    }
    if (argv.join(" ") === "architectures list") {
      const catalog = await client.catalog();
      io.out(
        JSON.stringify(
          catalog.architectures.map((m) => ({
            ref: m.ref,
            name: m.name,
            requirements: m.requirements,
            triggers: m.triggers,
            executionModes: m.executionModes,
            skillModes: m.skillModes,
          })),
          null,
          2,
        ),
      );
      return 0;
    }
    if (argv[0] !== "launch" || !["check", "draft", "start"].includes(argv[1]))
      throw new CliError("INVALID_ARGUMENTS", 2);
    const flags: Record<string, string> = {},
      allowed =
        argv[1] === "start"
          ? ["--draft", "--expected-digest", "--request-id"]
          : argv[1] === "draft"
            ? ["--file", "--request-id"]
            : ["--file"];
    for (let i = 2; i < argv.length; i += 2) {
      if (!allowed.includes(argv[i]) || flags[argv[i]] || !argv[i + 1] || argv[i + 1].startsWith("--"))
        throw new CliError("INVALID_ARGUMENTS", 2);
      flags[argv[i]] = argv[i + 1];
    }
    if (argv[1] === "start") {
      const parsed = LaunchStartRequest.safeParse({
        requestId: flags["--request-id"] ?? randomUUID(),
        draftId: flags["--draft"],
        expectedDigest: flags["--expected-digest"],
      });
      if (!parsed.success) throw new CliError("INVALID_START_REQUEST", 2);
      const result = await client.start(parsed.data);
      io.out(JSON.stringify({ cohortId: result.cohortId, digest: result.digest, state: result.state }));
      return 0;
    }
    if (!flags["--file"]) throw new CliError("FILE_REQUIRED", 2);
    let raw: unknown;
    try {
      const source = await io.readFile(flags["--file"]);
      if (source.length > 1024 * 1024) throw Error();
      raw = JSON.parse(source);
    } catch {
      throw new CliError("INVALID_LAUNCH_FILE", 2);
    }
    const parsed = LaunchSpecSchema.safeParse(raw);
    if (!parsed.success) throw new CliError("INVALID_LAUNCH_SPEC", 2);
    if (argv[1] === "check") {
      const result = await client.check(parsed.data);
      io.out(
        JSON.stringify(
          { valid: result.valid, ready: result.ready, digest: result.digest, checks: result.checks },
          null,
          2,
        ),
      );
      return result.valid ? (result.ready ? 0 : 3) : 2;
    }
    const requestId = flags["--request-id"] ?? randomUUID();
    if (!LaunchStartRequest.shape.requestId.safeParse(requestId).success) throw new CliError("INVALID_REQUEST_ID", 2);
    const result = await client.draft({ requestId, spec: parsed.data });
    io.out(JSON.stringify({ draftId: result.draftId, digest: result.digest, requestId }));
    return 0;
  } catch (e) {
    const code = e instanceof CliError ? e.code : "CLI_REQUEST_FAILED",
      exit = e instanceof CliError ? e.exitCode : 1;
    io.error(code);
    if (exit === 2) io.error(usage);
    return exit;
  }
}
async function readSecret(): Promise<string> {
  process.stderr.write("Operator secret: ");
  const input = process.stdin;
  if (!input.isTTY) {
    let value = "";
    for await (const chunk of input) {
      value += chunk.toString();
      if (value.length > 258) throw new CliError("INVALID_OPERATOR_SECRET", 2);
    }
    return value.replace(/\r?\n$/, "");
  }
  return new Promise((done, reject) => {
    let value = "";
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    const finish = (error?: CliError) => {
      input.off("data", consume);
      input.setRawMode(false);
      input.pause();
      process.stderr.write("\n");
      if (error) reject(error);
      else done(value);
    };
    const consume = (data: string) => {
      for (const c of data) {
        if (c === "\u0003") {
          finish(new CliError("LOGIN_CANCELLED"));
          return;
        }
        if (c === "\r" || c === "\n") {
          finish();
          return;
        }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
        if (value.length > 256) {
          finish(new CliError("INVALID_OPERATOR_SECRET", 2));
          return;
        }
      }
    };
    input.on("data", consume);
  });
}
async function main(argv: string[]) {
  let origin = process.env.FLEET_ORIGIN ?? "",
    file: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (["--origin", "--session-file"].includes(argv[i])) {
      const flag = argv[i],
        value = argv[++i];
      if (!value || value.startsWith("--")) throw new CliError("INVALID_ARGUMENTS", 2);
      if (flag === "--origin") origin = value;
      else file = value;
    } else rest.push(argv[i]);
  }
  return runCli(
    rest,
    {
      out: (text) => process.stdout.write(`${text}\n`),
      error: (text) => process.stderr.write(`${text}\n`),
      readFile: (path) => readFile(path, "utf8"),
      secret: readSecret,
    },
    new HttpLaunchClient(origin, fetch, file ? new SessionFile(file) : undefined),
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      process.stderr.write(`${e instanceof CliError ? e.code : "CLI_REQUEST_FAILED"}\n`);
      process.exitCode = e instanceof CliError ? e.exitCode : 1;
    });
