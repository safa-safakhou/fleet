import { FleetError } from "./domain.js";
import {
  executeNegotiationProtocol,
  type NegotiationExecutionPorts,
  type ProtocolPreview,
  prepareNegotiationProtocol,
  validateNegotiationAuthorization,
} from "./negotiation-run.js";
export async function negotiationCLI(
  argv: string[],
  io: {
    readJSON: (path: string) => Promise<unknown>;
    sourceRevisions?: () => Promise<{ fleet: string; pact: string }>;
    executionPorts?: NegotiationExecutionPorts;
    prepareExecution?: (
      preparedPath: string,
      protocol: ProtocolPreview,
      grant: unknown,
    ) => Promise<NegotiationExecutionPorts>;
  },
) {
  let selectionPath: string | undefined,
    protocolPath: string | undefined,
    grantPath: string | undefined,
    preparedPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i],
      value = argv[++i];
    if (!value) throw new FleetError("NEGOTIATION_ARGUMENT_REQUIRED");
    if (key === "--selection") selectionPath = value;
    else if (key === "--protocol") protocolPath = value;
    else if (key === "--execute-approved") grantPath = value;
    else if (key === "--prepared") preparedPath = value;
    else throw new FleetError("UNKNOWN_NEGOTIATION_ARGUMENT");
  }
  if (grantPath) {
    if (!protocolPath) throw new FleetError("EXACT_NEGOTIATION_PROTOCOL_REQUIRED");
    const protocol = (await io.readJSON(protocolPath)) as ProtocolPreview,
      grant = await io.readJSON(grantPath);
    const check = validateNegotiationAuthorization(protocol, grant, { now: io.executionPorts?.now() ?? Date.now() });
    if (!check.valid) throw new FleetError(check.reasons[0] ?? "NEGOTIATION_UNAUTHORIZED");
    const ports =
      preparedPath && io.prepareExecution
        ? await io.prepareExecution(preparedPath, protocol, grant)
        : io.executionPorts;
    if (!ports) throw new FleetError("OWNED_NATIVE_EXECUTION_PORTS_REQUIRED");
    return executeNegotiationProtocol(protocol, grant, ports);
  }
  if (preparedPath) throw new FleetError("PREPARED_ONLY_FOR_APPROVED_EXECUTION");
  if (protocolPath) throw new FleetError("PROTOCOL_ONLY_FOR_APPROVED_EXECUTION");
  return prepareNegotiationProtocol(
    selectionPath ? await io.readJSON(selectionPath) : { stage: "E1", sources: (await io.sourceRevisions?.()) ?? null },
  );
}
