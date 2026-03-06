import * as api from "./base";

export async function toggleWireguardPeer(id: number, enabled: boolean): Promise<boolean> {
	return await api.post({ url: `/wireguard/peers/${id}/${enabled ? "enable" : "disable"}` });
}
