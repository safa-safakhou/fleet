"""Validated application JSON over the generated wire models; counters stay decimal strings."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator


def decimal(value: str) -> str:
    if (
        not value.isascii()
        or not value.isdecimal()
        or (len(value) > 1 and value[0] == "0")
        or int(value) > 2**64 - 1
    ):
        raise ValueError("INVALID_COUNTER")
    return value


Counter = Annotated[str, AfterValidator(decimal)]
Identifier = Annotated[str, Field(min_length=1, max_length=2000)]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class RunScope(StrictModel):
    runId: Identifier
    agentId: Identifier
    bindingId: Identifier
    turnId: Identifier
    taskId: Identifier
    operationId: Identifier
    operationEpoch: Counter
    participantId: Identifier | None = None
    manifestDigest: Digest

    @model_validator(mode="after")
    def presence(self):
        if "participantId" in self.model_fields_set and self.participantId is None:
            raise ValueError("INVALID_PARTICIPANT")
        return self


class OperationKey(StrictModel):
    operationId: Identifier
    operationEpoch: Counter
    logicalStepId: Identifier


class ArtifactRef(StrictModel):
    id: Identifier
    contentType: Identifier
    bytes: Counter
    chunks: Counter
    ciphertextDigest: Digest
    privacyClass: Identifier
    retentionClass: Identifier


class ResultRef(StrictModel):
    id: Identifier
    kind: Identifier


class Usage(StrictModel):
    inputTokens: Counter | None
    outputTokens: Counter | None


class BrokerResult(StrictModel):
    status: Literal["completed", "not_dispatched", "pending", "unknown"]
    usage: Usage | None
    allocationId: Identifier | None = None
    commandId: Identifier | None = None
    artifacts: list[ArtifactRef] | None = None
    resultRef: ResultRef | None = None

    @model_validator(mode="after")
    def optional_presence(self):
        for name in ("allocationId", "commandId", "artifacts", "resultRef"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError("INVALID_NULL")
        return self


class Coverage(StrictModel):
    status: Literal["complete", "partial", "unavailable", "withheld", "expired"]
    expected: Counter
    recorded: Counter
    reasons: list[Identifier]

    @model_validator(mode="after")
    def counts(self):
        if int(self.recorded) > int(self.expected):
            raise ValueError("INVALID_COVERAGE")
        return self


class Envelope(StrictModel):
    protocolVersion: Literal[1]
    counter: Counter
    scope: RunScope | None = None
    result: BrokerResult | None = None
    coverage: Coverage | None = None

    @model_validator(mode="after")
    def optional_presence(self):
        for name in ("scope", "result", "coverage"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError("INVALID_NULL")
        return self
