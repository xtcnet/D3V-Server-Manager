import * as api from "./base";
import type { WireguardPeer } from "./models";

export async function getWireguardPeers(serverId: number): Promise<WireguardPeer[]> {
	return await api.get({ url: `/wireguard/servers/${serverId}/peers` });
}
