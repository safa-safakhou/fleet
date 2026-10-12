import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { FleetError } from "./domain.js";
export class Vault {
  private key: Buffer;
  constructor(key: string) {
    this.key = Buffer.from(key, "base64");
    if (this.key.length !== 32) throw new FleetError("VAULT_KEY_REQUIRED");
  }
  encrypt(value: unknown, binding: string): string {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    c.setAAD(Buffer.from(binding));
    const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
    return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
  }
  decrypt<T>(cipher: string, binding: string): T {
    const [version, iv, tag, data] = cipher.split(".");
    if (version !== "v1" || !iv || !tag || !data) throw new FleetError("VAULT_INVALID");
    const c = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    c.setAAD(Buffer.from(binding));
    c.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([c.update(Buffer.from(data, "base64")), c.final()]).toString("utf8")) as T;
  }
}
