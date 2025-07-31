import { Pool, PoolClient } from "pg";
import { createLogger } from "./index";

const logger = createLogger("database");

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export class DatabaseConnection {
  private pool: Pool;
  private logger = createLogger("database");

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on("error", (err: Error) => {
      this.logger.error("Unexpected error on idle client", err);
    });
  }

  async connect(): Promise<PoolClient> {
    try {
      const client = await this.pool.connect();
      this.logger.info("Database connected successfully");
      return client;
    } catch (error) {
      this.logger.error("Database connection failed:", error);
      throw error;
    }
  }

  async query(text: string, params?: any[]): Promise<any> {
    const client = await this.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info("Database connection pool closed");
  }
}

export const createDatabaseConnection = (
  config: DatabaseConfig
): DatabaseConnection => {
  return new DatabaseConnection(config);
};
