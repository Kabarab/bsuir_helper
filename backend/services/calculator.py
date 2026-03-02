import ipaddress

def calculate_ip(ip_with_cidr: str) -> dict:
    """IP Calculator logic"""
    try:
        network = ipaddress.IPv4Network(ip_with_cidr, strict=False)
        return {
            "success": True,
            "network_address": str(network.network_address),
            "broadcast_address": str(network.broadcast_address),
            "netmask": str(network.netmask),
            "hosts_range": f"{network[1]} - {network[-2]}" if network.num_addresses > 2 else "N/A",
            "total_hosts": network.num_addresses - 2 if network.num_addresses > 2 else 0
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
