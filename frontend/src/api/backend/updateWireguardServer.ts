import * as api from "./base";
import type { WireguardServer } from "./models";

export async function updateWireguardServer(item: Partial<WireguardServer>): Promise<WireguardServer> {
	return await api.put({ url: `/wireguard/servers/${item.id}`, data: item });
}
