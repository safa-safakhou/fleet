import { Ajv } from "ajv";
import type { Pool } from "../../db.js";
import { FleetError } from "../../domain.js";
import { digest } from "../contracts.js";
import schema from "../generated/run-manifest-schema.js";
import type { ResolvedRunManifest } from "./compiler.js";

const validate = new Ajv({ strict: false }).compile(schema);
export class ManifestRepository {
  constructor(private pool: Pick<Pool, "query">) {}
  async save(manifest: ResolvedRunManifest): Promise<string> {
    const { status, capabilityDigest, ...input } = manifest;
    if (
      status !== "experimental" ||
      !/^[a-f0-9]{64}$/.test(capabilityDigest) ||
      !validate(input) ||
      Object.values(input.protections).some((v) => v !== true) ||
      !input.evidence.required
    )
      throw new FleetError("INVALID_RESOLVED_MANIFEST", true);
    const id = digest(manifest);
    await this.pool.query(
      "INSERT INTO research_manifests(digest,manifest) VALUES($1,$2) ON CONFLICT(digest) DO NOTHING",
      [id, manifest],
    );
    return id;
  }
  async load(id: string): Promise<ResolvedRunManifest> {
    const row = (await this.pool.query("SELECT manifest FROM research_manifests WHERE digest=$1", [id])).rows[0];
    if (!row) throw new FleetError("MANIFEST_NOT_FOUND", true);
    if (digest(row.manifest) !== id) throw new FleetError("MANIFEST_INTEGRITY", true);
    return row.manifest;
  }
}
