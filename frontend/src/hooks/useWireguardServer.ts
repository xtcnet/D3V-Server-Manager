import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createWireguardServer,
	getWireguardServer,
	updateWireguardServer,
	type WireguardServer,
} from "src/api/backend";

const useWireguardServer = (id: number | "new", options = {}) => {
	return useQuery<WireguardServer, Error>({
		queryKey: ["wireguard-server", id],
		queryFn: () => {
			if (id === "new") {
				return Promise.resolve({
					id: 0,
					createdOn: "",
					modifiedOn: "",
					ownerUserId: 0,
					name: "",
					privateKey: "",
					publicKey: "",
					address: "10.8.0.1/24",
					listenPort: 51820,
					dns: "1.1.1.1, 1.0.0.1",
					mtu: 1420,
					postUp: "iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE",
					postDown: "iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE",
					endpoint: "",
					enabled: true,
					meta: {},
				} as WireguardServer);
			}
			return getWireguardServer(id);
		},
		staleTime: 60 * 1000,
		...options,
	});
};

const useSetWireguardServer = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (values: Partial<WireguardServer>) =>
			values.id ? updateWireguardServer(values) : createWireguardServer(values),
		onSuccess: async ({ id }: WireguardServer) => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-server", id] });
			queryClient.invalidateQueries({ queryKey: ["wireguard-servers"] });
			queryClient.invalidateQueries({ queryKey: ["host-report"] });
		},
	});
};

export { useWireguardServer, useSetWireguardServer };
