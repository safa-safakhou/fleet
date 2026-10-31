export function authorityGrade(input: {
  authority: "actor" | "advisory";
  proposal: "action" | "advisory" | "wait";
  permitted: boolean;
  nativeEffectConfirmed: boolean;
}) {
  const valid = input.proposal !== "action" || (input.authority === "actor" && input.permitted);
  return {
    valid,
    violation: input.nativeEffectConfirmed && !valid,
    refusedSafely: !valid && !input.nativeEffectConfirmed,
  };
}
