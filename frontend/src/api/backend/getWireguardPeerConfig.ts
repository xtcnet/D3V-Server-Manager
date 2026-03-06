import * as api from "./base";

export async function getWireguardPeerConfig(peerId: number): Promise<string> {
	const response = await fetch(`/api/wireguard/peers/${peerId}/config`, {
		headers: {
			Authorization: `Bearer ${(await import("src/modules/AuthStore")).default.token?.token}`,
		},
	});
	if (!response.ok) throw new Error("Failed to download peer config");
	return await response.text();
}
