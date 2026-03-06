import * as api from "./base";

export interface WireguardStatusPeer {
	publicKey: string;
	endpoint: string;
	latestHandshake: number;
	transferRx: number;
	transferTx: number;
}

export interface WireguardStatus {
	running: boolean;
	peers: WireguardStatusPeer[];
}

export async function getWireguardStatus(): Promise<WireguardStatus> {
	return await api.get({ url: "/wireguard/status" });
}
