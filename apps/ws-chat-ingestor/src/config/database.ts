import { DatabaseConfig } from "@ws-ingestor/util";
import dotenv from "dotenv";

dotenv.config();

export interface DatabaseConfigs {
  read: DatabaseConfig;
  write: DatabaseConfig;
}

export const getDatabaseConfigs = (): DatabaseConfigs => {
  const baseConfig = {
    database: process.env.DB_NAME || "chat_db",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true",
  };

  return {
    read: {
      ...baseConfig,
      host: process.env.DB_READ_HOST || process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_READ_PORT || process.env.DB_PORT || "5432"),
    },
    write: {
      ...baseConfig,
      host: process.env.DB_WRITE_HOST || process.env.DB_HOST || "localhost",
      port: parseInt(
        process.env.DB_WRITE_PORT || process.env.DB_PORT || "5432"
      ),
    },
  };
};

export const validateDatabaseConfigs = (configs: DatabaseConfigs): void => {
  const requiredFields = [
    "host",
    "port",
    "database",
    "user",
    "password",
  ] as const;

  for (const [type, config] of Object.entries(configs)) {
    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required database config: ${type}.${field}`);
      }
    }
  }
};
