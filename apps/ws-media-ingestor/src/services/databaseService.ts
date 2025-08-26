import {
  createDatabaseConnection,
  DatabaseConnection,
} from "@ws-ingestor/util";
import { createLogger } from "@ws-ingestor/util";
import { Channel } from "@ws-ingestor/common";
import { DatabaseConfigs } from "../config/database";

const logger = createLogger("database-service");

export class DatabaseService {
  private readConnection!: DatabaseConnection;
  private writeConnection!: DatabaseConnection;
  private logger = createLogger("database-service");
  private isConnected: boolean = false;

  constructor(configs: DatabaseConfigs) {
    try {
      this.readConnection = createDatabaseConnection(configs.read);
      this.writeConnection = createDatabaseConnection(configs.write);
      this.isConnected = true;

      this.logger.info(
        "Database service initialized with read/write connections"
      );
    } catch (error) {
      this.logger.error("Failed to initialize database connections:", error);
      this.isConnected = false;
    }
  }

  /**
   * 읽기 전용 쿼리 실행
   */
  async readQuery(text: string, params?: any[]): Promise<any> {
    if (!this.isConnected) {
      this.logger.warn("Database not connected, skipping read query");
      return { rows: [] };
    }

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
    if (!this.isConnected) {
      this.logger.warn("Database not connected, skipping write query");
      return { rows: [] };
    }

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
   * 데이터베이스 연결 상태 확인
   */
  async healthCheck(): Promise<{ read: boolean; write: boolean }> {
    if (!this.isConnected) {
      return { read: false, write: false };
    }

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
    if (!this.isConnected) {
      return;
    }

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
   * 녹화할 채널 목록 가져오기
   * 데이터베이스 연결이 없거나 테이블이 없는 경우 기본값 반환
   */
  async getRecordingChannels(): Promise<Channel[]> {
    try {
      const query = `
        SELECT * FROM "channel" 
        WHERE "deletedAt" IS NULL
        ORDER BY "createdAt" DESC
      `;

      const result = await this.readQuery(query);
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get recording channels:", error);
      return [];
    }
  }

  /**
   * 기본 채널 목록 반환 (데이터베이스 연결 실패 시 사용)
   */
  private getDefaultChannels(): Channel[] {
    return [
      {
        id: 1,
        uuid: "75cbf189b3bb8f9f687d2aca0d0a382b",
        channelName: "Default Channel 1",
        openLive: true,
        isChatCollected: false,
        isAudioCollected: true,
        isCaptureCollected: true,
        isEnabledAi: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        uuid: "test-channel-123",
        channelName: "Default Channel 2",
        openLive: true,
        isChatCollected: false,
        isAudioCollected: true,
        isCaptureCollected: false,
        isEnabledAi: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  /**
   * 특정 채널 정보 가져오기
   */
  async getChannelByUuid(uuid: string): Promise<Channel | null> {
    try {
      const query = `
        SELECT * FROM "channel"
        WHERE uuid = $1 AND "deletedAt" IS NULL
      `;

      const result = await this.readQuery(query, [uuid]);
      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      this.logger.error(`Failed to get channel by UUID ${uuid}:`, error);
      return null;
    }
  }

  /**
   * 오디오 수집이 활성화된 채널 조회
   */
  async getAudioCollectedChannels(): Promise<Channel[]> {
    if (!this.isConnected) {
      this.logger.warn("Database not connected, returning default channels");
      return this.getDefaultChannels().filter((ch) => ch.isAudioCollected);
    }

    try {
      const result = await this.readQuery(
        'SELECT * FROM "channel" WHERE "isAudioCollected" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(
        `Retrieved ${result.rows.length} audio-collected channels`
      );
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get audio-collected channels:", error);
      return this.getDefaultChannels().filter((ch) => ch.isAudioCollected);
    }
  }

  /**
   * 캡처 수집이 활성화된 채널 조회
   */
  async getCaptureCollectedChannels(): Promise<Channel[]> {
    if (!this.isConnected) {
      this.logger.warn("Database not connected, returning default channels");
      return this.getDefaultChannels().filter((ch) => ch.isCaptureCollected);
    }

    try {
      const result = await this.readQuery(
        'SELECT * FROM "channel" WHERE "isCaptureCollected" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(
        `Retrieved ${result.rows.length} capture-collected channels`
      );
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get capture-collected channels:", error);
      return this.getDefaultChannels().filter((ch) => ch.isCaptureCollected);
    }
  }

  /**
   * 라이브 중인 채널 조회
   */
  async getLiveChannels(): Promise<Channel[]> {
    if (!this.isConnected) {
      this.logger.warn("Database not connected, returning default channels");
      return this.getDefaultChannels().filter((ch) => ch.openLive);
    }

    try {
      const result = await this.readQuery(
        'SELECT * FROM "channel" WHERE "openLive" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(`Retrieved ${result.rows.length} live channels`);
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get live channels:", error);
      return this.getDefaultChannels().filter((ch) => ch.openLive);
    }
  }

  /**
   * 녹화 로그 저장 (비활성화됨)
   */
  async saveRecordingLog(logData: {
    channelId: string;
    action: string;
    status: string;
    details?: any;
  }): Promise<void> {
    this.logger.debug(`Recording log would be saved for channel: ${logData.channelId} - ${logData.action} (${logData.status})`);
    // recordingLog 테이블을 사용하지 않으므로 로그만 남김
    return;
  }
}

export const createDatabaseService = (
  configs: DatabaseConfigs
): DatabaseService => {
  return new DatabaseService(configs);
};
