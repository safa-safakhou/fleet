import { fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import { MetricSetSchema } from "../generated/fleet/v1/evidence_pb.js";
import type { MetricSet } from "./types.js";
export function encodeMetricSet(value: MetricSet) {
  const input = {
    ...value,
    ungraded: String(value.ungraded),
    unresolvedUsage: {
      ...value.unresolvedUsage,
      allocations: String(value.unresolvedUsage.allocations),
      ...(value.unresolvedUsage.reservedTokens === null ? { reservedTokens: undefined } : {}),
    },
    values: value.values.map((v) => ({
      ...v,
      ...(v.value === null ? { value: undefined } : {}),
      ...(v.numerator === null ? { numerator: undefined } : {}),
      ...(v.denominator === null ? { denominator: undefined } : {}),
      coverage: {
        status: v.coverage.status,
        expected: String(v.coverage.expected),
        recorded: String(v.coverage.recorded),
        reasons: v.exclusions,
      },
      censored: String(v.coverage.censored),
      ungraded: String(v.coverage.ungraded),
    })),
  };
  return toBinary(MetricSetSchema, fromJson(MetricSetSchema, JSON.parse(JSON.stringify(input))));
}
export function decodeMetricSet(bytes: Uint8Array): MetricSet {
  const wire = toJson(MetricSetSchema, fromBinary(MetricSetSchema, bytes), { alwaysEmitImplicit: true }) as any;
  return {
    ...wire,
    ungraded: Number(wire.ungraded),
    unresolvedUsage: {
      allocations: Number(wire.unresolvedUsage.allocations),
      reservedTokens: wire.unresolvedUsage.reservedTokens ?? null,
    },
    values: wire.values.map((v: any) => {
      const { censored, ungraded, ...value } = v;
      return {
        ...value,
        value: v.value ?? null,
        numerator: v.numerator ?? null,
        denominator: v.denominator ?? null,
        coverage: {
          status: v.coverage.status,
          expected: Number(v.coverage.expected),
          recorded: Number(v.coverage.recorded),
          censored: Number(censored),
          ungraded: Number(ungraded),
        },
      };
    }),
  };
}
