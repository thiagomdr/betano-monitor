#!/usr/bin/env python3
"""Atribui IP publico ephemeral a VNIC da instancia Oracle (sa-saopaulo-1)."""
from __future__ import annotations

import json
import sys

import oci

from lib_oci_config import SCRIPT_DIR, build_config, env_get, load_dotenv


def main() -> int:
    config = build_config()
    env = load_dotenv(SCRIPT_DIR / "oci.local.env")
    compartment_id = env_get("OCI_COMPARTMENT_OCID", env)
    instance_id = env_get("OCI_INSTANCE_OCID", env)
    instance_name = env_get("OCI_INSTANCE_NAME", env)

    compute = oci.core.ComputeClient(config)
    network = oci.core.VirtualNetworkClient(config)

    if not compartment_id:
        raise SystemExit("Defina OCI_COMPARTMENT_OCID em oci.local.env")

    if not instance_id:
        if not instance_name:
            raise SystemExit("Defina OCI_INSTANCE_OCID ou OCI_INSTANCE_NAME")
        instances = compute.list_instances(compartment_id=compartment_id).data
        match = [i for i in instances if i.display_name == instance_name]
        if not match:
            raise SystemExit(f"Instancia '{instance_name}' nao encontrada")
        instance_id = match[0].id

    vnics = compute.list_vnic_attachments(
        compartment_id=compartment_id,
        instance_id=instance_id,
    ).data
    if not vnics:
        raise SystemExit("Nenhuma VNIC na instancia")

    vnic_id = vnics[0].vnic_id
    vnic = network.get_vnic(vnic_id).data

    if vnic.public_ip:
        print(json.dumps({"public_ip": vnic.public_ip, "status": "already_assigned"}, indent=2))
        return 0

    private_ips = network.list_private_ips(vnic_id=vnic_id).data
    if not private_ips:
        raise SystemExit("Nenhum private IP na VNIC")

    private_ip_id = private_ips[0].id
    created = network.create_public_ip(
        oci.core.models.CreatePublicIpDetails(
            compartment_id=compartment_id,
            lifetime="EPHEMERAL",
            private_ip_id=private_ip_id,
        )
    ).data

    # refresh
    vnic = network.get_vnic(vnic_id).data
    ip = created.ip_address or vnic.public_ip
    print(json.dumps({"public_ip": ip, "status": "created", "instance_id": instance_id}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except oci.exceptions.ServiceError as e:
        print(f"OCI error {e.status}: {e.message}", file=sys.stderr)
        raise SystemExit(1)
