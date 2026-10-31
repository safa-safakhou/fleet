"""Replaceable sanitized local MLflow metadata projection; never authoritative."""

import math
from pathlib import Path

PARAMETERS = {
    "seed",
    "primaryMetric",
    "method",
    "methodVersion",
    "datasetDigest",
    "trainDigest",
    "developmentDigest",
    "heldoutDigest",
}


class TrackingProjection:
    def __init__(self, directory, client_factory=None):
        self.directory = Path(directory).resolve()
        self.client_factory = client_factory

    def sync(self, snapshot):
        try:
            import mlflow
            from mlflow.tracking import MlflowClient

            mlflow.autolog(disable=True, silent=True)
            self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            client = (self.client_factory or MlflowClient)(
                tracking_uri=f"sqlite:///{self.directory / 'tracking.db'}"
            )
            name = "fleet-sanitized-research-v1"
            experiment = client.get_experiment_by_name(name)
            experiment_id = (
                experiment.experiment_id
                if experiment
                else client.create_experiment(
                    name, artifact_location=(self.directory / "artifacts").as_uri()
                )
            )
            source = snapshot["snapshotDigest"]
            if len(source) != 64 or any(c not in "0123456789abcdef" for c in source):
                raise ValueError("TRACKING_DIGEST_INVALID")
            runs = client.search_runs(
                [experiment_id],
                filter_string=f"tags.fleet_snapshot_digest = '{source}'",
                max_results=1,
            )
            if runs and runs[0].info.status == "FINISHED":
                return {
                    "status": "synced",
                    "runId": runs[0].info.run_id,
                    "snapshotDigest": source,
                }
            run_id = (
                runs[0].info.run_id
                if runs
                else client.create_run(
                    experiment_id,
                    tags={
                        "fleet_snapshot_digest": source,
                        "fleet_projection_version": "1",
                    },
                ).info.run_id
            )
            for key, value in snapshot.get("parameters", {}).items():
                if (
                    key in PARAMETERS
                    and isinstance(value, (str, int, float))
                    and len(str(value)) <= 200
                ):
                    client.log_param(run_id, key, str(value))
            for key, value in snapshot.get("metrics", {}).items():
                if (
                    key.replace("_", "").replace(".", "").isalnum()
                    and len(key) < 100
                    and isinstance(value, (float, int))
                    and math.isfinite(value)
                ):
                    client.log_metric(run_id, key, float(value), timestamp=0, step=0)
            # Opaque references only. No prompt/output artifact uploads or autologging.
            for index, ref in enumerate(snapshot.get("artifactRefs", [])[:100]):
                if (
                    isinstance(ref, str)
                    and len(ref) <= 100
                    and all(c.isalnum() or c in "-_:" for c in ref)
                ):
                    client.set_tag(run_id, f"fleet_ref_{index}", ref)
            client.set_terminated(run_id)
            return {"status": "synced", "runId": run_id, "snapshotDigest": source}
        except Exception:  # noqa: BLE001 -- redact framework/provider errors at the process/projection boundary
            return {
                "status": "unavailable",
                "snapshotDigest": snapshot.get("snapshotDigest"),
            }
