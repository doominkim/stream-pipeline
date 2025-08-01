import { createLogger } from "@ws-ingestor/util";
import {
  Channel,
  CreateChannelDto,
  UpdateChannelDto,
} from "@ws-ingestor/common";
import { DatabaseService } from "./databaseService";

const logger = createLogger("channel-service");

export class ChannelService {
  private logger = createLogger("channel-service");

  constructor(private dbService: DatabaseService) {}

  /**
   * 모든 채널 조회
   */
  async getAllChannels(): Promise<Channel[]> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(`Retrieved ${result.rows.length} channels`);
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get all channels:", error);
      throw error;
    }
  }

  /**
   * ID로 채널 조회
   */
  async getChannelById(id: number): Promise<Channel | null> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE id = $1 AND "deletedAt" IS NULL',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      this.logger.info(`Retrieved channel with ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Failed to get channel with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * UUID로 채널 조회
   */
  async getChannelByUuid(uuid: string): Promise<Channel | null> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE uuid = $1 AND "deletedAt" IS NULL',
        [uuid]
      );

      if (result.rows.length === 0) {
        return null;
      }

      this.logger.info(`Retrieved channel with UUID: ${uuid}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Failed to get channel with UUID ${uuid}:`, error);
      throw error;
    }
  }

  /**
   * 채널 생성
   */
  async createChannel(channelData: CreateChannelDto): Promise<Channel> {
    try {
      const result = await this.dbService.writeQuery(
        `INSERT INTO "channel" (
          uuid, "channelName", "channelImageUrl", "channelDescription", 
          "openLive", follower, "isChatCollected", "isAudioCollected", 
          "isCaptureCollected", "isEnabledAi"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        RETURNING *`,
        [
          channelData.uuid,
          channelData.channelName,
          channelData.channelImageUrl || null,
          channelData.channelDescription || null,
          channelData.openLive || false,
          channelData.follower || 0,
          channelData.isChatCollected || false,
          channelData.isAudioCollected || false,
          channelData.isCaptureCollected || false,
          channelData.isEnabledAi || false,
        ]
      );

      this.logger.info(
        `Created channel: ${channelData.channelName} (UUID: ${channelData.uuid})`
      );
      return result.rows[0];
    } catch (error) {
      this.logger.error("Failed to create channel:", error);
      throw error;
    }
  }

  /**
   * 채널 업데이트
   */
  async updateChannel(
    id: number,
    updateData: UpdateChannelDto
  ): Promise<Channel | null> {
    try {
      const setClause = Object.keys(updateData)
        .map((key, index) => `"${key}" = $${index + 2}`)
        .join(", ");

      const values = Object.values(updateData);

      const result = await this.dbService.writeQuery(
        `UPDATE "channel" SET ${setClause}, "updatedAt" = NOW() WHERE id = $1 AND "deletedAt" IS NULL RETURNING *`,
        [id, ...values]
      );

      if (result.rows.length === 0) {
        return null;
      }

      this.logger.info(`Updated channel with ID: ${id}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Failed to update channel with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 채널 삭제 (소프트 삭제)
   */
  async deleteChannel(id: number): Promise<boolean> {
    try {
      const result = await this.dbService.writeQuery(
        'UPDATE "channel" SET "deletedAt" = NOW() WHERE id = $1 AND "deletedAt" IS NULL RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return false;
      }

      this.logger.info(`Deleted channel with ID: ${id}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete channel with ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 채팅 수집이 활성화된 채널 조회
   */
  async getChatCollectedChannels(): Promise<Channel[]> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE "isChatCollected" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(
        `Retrieved ${result.rows.length} chat-collected channels`
      );
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get chat-collected channels:", error);
      throw error;
    }
  }

  /**
   * 오디오 수집이 활성화된 채널 조회
   */
  async getAudioCollectedChannels(): Promise<Channel[]> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE "isAudioCollected" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(
        `Retrieved ${result.rows.length} audio-collected channels`
      );
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get audio-collected channels:", error);
      throw error;
    }
  }

  /**
   * 라이브 중인 채널 조회
   */
  async getLiveChannels(): Promise<Channel[]> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT * FROM "channel" WHERE "openLive" = true AND "deletedAt" IS NULL ORDER BY "createdAt" DESC'
      );
      this.logger.info(`Retrieved ${result.rows.length} live channels`);
      return result.rows;
    } catch (error) {
      this.logger.error("Failed to get live channels:", error);
      throw error;
    }
  }

  /**
   * 채널 존재 여부 확인
   */
  async channelExists(uuid: string): Promise<boolean> {
    try {
      const result = await this.dbService.readQuery(
        'SELECT id FROM "channel" WHERE uuid = $1 AND "deletedAt" IS NULL',
        [uuid]
      );
      return result.rows.length > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check channel existence for UUID ${uuid}:`,
        error
      );
      throw error;
    }
  }
}

export const createChannelService = (
  dbService: DatabaseService
): ChannelService => {
  return new ChannelService(dbService);
};
