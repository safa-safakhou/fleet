import type { RecallPort } from "./cognition.js";
import { FleetError } from "./domain.js";
import { jsonRequest } from "./http.js";
export const layaRevision = "e929ae5cf69bc34259cd2f95c9e91145b818b1f0";
export class LayaRecall implements RecallPort {
  constructor(private url?: string) {}
  async choose(query: string, candidates: { id: string; text: string }[], signal: AbortSignal) {
    if (!this.url) throw new FleetError("LAYA_NOT_CONFIGURED");
    if (![query, ...candidates.map((c) => c.text)].every((text) => /^[\x20-\x7e\r\n]+$/.test(text)))
      throw new FleetError("LAYA_LANGUAGE_NOT_EVALUATED");
    const { data } = await jsonRequest(
      `${this.url}/recall`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, candidates }) },
      signal,
    );
    if (data.task === "laya-recall-v1" && data.abstained === true) throw new FleetError("LAYA_ABSTAINED");
    if (
      data.task !== "laya-recall-v1" ||
      data.runtime !== "0.4.6" ||
      data.revision !== layaRevision ||
      typeof data.certificate !== "string" ||
      !/^[a-f0-9]{64}$/.test(data.certificate) ||
      !candidates.some((c) => c.id === data.id) ||
      typeof data.probability !== "number" ||
      !Number.isFinite(data.probability) ||
      data.probability < 0.65 ||
      data.probability > 1
    )
      throw new FleetError("LAYA_INVALID_RESPONSE");
    return { id: String(data.id), probability: data.probability, certificate: data.certificate };
  }
}
