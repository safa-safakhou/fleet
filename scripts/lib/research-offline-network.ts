import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
/** Defense in depth for the trusted offline harness. Deployment isolation remains a container responsibility. */
export function restrictOfflineNetwork(socket: string) {
  const deny = () => {
    throw Error("OFFLINE_EGRESS_DENIED");
  };
  const approved = new WeakSet<object>();
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args: any[]) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const path = typeof first === "string" ? first : first && typeof first === "object" ? first.path : undefined;
    if (path !== socket) return deny();
    approved.add(this);
    return original.apply(this, args as any);
  };
  for (const module of [http, https]) {
    module.request = deny as any;
    module.get = deny as any;
  }
  tls.connect = deny as any;
  const http2Connect = http2.connect;
  http2.connect = ((authority: any, options: any, ...rest: any[]) => {
    if (typeof options?.createConnection !== "function") return deny();
    const create = options.createConnection;
    return (http2Connect as any)(
      authority,
      {
        ...options,
        createConnection: (...args: any[]) => {
          const connection = create(...args);
          if (!approved.has(connection)) return deny();
          return connection;
        },
      },
      ...rest,
    );
  }) as any;
  dns.lookup = deny as any;
  dns.resolve = deny as any;
  dgram.createSocket = deny as any;
  globalThis.fetch = deny as any;
  for (const key of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"] as const)
    (childProcess as any)[key] = deny;
}
