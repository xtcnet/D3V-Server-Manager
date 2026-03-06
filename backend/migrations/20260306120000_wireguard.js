import { migrate as logger } from "../logger.js";

const migrateName = "wireguard";

const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("wireguard_server", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNull();
			table.dateTime("modified_on").notNull();
			table.integer("owner_user_id").notNull().unsigned();
			table.string("name", 255).notNull();
			table.string("private_key", 255).notNull();
			table.string("public_key", 255).notNull();
			table.string("address", 255).notNull().defaultTo("10.8.0.1/24");
			table.integer("listen_port").notNull().unsigned().defaultTo(51820);
			table.string("dns", 255).notNull().defaultTo("1.1.1.1, 1.0.0.1");
			table.integer("mtu").unsigned().defaultTo(1420);
			table.string("post_up", 1024).defaultTo("");
			table.string("post_down", 1024).defaultTo("");
			table.string("endpoint", 255).notNull().defaultTo("");
			table.integer("enabled").notNull().unsigned().defaultTo(1);
			table.integer("is_deleted").notNull().unsigned().defaultTo(0);
			table.json("meta").notNull();
		})
		.then(() => {
			logger.info(`[${migrateName}] wireguard_server Table created`);

			return knex.schema.createTable("wireguard_peer", (table) => {
				table.increments().primary();
				table.dateTime("created_on").notNull();
				table.dateTime("modified_on").notNull();
				table.integer("server_id").notNull().unsigned();
				table.integer("owner_user_id").notNull().unsigned();
				table.string("name", 255).notNull();
				table.string("private_key", 255).notNull();
				table.string("public_key", 255).notNull();
				table.string("preshared_key", 255).defaultTo("");
				table.string("allowed_ips", 255).notNull().defaultTo("0.0.0.0/0, ::/0");
				table.string("address", 255).notNull();
				table.integer("persistent_keepalive").unsigned().defaultTo(25);
				table.integer("enabled").notNull().unsigned().defaultTo(1);
				table.integer("is_deleted").notNull().unsigned().defaultTo(0);
				table.integer("transfer_rx").unsigned().defaultTo(0);
				table.integer("transfer_tx").unsigned().defaultTo(0);
				table.string("latest_handshake", 255).defaultTo("");
				table.json("meta").notNull();
			});
		})
		.then(() => {
			logger.info(`[${migrateName}] wireguard_peer Table created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTableIfExists("wireguard_peer").then(() => {
		return knex.schema.dropTableIfExists("wireguard_server");
	});
};

export { up, down };
