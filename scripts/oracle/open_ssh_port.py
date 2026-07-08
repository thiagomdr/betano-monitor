#!/usr/bin/env python3
"""Abre TCP 22 na security list da subnet da instancia (se ainda nao existir)."""
from __future__ import annotations

import json
import sys

import oci

from lib_oci_config import SCRIPT_DIR, build_config, env_get, load_dotenv


def has_ssh_rule(rules) -> bool:
    for r in rules or []:
        if getattr(r, "protocol", None) != "6":
            continue
        dst = getattr(r, "tcp_options", None)
        if not dst:
            continue
        min_p = getattr(dst, "destination_port_range", None)
        if min_p and min_p.min <= 22 <= min_p.max:
            src = getattr(r, "source", "") or ""
            if src in ("0.0.0.0/0", "::/0"):
                return True
    return False


def main() -> int:
    config = build_config()
    env = load_dotenv(SCRIPT_DIR / "oci.local.env")
    compartment_id = env_get("OCI_COMPARTMENT_OCID", env)
    instance_id = env_get("OCI_INSTANCE_OCID", env)

    compute = oci.core.ComputeClient(config)
    network = oci.core.VirtualNetworkClient(config)

    if not compartment_id or not instance_id:
        raise SystemExit("Defina OCI_COMPARTMENT_OCID e OCI_INSTANCE_OCID")

    vnics = compute.list_vnic_attachments(
        compartment_id=compartment_id,
        instance_id=instance_id,
    ).data
    vnic = network.get_vnic(vnics[0].vnic_id).data
    subnet = network.get_subnet(vnic.subnet_id).data
    sl_id = subnet.security_list_ids[0]
    sl = network.get_security_list(sl_id).data

    if has_ssh_rule(sl.ingress_security_rules):
        print(json.dumps({"status": "ssh_already_open", "security_list_id": sl_id}, indent=2))
        return 0

    rules = list(sl.ingress_security_rules or [])
    rules.append(
        oci.core.models.IngressSecurityRule(
            protocol="6",
            source="0.0.0.0/0",
            is_stateless=False,
            tcp_options=oci.core.models.TcpOptions(
                destination_port_range=oci.core.models.PortRange(min=22, max=22),
            ),
        )
    )
    network.update_security_list(
        sl_id,
        oci.core.models.UpdateSecurityListDetails(ingress_security_rules=rules),
    )
    print(json.dumps({"status": "ssh_opened", "security_list_id": sl_id}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except oci.exceptions.ServiceError as e:
        print(f"OCI error {e.status}: {e.message}", file=sys.stderr)
        raise SystemExit(1)
