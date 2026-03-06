import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";
import WireguardServer from "./wireguard_server.js";

Model.knex(db());

const boolFields = ["is_deleted", "enabled"];

class WireguardPeer extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
		if (typeof this.meta === "undefined") {
			this.meta = {};
		}
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "WireguardPeer";
	}

	static get tableName() {
		return "wireguard_peer";
	}

	static get jsonAttributes() {
		return ["meta"];
	}

	static get defaultAllowGraph() {
		return "[owner,server]";
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "wireguard_peer.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			server: {
				relation: Model.BelongsToOneRelation,
				modelClass: WireguardServer,
				join: {
					from: "wireguard_peer.server_id",
					to: "wireguard_server.id",
				},
			},
		};
	}
}

export default WireguardPeer;
