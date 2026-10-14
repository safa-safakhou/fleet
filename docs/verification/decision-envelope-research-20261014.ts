import { Ajv } from "ajv";
import { Decision, decisionSchema, object } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { validateTool } from "../../src/tools.js";

// Pure synthetic research probe. No DB, provider, credential or game calls.
const ajv = new Ajv({ strict: false, validateFormats: false });
const broad = ajv.compile(decisionSchema);
const invalid = [
  { kind: "action", summary: "Fixture", action: { kind: "building.queue", building: "farm", targetLevel: 2, slot: 1 } },
  {
    kind: "action",
    summary: "Fixture",
    action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1, summary: "Extra fixture field" },
  },
  {
    kind: "action",
    summary: "Fixture",
    action: { kind: "game.message.send", recipientKingdomId: "11111111-1111-4111-8111-111111111111" },
  },
  { kind: "read", summary: "Fixture", tool: "pact_conversation_read_v2", args: {} },
];
const closed = object(structuredClone(decisionSchema));
const source = closed.oneOf ?? closed.anyOf;
if (!Array.isArray(source)) throw new Error("Expected decision branches");
const variants = source.map(object);
const bounded = variants.map((branch) => {
  const properties = object(branch.properties);
  if (object(properties.kind).const === "action")
    return {
      ...branch,
      properties: {
        ...properties,
        action: {
          oneOf: ["game.contact.request", "game.contact.answer", "game.message.send", "game.building.queue"].map(
            (kind) => pactAdapter.actionSchema(kind),
          ),
        },
      },
    };
  if (object(properties.kind).const === "read")
    return {
      ...branch,
      properties: {
        ...properties,
        tool: { enum: ["pact_world_read_v1"] },
        args: { type: "object", additionalProperties: false },
      },
    };
  return branch;
});
if (closed.oneOf) closed.oneOf = bounded;
else closed.anyOf = bounded;
const constrained = ajv.compile(closed);
for (const input of invalid) {
  if (!broad(input) || !Decision.safeParse(input).success)
    throw new Error("Expected broad envelope to accept the synthetic bad command");
  if (constrained(input)) throw new Error("Closed prototype accepted a bad fixture");
  if (input.kind === "action") {
    let rejected = false;
    try {
      validateTool(
        { name: "fixture", inputSchema: pactAdapter.actionSchema(String(object(object(input).action).kind)) },
        object(object(input).action),
      );
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Actual command validator unexpectedly accepted fixture");
  }
}
if (
  !constrained({
    kind: "action",
    summary: "Valid fixture",
    action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
  })
)
  throw new Error("Valid fixture rejected");
console.log(
  "PASS: four invalid calls accepted by current envelope, rejected by closed prototype; valid command retained. Prototype covers a small synthetic subset, not a complete deployed schema or model-generation qualification.",
);
