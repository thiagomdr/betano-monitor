"""Carrega config OCI de ~/.oci/config ou scripts/oracle/oci.local.env"""
from __future__ import annotations

import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
LOCAL_ENV = SCRIPT_DIR / "oci.local.env"
DEFAULT_OCI_DIR = Path.home() / ".oci"


def load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def fingerprint_from_pem(pem_path: Path) -> str:
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    import hashlib

    data = pem_path.read_bytes()
    private_key = serialization.load_pem_private_key(data, password=None, backend=default_backend())
    pub = private_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    md5 = hashlib.md5(pub).hexdigest()
    return ":".join(md5[i : i + 2] for i in range(0, len(md5), 2))


def build_config() -> dict:
    env = load_dotenv(LOCAL_ENV)
    key_file = Path(
        env.get("OCI_KEY_FILE")
        or os.environ.get("OCI_KEY_FILE")
        or DEFAULT_OCI_DIR / "oci_api_key.pem",
    )

    user = env.get("OCI_USER_OCID") or os.environ.get("OCI_USER_OCID")
    tenancy = env.get("OCI_TENANCY_OCID") or os.environ.get("OCI_TENANCY_OCID")
    region = env.get("OCI_REGION") or os.environ.get("OCI_REGION") or "sa-saopaulo-1"
    fingerprint = env.get("OCI_FINGERPRINT") or os.environ.get("OCI_FINGERPRINT")

    if not fingerprint and key_file.is_file():
        fingerprint = fingerprint_from_pem(key_file)

    if not all([user, tenancy, fingerprint]) or not key_file.is_file():
        raise SystemExit(
            "Config OCI incompleta. Rode: powershell -File scripts/oracle/setup-oci.ps1\n"
            f"Ou preencha {LOCAL_ENV} (copie de oci.env.example)."
        )

    return {
        "user": user,
        "tenancy": tenancy,
        "region": region,
        "key_file": str(key_file),
        "fingerprint": fingerprint,
    }


def env_get(name: str, env: dict[str, str]) -> str | None:
    return env.get(name) or os.environ.get(name)
