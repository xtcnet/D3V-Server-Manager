import { useQuery } from "@tanstack/react-query";
import { getWireguardServers, type WireguardServer } from "src/api/backend";

const useWireguardServers = (options = {}) => {
	return useQuery<WireguardServer[], Error>({
		queryKey: ["wireguard-servers"],
		queryFn: () => getWireguardServers(),
		staleTime: 60 * 1000,
		...options,
	});
};

export { useWireguardServers };
