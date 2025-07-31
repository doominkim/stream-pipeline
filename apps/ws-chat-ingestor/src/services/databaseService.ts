import {
  createDatabaseConnection,
  DatabaseConnection,
} from "@ws-ingestor/util";
import { createLogger } from "@ws-ingestor/util";
import { DatabaseConfigs } from "../config/database";

const logger = createLogger("database-service");

export class DatabaseService {
  private readConnection: DatabaseConnection;
  private writeConnection: DatabaseConnection;
  private logger = createLogger("database-service");

  constructor(configs: DatabaseConfigs) {
    this.readConnection = createDatabaseConnection(configs.read);
    this.writeConnection = createDatabaseConnection(configs.write);

    this.logger.info(
      "Database service initialized with read/write connections"
    );
  }

  /**
   * 읽기 전용 쿼리 실행
   */
  async readQuery(text: string, params?: any[]): Promise<any> {
    try {
      const result = await this.readConnection.query(text, params);
      this.logger.debug(`Read query executed: ${text.substring(0, 50)}...`);
      return result;
    } catch (error) {
      this.logger.error("Read query failed:", error);
      throw error;
    }
  }

  /**
   * 쓰기 쿼리 실행
   */
  async writeQuery(text: string, params?: any[]): Promise<any> {
    try {
      const result = await this.writeConnection.query(text, params);
      this.logger.debug(`Write query executed: ${text.substring(0, 50)}...`);
      return result;
    } catch (error) {
      this.logger.error("Write query failed:", error);
      throw error;
    }
  }

  /**
   * 읽기 전용 트랜잭션 실행
   */
  async readTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    try {
      const result = await this.readConnection.transaction(callback);
      this.logger.debug("Read transaction completed");
      return result;
    } catch (error) {
      this.logger.error("Read transaction failed:", error);
      throw error;
    }
  }

  /**
   * 쓰기 트랜잭션 실행
   */
  async writeTransaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    try {
      const result = await this.writeConnection.transaction(callback);
      this.logger.debug("Write transaction completed");
      return result;
    } catch (error) {
      this.logger.error("Write transaction failed:", error);
      throw error;
    }
  }

  /**
   * 데이터베이스 연결 상태 확인
   */
  async healthCheck(): Promise<{ read: boolean; write: boolean }> {
    const result = { read: false, write: false };

    try {
      await this.readConnection.query("SELECT 1");
      result.read = true;
      this.logger.debug("Read connection health check passed");
    } catch (error) {
      this.logger.error("Read connection health check failed:", error);
    }

    try {
      await this.writeConnection.query("SELECT 1");
      result.write = true;
      this.logger.debug("Write connection health check passed");
    } catch (error) {
      this.logger.error("Write connection health check failed:", error);
    }

    return result;
  }

  /**
   * 모든 데이터베이스 연결 종료
   */
  async close(): Promise<void> {
    try {
      await this.readConnection.close();
      await this.writeConnection.close();
      this.logger.info("All database connections closed");
    } catch (error) {
      this.logger.error("Error closing database connections:", error);
      throw error;
    }
  }

  /**
   * 읽기 연결만 종료
   */
  async closeReadConnection(): Promise<void> {
    try {
      await this.readConnection.close();
      this.logger.info("Read database connection closed");
    } catch (error) {
      this.logger.error("Error closing read database connection:", error);
      throw error;
    }
  }

  /**
   * 쓰기 연결만 종료
   */
  async closeWriteConnection(): Promise<void> {
    try {
      await this.writeConnection.close();
      this.logger.info("Write database connection closed");
    } catch (error) {
      this.logger.error("Error closing write database connection:", error);
      throw error;
    }
  }
}

export const createDatabaseService = (
  configs: DatabaseConfigs
): DatabaseService => {
  return new DatabaseService(configs);
};
