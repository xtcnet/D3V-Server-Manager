import * as api from "./base";
import type { WireguardServer } from "./models";

export async function createWireguardServer(item: Partial<WireguardServer>): Promise<WireguardServer> {
	return await api.post({ url: "/wireguard/servers", data: item });
}
