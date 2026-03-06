import * as api from "./base";
import type { WireguardServer } from "./models";

export async function getWireguardServer(id: number): Promise<WireguardServer> {
	return await api.get({ url: `/wireguard/servers/${id}` });
}
