import { execSync, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import _ from "lodash";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import wireguardServerModel from "../models/wireguard_server.js";
import wireguardPeerModel from "../models/wireguard_peer.js";
import internalAuditLog from "./audit-log.js";

const WG_PATH = "/etc/wireguard";
const WG_INTERFACE = "wg0";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted"];
};

const generateKeyPair = () => {
	try {
		const privateKey = execSync("wg genkey", { encoding: "utf-8" }).trim();
		const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
			encoding: "utf-8",
			shell: "/bin/sh",
		}).trim();
		return { privateKey, publicKey };
	} catch (e) {
		throw new errs.InternalError("Failed to generate WireGuard key pair: " + e.message);
	}
};

const generatePresharedKey = () => {
	try {
		return execSync("wg genpsk", { encoding: "utf-8" }).trim();
	} catch (e) {
		throw new errs.InternalError("Failed to generate preshared key: " + e.message);
	}
};

const getNextAvailableAddress = async (serverId, serverAddress) => {
	const baseNet = serverAddress.split("/")[0];
	const parts = baseNet.split(".");
	const basePrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;

	const peers = await wireguardPeerModel
		.query()
		.where("server_id", serverId)
		.andWhere("is_deleted", 0);

	const usedIps = new Set();
	usedIps.add(baseNet);
	for (const peer of peers) {
		usedIps.add(peer.address.split("/")[0]);
	}

	for (let i = 2; i <= 254; i++) {
		const candidate = `${basePrefix}.${i}`;
		if (!usedIps.has(candidate)) {
			return `${candidate}/32`;
		}
	}
	throw new errs.ValidationError("No available IP addresses in the subnet");
};

const generateServerConfig = async (server) => {
	const peers = await wireguardPeerModel
		.query()
		.where("server_id", server.id)
		.andWhere("is_deleted", 0)
		.andWhere("enabled", 1);

	let config = "[Interface]\n";
	config += `PrivateKey = ${server.private_key}\n`;
	config += `Address = ${server.address}\n`;
	config += `ListenPort = ${server.listen_port}\n`;

	if (server.dns) {
		config += `DNS = ${server.dns}\n`;
	}
	if (server.mtu) {
		config += `MTU = ${server.mtu}\n`;
	}
	if (server.post_up) {
		config += `PostUp = ${server.post_up}\n`;
	}
	if (server.post_down) {
		config += `PostDown = ${server.post_down}\n`;
	}

	for (const peer of peers) {
		config += "\n[Peer]\n";
		config += `PublicKey = ${peer.public_key}\n`;
		if (peer.preshared_key) {
			config += `PresharedKey = ${peer.preshared_key}\n`;
		}
		config += `AllowedIPs = ${peer.address.split("/")[0]}/32\n`;
		if (peer.persistent_keepalive) {
			config += `PersistentKeepalive = ${peer.persistent_keepalive}\n`;
		}
	}

	return config;
};

const generateClientConfig = (server, peer) => {
	let config = "[Interface]\n";
	config += `PrivateKey = ${peer.private_key}\n`;
	config += `Address = ${peer.address}\n`;

	if (server.dns) {
		config += `DNS = ${server.dns}\n`;
	}
	if (server.mtu) {
		config += `MTU = ${server.mtu}\n`;
	}

	config += "\n[Peer]\n";
	config += `PublicKey = ${server.public_key}\n`;
	if (peer.preshared_key) {
		config += `PresharedKey = ${peer.preshared_key}\n`;
	}
	config += `AllowedIPs = ${peer.allowed_ips}\n`;

	const endpoint = server.endpoint || "0.0.0.0";
	config += `Endpoint = ${endpoint}:${server.listen_port}\n`;

	if (peer.persistent_keepalive) {
		config += `PersistentKeepalive = ${peer.persistent_keepalive}\n`;
	}

	return config;
};

const writeConfigAndReload = async (server) => {
	const config = await generateServerConfig(server);
	const configPath = path.join(WG_PATH, `${WG_INTERFACE}.conf`);

	fs.mkdirSync(WG_PATH, { recursive: true });
	fs.writeFileSync(configPath, config, { mode: 0o600 });

	try {
		execSync(`wg syncconf ${WG_INTERFACE} <(wg-quick strip ${WG_INTERFACE})`, {
			shell: "/bin/bash",
			encoding: "utf-8",
		});
	} catch (_) {
		try {
			execSync(`wg-quick down ${WG_INTERFACE} 2>/dev/null; wg-quick up ${WG_INTERFACE}`, {
				shell: "/bin/bash",
				encoding: "utf-8",
			});
		} catch (e2) {
			// WireGuard may not be running yet, that's ok on first setup
		}
	}
};

