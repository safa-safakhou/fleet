import { FleetError } from "./domain.js";
import {
  prepareSpecialistQualification,
  type SpecialistGrant,
  SpecialistGrantSchema,
  type SpecialistProtocol,
  validateSpecialistGrant,
} from "./specialist-qualification.js";
export async function specialistQualificationCLI(
  argv: string[],
  io: {
    readJSON(path: string): Promise<unknown>;
    executeApproved(preparedPath: string, protocol: SpecialistProtocol, grant: SpecialistGrant): Promise<unknown>;
  },
) {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i],
      v = argv[i + 1];
    if (
      !k ||
      !v ||
      !["--selection", "--protocol", "--execute-approved", "--prepared"].includes(k) ||
      Object.hasOwn(options, k)
    )
      throw new FleetError("KQ1_ARGUMENTS");
    options[k] = v;
  }
  if (options["--selection"] && Object.keys(options).length === 1)
    return prepareSpecialistQualification(await io.readJSON(options["--selection"]));
  if (
    Object.keys(options).length !== 3 ||
    !options["--protocol"] ||
    !options["--execute-approved"] ||
    !options["--prepared"]
  )
    throw new FleetError("KQ1_EXACT_PROTOCOL_GRANT_PREPARED_REQUIRED");
  const protocol = (await io.readJSON(options["--protocol"])) as SpecialistProtocol,
    grant = SpecialistGrantSchema.parse(await io.readJSON(options["--execute-approved"]));
  const result = validateSpecialistGrant(protocol, grant, Date.now());
  if (!result.valid) throw new FleetError(result.reasons[0] ?? "KQ1_GRANT");
  return io.executeApproved(options["--prepared"], protocol, grant);
}
