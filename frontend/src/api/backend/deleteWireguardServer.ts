import * as api from "./base";

export async function deleteWireguardServer(id: number): Promise<boolean> {
	return await api.del({ url: `/wireguard/servers/${id}` });
}
