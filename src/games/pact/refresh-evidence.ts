import { RemoteRejection } from "../../http.js";
/** Only local connection refusal before HTTP processing certifies nonexecution of this attempt. */
export function refreshFailureEvidence(error: unknown): "not_processed" | "rejected" | "rotation_unknown" {
  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = error.cause;
    const refused = (value: unknown): boolean =>
      !!value && typeof value === "object" && "code" in value && value.code === "ECONNREFUSED";
    if (refused(cause) || (cause instanceof AggregateError && cause.errors.length > 0 && cause.errors.every(refused)))
      return "not_processed";
  }
  if (
    error instanceof RemoteRejection &&
    error.status < 500 &&
    ["INVALID_GRANT", "INVALID_CLIENT", "UNAUTHORIZED_CLIENT"].includes(error.code)
  )
    return "rejected";
  return "rotation_unknown";
}
