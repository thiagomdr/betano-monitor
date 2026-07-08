"""Imprime fingerprint OCI de um arquivo PEM (API key)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_oci_config import fingerprint_from_pem

if __name__ == "__main__":
    print(fingerprint_from_pem(Path(sys.argv[1])))
