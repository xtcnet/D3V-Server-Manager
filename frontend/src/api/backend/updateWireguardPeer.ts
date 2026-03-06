import * as api from "./base";
import type { WireguardPeer } from "./models";

export async function updateWireguardPeer(item: Partial<WireguardPeer>): Promise<WireguardPeer> {
	return await api.put({ url: `/wireguard/peers/${item.id}`, data: item });
}
