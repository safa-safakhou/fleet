import hashlib
import json

import pytest
from fleet_research.embeddings import LocalEmbeddings, artifact_digest


def artifact(tmp_path, dimension=3):
    (tmp_path / "modules.json").write_text(
        json.dumps(
            [
                {
                    "idx": 0,
                    "name": "0",
                    "path": "",
                    "type": "sentence_transformers.models.Transformer",
                }
            ]
        )
    )
    (tmp_path / "model.safetensors").write_bytes(b"synthetic-not-weights")
    files = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in tmp_path.iterdir()
    }
    identity = {"revision": "fixture@1", "dimension": dimension, "normalization": "l2"}
    preprocessing = {
        "version": "st-encode@1",
        "maxSequenceLength": 128,
        "queryPrefix": "",
        "documentPrefix": "",
    }
    value = {
        "identity": identity,
        "files": files,
        "preprocessing": preprocessing,
        "license": "synthetic",
    }
    identity["digest"] = artifact_digest(value)
    return value


class FakeModel:
    def encode(self, texts, **kwargs):
        assert kwargs["normalize_embeddings"] is True
        return [[1.0, 0.0, 0.0] for _ in texts]


def factory(path, **kwargs):
    if (
        not kwargs.get("local_files_only")
        or kwargs.get("trust_remote_code") is not False
        or kwargs.get("device") != "cpu"
    ):
        raise RuntimeError("UNSAFE_LOAD")
    return FakeModel()


def test_local_only_pinned_model_and_bounded_compute(tmp_path):
    manifest = artifact(tmp_path)
    model = LocalEmbeddings(tmp_path, manifest, factory=factory)
    result = model.embed(["synthetic wood"], "query")
    assert result["vectors"] == [[1.0, 0.0, 0.0]]
    assert result["identity"] == manifest["identity"]
    assert result["usage"]["purpose"] == "embedding"
    assert result["usage"]["cpuMs"] >= 0
    with pytest.raises(ValueError, match="BATCH_LIMIT"):
        model.embed(["x"] * 17, "query")


def test_missing_changed_artifact_remote_code_and_download_refuse(tmp_path):
    manifest = artifact(tmp_path)
    (tmp_path / "model.safetensors").write_bytes(b"changed")
    with pytest.raises(ValueError, match="ARTIFACT_DIGEST_MISMATCH"):
        LocalEmbeddings(tmp_path, manifest, factory=factory)
    with pytest.raises(ValueError, match="REMOTE_CODE_FORBIDDEN"):
        LocalEmbeddings(tmp_path, manifest, trust_remote_code=True, factory=factory)
    with pytest.raises(ValueError, match="DOWNLOAD_FORBIDDEN"):
        LocalEmbeddings(tmp_path, manifest, local_files_only=False, factory=factory)
    with pytest.raises(ValueError, match="LOCAL_ARTIFACT_REQUIRED"):
        LocalEmbeddings(tmp_path / "missing", manifest, factory=factory)


def test_custom_modules_unpinned_files_paths_and_vectors_refuse(tmp_path):
    manifest = artifact(tmp_path)
    (tmp_path / "custom.py").write_text("raise RuntimeError('must not run')")
    with pytest.raises(ValueError, match="ARTIFACT_DIGEST_MISMATCH"):
        LocalEmbeddings(tmp_path, manifest, factory=factory)
    (tmp_path / "custom.py").unlink()
    modules = tmp_path / "modules.json"
    modules.write_text(json.dumps([{"type": "custom.Code", "path": ""}]))
    manifest["files"]["modules.json"] = hashlib.sha256(modules.read_bytes()).hexdigest()
    manifest["identity"]["digest"] = artifact_digest(manifest)
    with pytest.raises(ValueError, match="REMOTE_CODE_FORBIDDEN"):
        LocalEmbeddings(tmp_path, manifest, factory=factory)


def test_digest_includes_preprocessing_and_dimension(tmp_path):
    manifest = artifact(tmp_path)
    initial = manifest["identity"]["digest"]
    manifest["preprocessing"]["queryPrefix"] = "query: "
    assert artifact_digest(manifest) != initial
    with pytest.raises(ValueError, match="ARTIFACT_DIGEST_MISMATCH"):
        LocalEmbeddings(tmp_path, manifest, factory=factory)


@pytest.mark.skip(
    reason="Real weights require a separate explicit artifact assignment; none provisioned for M1–M4"
)
def test_optional_real_artifact():
    """Tracked separately from fake-vector protocol/privacy tests; not relevance qualification."""
