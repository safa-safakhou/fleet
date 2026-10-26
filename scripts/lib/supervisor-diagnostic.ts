import { object, safeCode } from "../../src/domain.js";
/** Persist classifications and source locations, never provider text, SQL, argv or secrets. */
export function supervisorDiagnostic(error: unknown, stage: string) {
  const e = object(error);
  return {
    stage,
    code: safeCode(error),
    errorType:
      error instanceof TypeError
        ? "TypeError"
        : error instanceof RangeError
          ? "RangeError"
          : error instanceof Error
            ? "Error"
            : "unknown",
    source:
      error instanceof Error
        ? (error.stack ?? "")
            .split("\n")
            .slice(1)
            .flatMap((line) => {
              const match = line.match(/\/(src|scripts)\/([a-zA-Z0-9_./-]+\.[cm]?[jt]s):(\d+):(\d+)/);
              return match ? [`${match[1]}/${match[2]}:${match[3]}:${match[4]}`] : [];
            })
            .slice(0, 6)
        : [],
    causeCode: e.cause ? safeCode(e.cause) : null,
  };
}
