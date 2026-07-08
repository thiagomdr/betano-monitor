# Oracle Cloud — VM BR + coleta Betano (DOM)

IP brasileiro na Oracle **Brazil East (Sao Paulo)**. Automatiza:

1. IP publico ephemeral (API)
2. Porta SSH 22
3. Bootstrap Node + Playwright + `scrape-betano-hctg.mjs`

## 1. API Key (uma vez)

**Identity → Domains → Default → Users → seu usuario → API Keys → Add API Key**

Copie do **Configuration File Preview**:

- `user` (OCI_USER_OCID)
- `tenancy` (OCI_TENANCY_OCID)
- `region` = `sa-saopaulo-1`

Baixe o `.pem` da API (diferente da chave SSH da VM).

## 2. OCIDs da instancia

- **Compartment:** Identity → Compartments → root → OCID
- **Instance:** Compute → Instances → `instance-20260707-1952` → OCID

## 3. Setup local

```powershell
pip install -r scripts/oracle/requirements.txt

powershell -File scripts/oracle/setup-oci.ps1 `
  -UserOcid "ocid1.user.oc1....." `
  -TenancyOcid "ocid1.tenancy.oc1....." `
  -CompartmentOcid "ocid1.compartment.oc1....." `
  -InstanceOcid "ocid1.instance.oc1.sa-saopaulo-1....."
```

Gera `~/.oci/config` e `scripts/oracle/oci.local.env` (gitignored).

## 4. Comandos

```powershell
# So IP publico
python scripts/oracle/assign_public_ip.py

# SSH + scrape (jogo ao vivo)
powershell -File scripts/oracle/provision-and-test.ps1 -EventId 88333982 -Slug tembetary-independiente-fbc
```

## Chaves

| Arquivo | Uso |
|---------|-----|
| `thiagomdrsouza@gmail.com-....pem` | **API OCI** (CLI/Python) |
| `ssh-key-2026-07-07.key` | **SSH na VM** (usuario `opc`) |

Nunca commitar `.pem` nem `oci.local.env`.
