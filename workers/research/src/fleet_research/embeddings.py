"""Pinned local Sentence Transformers compute. No hub access or custom model code."""

import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

_ALLOWED = {
    "sentence_transformers.models.Transformer",
    "sentence_transformers.models.Pooling",
    "sentence_transformers.models.Normalize",
}


def artifact_digest(manifest):
    identity = {k: v for k, v in manifest["identity"].items() if k != "digest"}
    value = {
        "identity": identity,
        "files": manifest["files"],
        "preprocessing": manifest["preprocessing"],
    }
    return hashlib.sha256(
        json.dumps(
            value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()


class LocalEmbeddings:
    def __init__(
        self,
        directory,
        manifest,
        *,
        local_files_only=True,
        trust_remote_code=False,
        factory=None,
    ):
        started_cpu, started_wall = time.process_time_ns(), time.monotonic_ns()
        if trust_remote_code:
            raise ValueError("REMOTE_CODE_FORBIDDEN")
        if not local_files_only:
            raise ValueError("DOWNLOAD_FORBIDDEN")
        self.directory = Path(directory).resolve()
        if not self.directory.is_dir():
            raise ValueError("LOCAL_ARTIFACT_REQUIRED")
        self.manifest = manifest
        self.identity = manifest["identity"]
        self.preprocessing = manifest["preprocessing"]
        if (
            not manifest.get("license")
            or not self.identity.get("revision")
            or not isinstance(self.identity.get("dimension"), int)
            or not 1 <= self.identity["dimension"] <= 4096
            or self.identity.get("normalization") not in ("l2", "none")
            or self.preprocessing.get("version") != "st-encode@1"
            or not 1 <= self.preprocessing.get("maxSequenceLength", 0) <= 8192
            or any(
                not isinstance(self.preprocessing.get(k), str)
                for k in ("queryPrefix", "documentPrefix")
            )
        ):
            raise ValueError("EMBEDDING_MANIFEST_INVALID")
        if artifact_digest(manifest) != self.identity.get("digest"):
            raise ValueError("ARTIFACT_DIGEST_MISMATCH")
        # Every loaded file is pinned; undeclared files, Python modules and pickle weights refuse.
        actual = {
            str(p.relative_to(self.directory))
            for p in self.directory.rglob("*")
            if p.is_file()
        }
        if actual != set(manifest["files"]):
            raise ValueError("ARTIFACT_DIGEST_MISMATCH")
        for name, expected in manifest["files"].items():
            path = self.directory / name
            if path.is_symlink() or self.directory not in path.resolve().parents:
                raise ValueError("LOCAL_ARTIFACT_REQUIRED")
            if path.suffix.lower() in (
                ".py",
                ".pyc",
                ".pkl",
                ".pickle",
                ".pt",
                ".pth",
                ".bin",
            ):
                raise ValueError("REMOTE_CODE_FORBIDDEN")
            if hashlib.file_digest(path.open("rb"), "sha256").hexdigest() != expected:
                raise ValueError("ARTIFACT_DIGEST_MISMATCH")
            if path.suffix == ".json" and '"auto_map"' in path.read_text():
                raise ValueError("REMOTE_CODE_FORBIDDEN")
        modules = json.loads((self.directory / "modules.json").read_text())
        if not modules or any(m.get("type") not in _ALLOWED for m in modules):
            raise ValueError("REMOTE_CODE_FORBIDDEN")
        for module in modules:
            path = module.get("path", "")
            if not isinstance(path, str) or (
                (self.directory / path).resolve() != self.directory
                and self.directory not in (self.directory / path).resolve().parents
            ):
                raise ValueError("LOCAL_ARTIFACT_REQUIRED")
            if Path(path).is_absolute() or ".." in Path(path).parts:
                raise ValueError("LOCAL_ARTIFACT_REQUIRED")
        for name in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
            os.environ[name] = "1"
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        if factory is None:
            try:
                import torch
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise ValueError("EMBEDDING_EXTRA_REQUIRED") from exc
            torch.set_num_threads(1)
            factory = SentenceTransformer
        self.model = factory(
            str(self.directory),
            device="cpu",
            local_files_only=True,
            trust_remote_code=False,
            token=False,
        )
        self.model.max_seq_length = self.preprocessing["maxSequenceLength"]
        self.load_cpu_ms = (time.process_time_ns() - started_cpu) / 1e6
        self.load_duration_ms = (time.monotonic_ns() - started_wall) / 1e6

    def embed(self, texts, mode):
        if mode not in ("query", "document"):
            raise ValueError("EMBEDDING_MODE_INVALID")
        if not 1 <= len(texts) <= 16 or any(
            not isinstance(t, str) or not t or len(t.encode()) > 65536 for t in texts
        ):
            raise ValueError("BATCH_LIMIT")
        prefix = self.preprocessing[f"{mode}Prefix"]
        if len(prefix.encode()) > 4096:
            raise ValueError("EMBEDDING_MANIFEST_INVALID")
        cpu, wall = time.process_time_ns(), time.monotonic_ns()
        vectors = self.model.encode(
            [prefix + text for text in texts],
            batch_size=min(16, len(texts)),
            normalize_embeddings=self.identity["normalization"] == "l2",
            convert_to_numpy=True,
            show_progress_bar=False,
            device="cpu",
        )
        vectors = [[float(x) for x in row] for row in vectors]
        if len(vectors) != len(texts) or any(
            len(v) != self.identity["dimension"]
            or not all(math.isfinite(x) for x in v)
            or math.hypot(*v) == 0
            or (
                self.identity["normalization"] == "l2"
                and abs(math.hypot(*v) - 1) > 1e-4
            )
            for v in vectors
        ):
            raise ValueError("VECTOR_INVALID")
        return {
            "identity": self.identity,
            "vectors": vectors,
            "usage": {
                "purpose": "embedding",
                "cpuMs": self.load_cpu_ms + (time.process_time_ns() - cpu) / 1e6,
                "durationMs": self.load_duration_ms
                + (time.monotonic_ns() - wall) / 1e6,
                "items": len(texts),
            },
        }


def main():
    try:
        request = json.loads(sys.stdin.buffer.read(1048577))
        manifest = json.loads(Path("/artifact-manifest.json").read_text())
        result = LocalEmbeddings("/model", manifest).embed(
            request["texts"], request["mode"]
        )
        print(json.dumps(result, allow_nan=False))
    except Exception:  # noqa: BLE001 -- fixed redacted process boundary, never expose model/library exceptions.
        # Never write text, paths, configuration or model library exceptions to shared logs.
        print("LOCAL_EMBEDDING_FAILED", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
