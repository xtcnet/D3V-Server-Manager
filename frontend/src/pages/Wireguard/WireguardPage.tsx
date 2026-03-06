import {
	IconDownload,
	IconHelp,
	IconNetwork,
	IconPlus,
	IconSearch,
	IconTrash,
	IconEdit,
	IconPlayerPlay,
	IconPlayerStop,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import {
	deleteWireguardPeer,
	deleteWireguardServer,
	getWireguardPeerConfig,
	toggleWireguardPeer,
} from "src/api/backend";
import { Button, HasPermission, Loading, LoadingPage } from "src/components";
import { useWireguardPeers, useWireguardServers } from "src/hooks";
import { T } from "src/locale";
import {
	showDeleteConfirmModal,
	showHelpModal,
	showWireguardPeerModal,
	showWireguardServerModal,
} from "src/modals";
import { ADMIN } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatHandshake(ts: string): string {
	if (!ts || ts === "0" || ts === "") return "Never";
	const d = new Date(Number.parseInt(ts, 10) * 1000);
	const diff = Math.floor((Date.now() - d.getTime()) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	return `${Math.floor(diff / 86400)}d ago`;
}

function PeerTable({ serverId }: { serverId: number }) {
	const queryClient = useQueryClient();
	const { data: peers, isLoading, isError, error } = useWireguardPeers(serverId);
	const [search, setSearch] = useState("");

	if (isLoading) return <Loading noLogo />;
	if (isError) return <Alert variant="danger">{error?.message}</Alert>;

	const filtered = search
		? peers?.filter(
				(p) =>
					p.name.toLowerCase().includes(search) ||
					p.address.includes(search) ||
					p.publicKey.includes(search),
			)
		: peers;

	const handleDelete = async (id: number) => {
		await deleteWireguardPeer(id);
		queryClient.invalidateQueries({ queryKey: ["wireguard-peers", serverId] });
		queryClient.invalidateQueries({ queryKey: ["host-report"] });
		showObjectSuccess("wireguard-peer", "deleted");
	};

	const handleToggle = async (id: number, enabled: boolean) => {
		await toggleWireguardPeer(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["wireguard-peers", serverId] });
		showObjectSuccess("wireguard-peer", enabled ? "enabled" : "disabled");
	};

	const handleDownload = async (peerId: number, peerName: string) => {
		try {
			const config = await getWireguardPeerConfig(peerId);
			const blob = new Blob([config], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${peerName}.conf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err: any) {
			console.error(err);
		}
	};

	return (
		<div>
			<div className="d-flex justify-content-between align-items-center mb-3 mt-3">
				<div className="d-flex align-items-center gap-2">
					<h4 className="m-0"><T id="wireguard.peers" /></h4>
					<span className="badge bg-blue-lt">{peers?.length || 0}</span>
				</div>
				<div className="d-flex gap-2">
					{peers && peers.length > 3 && (
						<div className="input-group input-group-flat w-auto">
							<span className="input-group-text input-group-text-sm">
								<IconSearch size={16} />
							</span>
							<input
								type="text"
								className="form-control form-control-sm"
								autoComplete="off"
								placeholder="Search peers..."
								onChange={(e: any) => setSearch(e.target.value.toLowerCase().trim())}
							/>
						</div>
					)}
					<Button size="sm" className="btn-purple" onClick={() => showWireguardPeerModal(serverId)}>
						<IconPlus size={16} className="me-1" />
						<T id="object.add" tData={{ object: "wireguard-peer" }} />
					</Button>
				</div>
			</div>

			{!filtered || filtered.length === 0 ? (
				<div className="text-center text-secondary py-4">
					No peers configured for this server.
				</div>
			) : (
				<div className="table-responsive">
					<table className="table table-vcenter card-table">
						<thead>
							<tr>
								<th><T id="column.name" /></th>
								<th><T id="wireguard.address" /></th>
								<th><T id="wireguard.transfer" /></th>
								<th><T id="wireguard.handshake" /></th>
								<th><T id="column.status" /></th>
								<th className="w-1" />
							</tr>
						</thead>
						<tbody>
							{filtered.map((peer) => (
								<tr key={peer.id}>
									<td>
										<div className="fw-bold">{peer.name}</div>
										<div className="text-secondary small">{peer.publicKey.substring(0, 20)}...</div>
									</td>
									<td><code>{peer.address}</code></td>
									<td>
										<span className="text-green">&uarr; {formatBytes(peer.transferTx)}</span>
										{" / "}
										<span className="text-blue">&darr; {formatBytes(peer.transferRx)}</span>
									</td>
									<td>{formatHandshake(peer.latestHandshake)}</td>
									<td>
										{peer.enabled ? (
											<span className="badge bg-green-lt"><T id="enabled" /></span>
										) : (
											<span className="badge bg-red-lt"><T id="disabled" /></span>
										)}
									</td>
									<td>
										<div className="btn-list flex-nowrap">
											<Button
												size="sm"
												className="btn-icon"
												onClick={() => handleDownload(peer.id, peer.name)}
											>
												<IconDownload size={16} />
											</Button>
											<Button
												size="sm"
												className="btn-icon"
												onClick={() =>
													showWireguardPeerModal(serverId, peer.id, peer)
												}
											>
												<IconEdit size={16} />
											</Button>
											<Button
												size="sm"
												className={`btn-icon ${peer.enabled ? "btn-warning" : "btn-success"}`}
												onClick={() => handleToggle(peer.id, !peer.enabled)}
											>
												{peer.enabled ? <IconPlayerStop size={16} /> : <IconPlayerPlay size={16} />}
											</Button>
											<Button
												size="sm"
												className="btn-icon btn-danger"
												onClick={() =>
													showDeleteConfirmModal({
														title: <T id="object.delete" tData={{ object: "wireguard-peer" }} />,
														onConfirm: () => handleDelete(peer.id),
														invalidations: [["wireguard-peers", serverId]],
														children: <T id="object.delete.content" tData={{ object: "wireguard-peer" }} />,
													})
												}
											>
												<IconTrash size={16} />
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

export default function WireguardPage() {
	const queryClient = useQueryClient();
	const { data: servers, isLoading, isError, error } = useWireguardServers();
	const [selectedServer, setSelectedServer] = useState<number | null>(null);

	if (isLoading) return <LoadingPage />;
	if (isError) return <Alert variant="danger">{error?.message}</Alert>;

	const activeServer = selectedServer ?? (servers && servers.length > 0 ? servers[0].id : null);

	const handleDeleteServer = async (id: number) => {
		await deleteWireguardServer(id);
		queryClient.invalidateQueries({ queryKey: ["wireguard-servers"] });
		queryClient.invalidateQueries({ queryKey: ["host-report"] });
		if (activeServer === id) setSelectedServer(null);
		showObjectSuccess("wireguard-server", "deleted");
	};

	return (
		<div>
			<div className="d-flex justify-content-between align-items-center mb-4">
				<h2>
					<IconNetwork size={28} className="me-2" />
					<T id="wireguard" />
				</h2>
				<div className="d-flex gap-2">
					<Button size="sm" onClick={() => showHelpModal("WireGuard VPN", "purple")}>
						<IconHelp size={20} />
					</Button>
					<HasPermission section={ADMIN} hideError>
						<Button size="sm" className="btn-purple" onClick={() => showWireguardServerModal("new")}>
							<IconPlus size={16} className="me-1" />
							<T id="object.add" tData={{ object: "wireguard-server" }} />
						</Button>
					</HasPermission>
				</div>
			</div>

			{!servers || servers.length === 0 ? (
				<div className="card">
					<div className="card-body text-center py-5">
						<IconNetwork size={48} className="text-secondary mb-3" />
						<h3><T id="wireguard.no-servers" /></h3>
						<p className="text-secondary"><T id="wireguard.no-servers.hint" /></p>
						<Button className="btn-purple" onClick={() => showWireguardServerModal("new")}>
							<IconPlus size={16} className="me-1" />
							<T id="wireguard.create-server" />
						</Button>
					</div>
				</div>
			) : (
				<>
					{servers.length > 1 && (
						<div className="mb-3">
							<ul className="nav nav-tabs">
								{servers.map((s) => (
									<li className="nav-item" key={s.id}>
										<a
											className={`nav-link ${activeServer === s.id ? "active" : ""}`}
											href="#"
											onClick={(e) => {
												e.preventDefault();
												setSelectedServer(s.id);
											}}
										>
											{s.name}
										</a>
									</li>
								))}
							</ul>
						</div>
					)}

					{activeServer && (() => {
						const server = servers.find((s) => s.id === activeServer);
						if (!server) return null;
						return (
							<div className="card">
								<div className="card-status-top bg-purple" />
								<div className="card-header">
									<div className="row w-full align-items-center">
										<div className="col">
											<h3 className="card-title">{server.name}</h3>
											<div className="text-secondary">
												<code>{server.address}</code> &middot; Port <code>{server.listenPort}</code>
												{server.endpoint && (
													<> &middot; Endpoint <code>{server.endpoint}:{server.listenPort}</code></>
												)}
											</div>
										</div>
										<div className="col-auto">
											<div className="btn-list">
												<Button size="sm" onClick={() => showWireguardServerModal(server.id)}>
													<IconEdit size={16} className="me-1" />
													<T id="action.edit" />
												</Button>
												<Button
													size="sm"
													className="btn-danger"
													onClick={() =>
														showDeleteConfirmModal({
															title: <T id="object.delete" tData={{ object: "wireguard-server" }} />,
															onConfirm: () => handleDeleteServer(server.id),
															invalidations: [["wireguard-servers"]],
															children: <T id="object.delete.content" tData={{ object: "wireguard-server" }} />,
														})
													}
												>
													<IconTrash size={16} className="me-1" />
													<T id="action.delete" />
												</Button>
											</div>
										</div>
									</div>
								</div>
								<div className="card-body">
									<div className="row mb-3">
										<div className="col-md-3">
											<div className="mb-2">
												<span className="text-secondary"><T id="wireguard.public-key" /></span>
												<br />
												<code className="small">{server.publicKey}</code>
											</div>
										</div>
										<div className="col-md-3">
											<div className="mb-2">
												<span className="text-secondary">DNS</span>
												<br />
												<code>{server.dns}</code>
											</div>
										</div>
										<div className="col-md-3">
											<div className="mb-2">
												<span className="text-secondary">MTU</span>
												<br />
												<code>{server.mtu}</code>
											</div>
										</div>
										<div className="col-md-3">
											<div className="mb-2">
												<span className="text-secondary"><T id="column.status" /></span>
												<br />
												{server.enabled ? (
													<span className="badge bg-green-lt"><T id="enabled" /></span>
												) : (
													<span className="badge bg-red-lt"><T id="disabled" /></span>
												)}
											</div>
										</div>
									</div>

									<PeerTable serverId={server.id} />
								</div>
							</div>
						);
					})()}
				</>
			)}
		</div>
	);
}
