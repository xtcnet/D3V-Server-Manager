import express from "express";
import internalWireguard from "../internal/wireguard.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// ── Servers ──────────────────────────────────────────────────────────────────

router
	.route("/servers")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const rows = await internalWireguard.getAllServers(res.locals.access);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.post(async (req, res, next) => {
		try {
			const result = await internalWireguard.createServer(res.locals.access, req.body);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/servers/:server_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const row = await internalWireguard.getServer(res.locals.access, {
				id: Number.parseInt(req.params.server_id, 10),
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.put(async (req, res, next) => {
		try {
			req.body.id = Number.parseInt(req.params.server_id, 10);
			const result = await internalWireguard.updateServer(res.locals.access, req.body);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.delete(async (req, res, next) => {
		try {
			await internalWireguard.deleteServer(res.locals.access, {
				id: Number.parseInt(req.params.server_id, 10),
			});
			res.status(200).send({ result: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

// ── Peers ────────────────────────────────────────────────────────────────────

router
	.route("/servers/:server_id/peers")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const serverId = Number.parseInt(req.params.server_id, 10);
			const rows = await internalWireguard.getPeersByServer(res.locals.access, serverId);
			res.status(200).send(rows);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.post(async (req, res, next) => {
		try {
			req.body.server_id = Number.parseInt(req.params.server_id, 10);
			const result = await internalWireguard.createPeer(res.locals.access, req.body);
			res.status(201).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/peers/:peer_id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	.get(async (req, res, next) => {
		try {
			const row = await internalWireguard.getPeer(res.locals.access, {
				id: Number.parseInt(req.params.peer_id, 10),
			});
			res.status(200).send(row);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.put(async (req, res, next) => {
		try {
			req.body.id = Number.parseInt(req.params.peer_id, 10);
			const result = await internalWireguard.updatePeer(res.locals.access, req.body);
			res.status(200).send(result);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	})

	.delete(async (req, res, next) => {
		try {
			await internalWireguard.deletePeer(res.locals.access, {
				id: Number.parseInt(req.params.peer_id, 10),
			});
			res.status(200).send({ result: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

// ── Peer enable/disable ──────────────────────────────────────────────────────

router
	.route("/peers/:peer_id/enable")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await internalWireguard.enablePeer(res.locals.access, {
				id: Number.parseInt(req.params.peer_id, 10),
			});
			res.status(200).send({ result: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

router
	.route("/peers/:peer_id/disable")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			await internalWireguard.disablePeer(res.locals.access, {
				id: Number.parseInt(req.params.peer_id, 10),
			});
			res.status(200).send({ result: true });
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

// ── Client config download ──────────────────────────────────────────────────

router
	.route("/peers/:peer_id/config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const peerId = Number.parseInt(req.params.peer_id, 10);
			const config = await internalWireguard.getClientConfig(res.locals.access, peerId);
			res.set("Content-Type", "text/plain");
			res.set("Content-Disposition", `attachment; filename="peer-${peerId}.conf"`);
			res.status(200).send(config);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

// ── WireGuard status ─────────────────────────────────────────────────────────

router
	.route("/status")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			const status = internalWireguard.getStatus();
			res.status(200).send(status);
		} catch (err) {
			debug(logger, `${req.method} ${req.path}: ${err}`);
			next(err);
		}
	});

export default router;
