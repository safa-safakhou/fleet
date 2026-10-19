import type { RecordedTurn } from "./observe.js";

type Event = NonNullable<RecordedTurn["events"]>[number];
type Fields = Record<string, unknown>;
const object = (value: unknown): Fields =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const title = (key: string) =>
  fieldNames[key] ??
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
const fieldNames: Record<string, string> = {
  args: "Tool arguments",
  attemptedArgs: "Attempted arguments",
  messages: "Model input messages",
  outputSchema: "Required answer format",
  model: "Model settings",
  input: "System input",
  output: "System output",
  result: "Response body",
  decision: "Model's proposed next step",
  outputText: "Final answer text",
  controllerStrategyApplied: "Predefined Fleet strategy applied",
  mode: "Guidance mode",
  needsOwner: "Owner recovery needed",
  action: "Proposed game action",
  committed: "Game change confirmed",
  code: "Result code",
  summary: "Recorded summary",
  availableReads: "Available read tools",
  retainedReads: "Remembered reads",
  contacts: "Known contacts",
  inputBytes: "Prepared input size (bytes)",
  inputByteLimit: "Input size limit (bytes)",
  inputTokens: "Reported input tokens",
  outputTokens: "Reported output tokens",
  update: "Accepted memory update",
  state: "Recorded state",
  receipt: "Game receipt",
};
const meanings: Record<string, string> = {
  "Reading current game state": "Fleet began gathering the current game information this account is allowed to see.",
  "Owner guidance applied":
    "Fleet chose how to guide this turn: the account's own objectives and permissions, or a predefined Fleet strategy.",
  "Game blockers checked": "Fleet checked the observed game state for problems that need owner recovery.",
  "Game needs owner recovery": "Fleet found a game condition that needs the owner's attention.",
  "Game context ready": "Fleet assembled the initial game information and available read tools for this turn.",
  "Reading a participating exchange":
    "Fleet requested a conversation involving this account. Reading a conversation does not send a message.",
  "Game read request": "Fleet prepared a read-only request for game information, using the tool and arguments below.",
  "Game read response":
    "The game returned information for a read-only request. This read did not submit a gameplay action.",
  "Game read failed": "The request for game information failed. The recorded code identifies the failure.",
  "Model request": "Fleet prepared the instructions, game context and answer format for this model call.",
  "Waiting for the model decision":
    "Fleet entered the model-call stage. This event marks the wait; it is not the model's answer.",
  "Model response":
    "The model returned an answer. A proposed action still needs validation and a game receipt before it counts as committed.",
  "Model selected the next step":
    "Fleet parsed the model's choice to read more information, propose an action or wait.",
  "Model execution failed":
    "The model call failed. Fleet retains its recorded accounting and uncertainty rather than assuming zero usage.",
  "Tool response": "The requested tool returned the information shown below.",
  "Read completed":
    "Fleet received a read result. Older events retain only its field names and size, rather than the response body.",
  "Looking up an action schema":
    "Fleet looked up the required fields for a proposed game action. This does not perform that action.",
  "Looking up a read schema": "Fleet looked up the required arguments for a read tool.",
  "Reading additional game facts": "The model requested more game information before choosing its next step.",
  "Decision context delivered":
    "Fleet finished preparing the information for a model decision within the configured input limit.",
  "Requested read delivered to decision":
    "Fleet included the requested read in the next model input, with any recorded omissions or narrowing.",
  "LLM continuity delivered":
    "Fleet included recorded memories, plans and beliefs in the model input. These are subjective records, not new game facts or permissions.",
  "Laya recall request": "Fleet asked the optional Laya helper to order the recorded memory candidates below.",
  "Laya recall response":
    "The Laya helper returned a suggested memory selection. It cannot choose or execute game actions.",
  "Recall selection outcome": "Fleet recorded whether it used Laya's suggestion or kept the fallback memory order.",
  "Saved cognition update":
    "Fleet saved an accepted update to memory, plans or beliefs. Saving an intention does not execute a game action.",
  "LLM revised memory, plan or social hypotheses":
    "Fleet accepted the model's changes to its saved memory, plan or beliefs.",
  "LLM reviewed continuity without a revision":
    "The model reviewed its saved memory and beliefs without changing them.",
  "Submitting game action":
    "Fleet prepared a game command for submission. Only a later game receipt can confirm the change.",
  "Game returned an action result": "Fleet recorded the game's result for the exact submitted command.",
  "Game rejected the action; no commit established": "The game did not confirm a committed change for this command.",
  "Turn completed":
    "Fleet recorded the final status of this turn. Completion alone does not mean a game action succeeded.",
};
const resultMeanings: Record<string, string> = {
  WAIT: "The agent chose to wait.",
  READ: "The turn recorded information reads; this code does not confirm a game change.",
  COMMITTED: "The game confirmed a committed command.",
  ALREADY_COMMITTED: "The game confirmed this command had already been committed.",
  TRANSPORT_UNCERTAIN:
    "The connection outcome is uncertain. Fleet cannot establish the execution result; recovery is required.",
  USAGE_UNKNOWN: "Actual model usage is unknown. The original allocation remains reserved in the history.",
  INVALID_MODEL_OUTPUT: "The model answer did not match the required format and was rejected.",
  MODEL_OUTPUT_TRUNCATED: "The model answer ended before a complete usable decision was available.",
  SLOT_BUSY: "The requested construction slot was occupied.",
  OWNER_APPROVAL_REQUIRED: "This operation requires approval from the owner.",
  CONTEXT_LIMIT: "The required information did not fit the configured model input limit.",
  CODEX_TIMEOUT:
    "The model execution exceeded its time limit; inspect accounting for whether actual usage was reported.",
};
const inputKeys = new Set([
  "tool",
  "args",
  "attemptedArgs",
  "messages",
  "outputSchema",
  "model",
  "maxOutputTokens",
  "inputBytes",
  "inputByteLimit",
  "input",
  "action",
  "mode",
  "policy",
  "query",
  "candidates",
]);
const metaKeys = new Set(["elapsedMs", "execution"]);
export function explainStep(event: Event, events: Event[] = [], index = -1) {
  const name = event.label.replace(/^Debug: /, ""),
    d = event.detail ?? {};
  const explanation =
    meanings[name] ??
    (/rejected|deferred|failed|could not|excluded/i.test(name)
      ? "Fleet recorded a validation failure, deferral or interruption. The recorded result below explains what prevented this step from proceeding."
      : "Fleet recorded this stage of the turn. The fields below show the evidence retained for this event.");
  const inputs = Object.fromEntries(Object.entries(d).filter(([key]) => inputKeys.has(key)));
  const outputs = Object.fromEntries(Object.entries(d).filter(([key]) => !inputKeys.has(key) && !metaKeys.has(key)));
  let outcome = "The result was not recorded in this event.";
  if (name === "Owner guidance applied") {
    if (d.controllerStrategyApplied === false && d.mode === "account_autonomy")
      outcome = "Used account objectives and existing permissions. No predefined Fleet strategy was applied.";
    else if (d.controllerStrategyApplied === true) outcome = "Applied the configured predefined Fleet strategy.";
  } else if (name === "Game blockers checked" && d.needsOwner === false)
    outcome =
      "No owner-recovery blocker was found in the observed game state. This does not guarantee that every possible action is available.";
  else if (name === "Game needs owner recovery")
    outcome = text(d.label) || "Owner recovery is needed; inspect the recorded condition below.";
  else if (name === "Game context ready" && typeof d.availableReads === "number")
    outcome = `Initial context assembled: ${d.availableReads} read tools, ${d.contacts ?? "unrecorded"} contacts and ${d.retainedReads ?? "unrecorded"} remembered reads.`;
  else if (name === "Decision context delivered" && typeof d.inputBytes === "number")
    outcome = `Prepared ${d.inputBytes} bytes of model input${typeof d.inputByteLimit === "number" ? ` within a ${d.inputByteLimit}-byte limit` : ""}. The prepared contents are recorded in the model request when capture is available.`;
  else if (name === "Requested read delivered to decision" && typeof d.complete === "boolean")
    outcome = d.complete
      ? "The requested result reached the next model input without a recorded omission."
      : "The requested result was narrowed or partially omitted in the next model input. Inspect the recorded coverage before relying on it.";
  else if (name === "LLM continuity delivered" && typeof d.evidence === "number")
    outcome = `Included ${d.evidence} memory entries, ${d.beliefs ?? "unrecorded"} beliefs and ${d.reflections ?? "unrecorded"} reflections. These records do not prove the model used them or that their subjective claims are true.`;
  else if (name === "Game read request")
    outcome = "Prepared a read-only request. Its response is not recorded in this event.";
  else if (name === "Game read response" || name === "Tool response")
    outcome = "The tool returned a response. Its recorded body is shown under Outputs.";
  else if (name === "Read completed")
    outcome =
      typeof d.resultBytes === "number"
        ? `Received ${d.resultBytes} bytes of read results. This event records response metadata; the full body may be in a separate response step.`
        : "The read completed; its response body was not recorded in this event.";
  else if (name === "Model request") outcome = "Model input prepared. A model answer is not recorded in this event.";
  else if (name === "Waiting for the model decision")
    outcome = "Entered the model-call stage. A model answer is not recorded in this event.";
  else if (name === "Model response" || name === "Model selected the next step") {
    const decision = name === "Model response" ? object(d.decision) : d;
    const kind = text(object(decision.decision).kind) || text(decision.kind);
    if (d.decisionError)
      outcome = `The returned answer could not be accepted: ${d.decisionError}. No game change is established by this answer.`;
    else if (kind === "action") outcome = "The model proposed an action. This event does not confirm a game change.";
    else if (kind === "read")
      outcome = "The model chose to request more information. This choice does not establish that the read succeeded.";
    else if (kind === "wait") outcome = "The model chose to wait. No game action was selected in this decision.";
    else if (d.decision !== undefined)
      outcome = "The model returned an answer; its final validation outcome is recorded separately.";
  } else if (name === "Recall selection outcome") {
    const result = object(d.output);
    if (result.assist === "abstained") outcome = "Laya abstained. Fleet kept the fallback memory order.";
    else if (result.assist === "unavailable")
      outcome = `Laya was unavailable (${result.code ?? "reason not recorded"}). Fleet kept the fallback memory order.`;
    else if (result.route === "laya-recall-v1")
      outcome =
        "Laya returned a provisional memory ordering; later context delivery determines what reached the model.";
  } else if (name === "Laya recall response" && object(d.output).id)
    outcome = "The helper returned a suggested memory candidate, with the recorded probability and certificate below.";
  else if (name === "Saved cognition update")
    outcome = "The accepted memory update was saved. No game action was executed by saving it.";
  else if (d.changed === false) outcome = "The review was recorded; saved memory, plans and beliefs were unchanged.";
  else if (d.changed === true)
    outcome = `Saved changes: ${d.beliefsRevised ?? "unrecorded"} beliefs, ${d.reflections ?? "unrecorded"} reflections and ${d.memories ?? "unrecorded"} memories. No game change is established by this update.`;
  else if (name === "Submitting game action")
    outcome = "Command prepared for submission. Acceptance and commitment require a recorded game result.";
  else if (d.committed === true) outcome = `The game confirmed the command's change (${text(d.code) || "committed"}).`;
  else if (d.committed === false) outcome = `No game change was confirmed${d.code ? ` (${d.code})` : ""}.`;
  else if (d.code)
    outcome = `${resultMeanings[String(d.code)] ?? "Fleet recorded the result code shown below."} (${d.code}).${d.submitted === false || /before submission/.test(name) ? " No game command was submitted." : ""}`;
  else if (d.summary) outcome = text(d.summary);
  else if (Object.keys(d).length)
    outcome = "The recorded fields for this step are shown below; no separate success result was retained.";
  // A response is linked only using the recorded execution/tool and a matching event type.
  let relatedStep: number | undefined;
  if (index >= 0 && event.detail) {
    const responseName = ["Model request", "Waiting for the model decision"].includes(name)
      ? "Model response"
      : name === "Game read request"
        ? "Game read response"
        : name === "Laya recall request"
          ? "Laya recall response"
          : "";
    if (responseName)
      for (let n = index + 1; n < events.length; n++) {
        const next = events[n],
          nextName = next.label.replace(/^Debug: /, "");
        if (
          nextName === name &&
          (responseName !== "Model response" ||
            (typeof d.allocationId === "string"
              ? next.detail?.allocationId === d.allocationId
              : next.detail?.allocationId === undefined && next.detail?.execution === d.execution))
        )
          break;
        const match =
          responseName === "Model response"
            ? typeof d.allocationId === "string"
              ? next.detail?.allocationId === d.allocationId
              : next.detail?.allocationId === undefined &&
                typeof d.execution === "number" &&
                next.detail?.execution === d.execution
            : responseName === "Game read response"
              ? typeof d.tool === "string" && next.detail?.tool === d.tool
              : true;
        if (nextName === responseName && match && next.detail && !next.detail.omitted) {
          relatedStep = n;
          outcome = explainStep(next).outcome;
          break;
        }
      }
  }
  if (event.detail === null) {
    outcome = "The outcome details are not available: they were not retained, expired, or observation consent is off.";
    relatedStep = undefined;
  }
  if (d.omitted === true) {
    outcome = `The payload was omitted because its ${d.bytes ?? "unrecorded"} bytes exceeded the capture limit. Its contents and outcome cannot be recovered from this event.`;
    relatedStep = undefined;
  }
  return { explanation, outcome, inputs, outputs, relatedStep };
}
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">Not recorded</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ol className="step-values">
        {value.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Immutable recorded array positions distinguish repeated identical values.
          <li key={i}>
            <Value value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <span>None recorded (empty list)</span>
    );
  if (typeof value === "object") {
    const fields = Object.entries(object(value));
    return fields.length ? (
      <details className="step-object">
        <summary>Show {fields.length} recorded fields</summary>
        <FieldsView fields={object(value)} />
      </details>
    ) : (
      <span>No fields recorded (empty object)</span>
    );
  }
  if (value === "account_autonomy") return <span>Account objectives and permissions (account_autonomy)</span>;
  return <span className="step-text">{String(value)}</span>;
}
function FieldsView({ fields }: { fields: Fields }) {
  return (
    <dl className="step-fields">
      {Object.entries(fields).map(([key, value]) => (
        <div key={key}>
          <dt>{title(key)}</dt>
          <dd>
            <Value value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function StepExplanation({
  event,
  events,
  index,
  showStep,
}: {
  event: Event;
  events: Event[];
  index: number;
  showStep?: (id: string) => void;
}) {
  const view = explainStep(event, events, index);
  const missing =
    event.detail === null
      ? "Details unavailable: not retained, expired, or observation consent is off."
      : event.detail.omitted === true
        ? "Payload omitted by the capture limit; see the recorded outcome."
        : "No payload was recorded for this event.";
  return (
    <div className="step-explanation">
      <p>{view.explanation}</p>
      <div className="step-outcome">
        <b>Recorded outcome</b>
        <p>{view.outcome}</p>
        {view.relatedStep !== undefined && (
          <button type="button" onClick={() => showStep?.(events[view.relatedStep as number].id)}>
            Response recorded at step {view.relatedStep + 1} →
          </button>
        )}
      </div>
      <div className="step-io">
        <section>
          <h4>Inputs</h4>
          {Object.keys(view.inputs).length ? <FieldsView fields={view.inputs} /> : <p className="muted">{missing}</p>}
        </section>
        <section>
          <h4>Outputs</h4>
          {Object.keys(view.outputs).length ? (
            <FieldsView fields={view.outputs} />
          ) : (
            <p className="muted">
              {view.relatedStep !== undefined
                ? `Response fields are recorded at step ${view.relatedStep + 1}.`
                : missing}
            </p>
          )}
        </section>
      </div>
      <details className="step-data">
        <summary>All recorded fields · raw JSON</summary>
        <pre>{JSON.stringify(event.detail, null, 2)}</pre>
      </details>
    </div>
  );
}
