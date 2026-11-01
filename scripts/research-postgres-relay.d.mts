import type { Server } from "node:net";
export function postgresRelay(remote: { host: string; port: number }): Server;
