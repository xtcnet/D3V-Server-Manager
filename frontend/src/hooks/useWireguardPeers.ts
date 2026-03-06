import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createWireguardPeer,
	getWireguardPeers,
	updateWireguardPeer,
	type WireguardPeer,
} from "src/api/backend";

const useWireguardPeers = (serverId: number, options = {}) => {
	return useQuery<WireguardPeer[], Error>({
		queryKey: ["wireguard-peers", serverId],
		queryFn: () => getWireguardPeers(serverId),
		staleTime: 30 * 1000,
		enabled: serverId > 0,
		...options,
	});
};

const useSetWireguardPeer = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Partial<WireguardPeer> & { serverId: number }) =>
			values.id
				? updateWireguardPeer(values)
				: createWireguardPeer(values.serverId, values),
		onSuccess: async (_data: WireguardPeer, variables) => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers", variables.serverId] });
			queryClient.invalidateQueries({ queryKey: ["wireguard-servers"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
		},
	});
};

export { useWireguardPeers, useSetWireguardPeer };