const getWgStatus = () => {
	try {
		const dump = execSync(`wg show ${WG_INTERFACE} dump`, { encoding: "utf-8" });
		const lines = dump.trim().split("\n");

		if (lines.length <= 1) return { running: true, peers: [] };

		const peers = [];
		for (let i = 1; i < lines.length; i++) {
			const parts = lines[i].split("\t");
			if (parts.length >= 8) {
				peers.push({
					publicKey: parts[0],
					presharedKey: parts[1],
					endpoint: parts[2],
					allowedIps: parts[3],
					latestHandshake: parts[4] !== "0" ? Number.parseInt(parts[4], 10) : 0,
					transferRx: Number.parseInt(parts[5], 10) || 0,
					transferTx: Number.parseInt(parts[6], 10) || 0,
					persistentKeepalive: parts[7],
				});
			}
		}
		return { running: true, peers };
	} catch (_) {
		return { running: false, peers: [] };
	}
};

const internalWireguard = {
	// ── Server CRUD ─────────────────────────────────────────────────

	createServer: (access, data) => {
		return access
			.can("wireguard:create", data)
			.then(() => {
				const keys = generateKeyPair();
				data.owner_user_id = access.token.getUserId(1);
				data.private_key = keys.privateKey;
				data.public_key = keys.publicKey;
				if (typeof data.meta === "undefined") data.meta = {};

				return wireguardServerModel.query().insertAndFetch(data).then(utils.omitRow(omissions()));
			})
			.then(async (row) => {
				await writeConfigAndReload(row);
				return internalAuditLog
					.add(access, {
						action: "created",
						object_type: "wireguard-server",
						object_id: row.id,
						meta: _.omit(data, ["private_key"]),
					})
					.then(() => row);
			});
	},

	updateServer: (access, data) => {
		return access
			.can("wireguard:update", data.id)
			.then(() => internalWireguard.getServer(access, { id: data.id }))
			.then((row) => {
				if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
				return wireguardServerModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(utils.omitRow(omissions()));
			})
			.then(async (row) => {
				await writeConfigAndReload(row);
				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "wireguard-server",
						object_id: row.id,
						meta: _.omit(data, ["private_key"]),
					})
					.then(() => row);
			});
	},

	getServer: (access, data) => {
		return access.can("wireguard:get", data.id).then((access_data) => {
			const query = wireguardServerModel
				.query()
				.where("is_deleted", 0)
				.andWhere("id", data.id)
				.allowGraph(wireguardServerModel.defaultAllowGraph)
				.first();

			if (access_data.permission_visibility !== "all") {
				query.andWhere("owner_user_id", access.token.getUserId(1));
			}

			if (data.expand) {
				query.withGraphFetched(`[${data.expand.join(", ")}]`);
			}

			return query.then(utils.omitRow(omissions())).then((row) => {
				if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
				return row;
			});
		});
	},

	getAllServers: (access) => {
		return access.can("wireguard:list").then((access_data) => {
			const query = wireguardServerModel
				.query()
				.where("is_deleted", 0)
				.orderBy("name", "ASC");

			if (access_data.permission_visibility !== "all") {
				query.andWhere("owner_user_id", access.token.getUserId(1));
			}

			return query.then(utils.omitRows(omissions()));
		});
	},

	deleteServer: (access, data) => {
		return access
			.can("wireguard:delete", data.id)
			.then(() => internalWireguard.getServer(access, { id: data.id }))
			.then((row) => {
				return wireguardServerModel
					.query()
					.where("id", row.id)
					.patch({ is_deleted: 1 })
					.then(() => {
						return wireguardPeerModel
							.query()
							.where("server_id", row.id)
							.patch({ is_deleted: 1 });
					})
					.then(() => {
						try {
							execSync(`wg-quick down ${WG_INTERFACE}`, { shell: "/bin/bash" });
						} catch (_) {}
					})
					.then(() => {
						return internalAuditLog.add(access, {
							action: "deleted",
							object_type: "wireguard-server",
							object_id: row.id,
							meta: _.omit(row, omissions()),
						});
					});
			})
			.then(() => true);
	},

	// ── Peer CRUD ───────────────────────────────────────────────────

	createPeer: (access, data) => {
		return access
			.can("wireguard:create", data)
			.then(() => internalWireguard.getServer(access, { id: data.server_id }))
			.then(async (server) => {
				const keys = generateKeyPair();
				const psk = generatePresharedKey();
				const address = await getNextAvailableAddress(server.id, server.address);

				data.owner_user_id = access.token.getUserId(1);
				data.private_key = keys.privateKey;
				data.public_key = keys.publicKey;
				data.preshared_key = psk;
				data.address = address;
				if (typeof data.meta === "undefined") data.meta = {};

				return wireguardPeerModel
					.query()
					.insertAndFetch(data)
					.then(utils.omitRow(omissions()))
					.then(async (row) => {
						await writeConfigAndReload(server);
						return internalAuditLog
							.add(access, {
								action: "created",
								object_type: "wireguard-peer",
								object_id: row.id,
								meta: { name: data.name, server_id: data.server_id },
							})
							.then(() => row);
					});
			});
	},

	updatePeer: (access, data) => {
		return access
			.can("wireguard:update", data.id)
			.then(() => internalWireguard.getPeer(access, { id: data.id }))
			.then((row) => {
				if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
				return wireguardPeerModel
					.query()
					.patchAndFetchById(row.id, data)
					.then(utils.omitRow(omissions()));
			})
			.then(async (row) => {
				const server = await wireguardServerModel
					.query()
					.where("id", row.server_id)
					.andWhere("is_deleted", 0)
					.first();
				if (server) await writeConfigAndReload(server);
				return internalAuditLog
					.add(access, {
						action: "updated",
						object_type: "wireguard-peer",
						object_id: row.id,
						meta: { name: data.name },
					})
					.then(() => row);
			});
	},

	getPeer: (access, data) => {
		return access.can("wireguard:get", data.id).then((access_data) => {
			const query = wireguardPeerModel
				.query()
				.where("is_deleted", 0)
				.andWhere("id", data.id)
				.allowGraph(wireguardPeerModel.defaultAllowGraph)
				.first();

			if (access_data.permission_visibility !== "all") {
				query.andWhere("owner_user_id", access.token.getUserId(1));
			}

			if (data.expand) {
				query.withGraphFetched(`[${data.expand.join(", ")}]`);
			}

			return query.then(utils.omitRow(omissions())).then((row) => {
				if (!row || !row.id) throw new errs.ItemNotFoundError(data.id);
				return row;
			});
		});
	},

	getPeersByServer: (access, serverId) => {
		return access.can("wireguard:list").then((access_data) => {
			const query = wireguardPeerModel
				.query()
				.where("is_deleted", 0)
				.andWhere("server_id", serverId)
				.orderBy("name", "ASC");

			if (access_data.permission_visibility !== "all") {
				query.andWhere("owner_user_id", access.token.getUserId(1));
			}

			return query.then(utils.omitRows(omissions()));
		});
	},

	deletePeer: (access, data) => {
		return access
			.can("wireguard:delete", data.id)
			.then(() => internalWireguard.getPeer(access, { id: data.id }))
			.then(async (row) => {
				await wireguardPeerModel.query().where("id", row.id).patch({ is_deleted: 1 });
				const server = await wireguardServerModel
					.query()
					.where("id", row.server_id)
					.andWhere("is_deleted", 0)
					.first();
				if (server) await writeConfigAndReload(server);
				return internalAuditLog.add(access, {
					action: "deleted",
					object_type: "wireguard-peer",
					object_id: row.id,
					meta: _.omit(row, omissions()),
				});
			})
			.then(() => true);
	},

	enablePeer: (access, data) => {
		return access
			.can("wireguard:update", data.id)
			.then(() => internalWireguard.getPeer(access, { id: data.id }))
			.then(async (row) => {
				if (row.enabled) throw new errs.ValidationError("Peer is already enabled");
				await wireguardPeerModel.query().where("id", row.id).patch({ enabled: 1 });
				const server = await wireguardServerModel
					.query()
					.where("id", row.server_id)
					.andWhere("is_deleted", 0)
					.first();
				if (server) await writeConfigAndReload(server);
				return internalAuditLog.add(access, {
					action: "enabled",
					object_type: "wireguard-peer",
					object_id: row.id,
					meta: _.omit(row, omissions()),
				});
			})
			.then(() => true);
	},

	disablePeer: (access, data) => {
		return access
			.can("wireguard:update", data.id)
			.then(() => internalWireguard.getPeer(access, { id: data.id }))
			.then(async (row) => {
				if (!row.enabled) throw new errs.ValidationError("Peer is already disabled");
				await wireguardPeerModel.query().where("id", row.id).patch({ enabled: 0 });
				const server = await wireguardServerModel
					.query()
					.where("id", row.server_id)
					.andWhere("is_deleted", 0)
					.first();
				if (server) await writeConfigAndReload(server);
				return internalAuditLog.add(access, {
					action: "disabled",
					object_type: "wireguard-peer",
					object_id: row.id,
					meta: _.omit(row, omissions()),
				});
			})
			.then(() => true);
	},

	// ── Status & Config ─────────────────────────────────────────────

	getStatus: () => {
		return getWgStatus();
	},

	getClientConfig: (access, peerId) => {
		return internalWireguard.getPeer(access, { id: peerId }).then(async (peer) => {
			const server = await wireguardServerModel
				.query()
				.where("id", peer.server_id)
				.andWhere("is_deleted", 0)
				.first();
			if (!server) throw new errs.ItemNotFoundError(peer.server_id);
			return generateClientConfig(server, peer);
		});
	},

	getServerCount: (user_id, visibility) => {
		const query = wireguardServerModel.query().count("id AS count").where("is_deleted", 0);
		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}
		return query.first().then((row) => Number.parseInt(row.count, 10));
	},

	getPeerCount: (user_id, visibility) => {
		const query = wireguardPeerModel.query().count("id AS count").where("is_deleted", 0);
		if (visibility !== "all") {
			query.andWhere("owner_user_id", user_id);
		}
		return query.first().then((row) => Number.parseInt(row.count, 10));
	},
};

export default internalWireguard;
