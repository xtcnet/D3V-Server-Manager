import * as api from "./base";
import type { WireguardPeer } from "./models";

export async function createWireguardPeer(serverId: number, item: Partial<WireguardPeer>): Promise<WireguardPeer> {
	return await api.post({ url: `/wireguard/servers/${serverId}/peers`, data: item });
}
