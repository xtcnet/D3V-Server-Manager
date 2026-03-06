import * as api from "./base";

export async function deleteWireguardPeer(id: number): Promise<boolean> {
	return await api.del({ url: `/wireguard/peers/${id}` });
}
