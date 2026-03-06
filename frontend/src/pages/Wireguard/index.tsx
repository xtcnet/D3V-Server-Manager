import { HasPermission } from "src/components";
import { ADMIN } from "src/modules/Permissions";
import WireguardPage from "./WireguardPage";

const Wireguard = () => {
	return (
		<HasPermission section={ADMIN} pageLoading loadingNoLogo>
			<WireguardPage />
		</HasPermission>
	);
};

export default Wireguard;
