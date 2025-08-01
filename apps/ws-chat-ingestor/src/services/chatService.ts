import { createLogger } from "@ws-ingestor/util";
import { DatabaseService } from "./databaseService";

const logger = createLogger("chat-service");

export interface ChatMessageData {
  userId: string;
  roomId: string;
  message: string;
  timestamp: number;
}

export class ChatService {
  private logger = createLogger("chat-service");

  constructor(private dbService: DatabaseService) {}

  /**
   * 채팅 메시지를 데이터베이스에 저장
   */
  async saveChatMessage(messageData: ChatMessageData): Promise<void> {
    try {
      await this.dbService.writeQuery(
        "INSERT INTO chat_messages (user_id, room_id, message, timestamp) VALUES ($1, $2, $3, $4)",
        [
          messageData.userId,
          messageData.roomId,
          messageData.message,
          new Date(messageData.timestamp),
        ]
      );
      this.logger.info(
        `Chat message saved for user ${messageData.userId} in room ${messageData.roomId}`
      );
    } catch (error) {
      this.logger.error("Failed to save chat message to database:", error);
      throw error;
    }
  }

  /**
   * 특정 방의 채팅 메시지 조회
   */
  async getChatMessages(roomId: string, limit: number = 50): Promise<any[]> {
    try {
      const result = await this.dbService.readQuery(
        "SELECT * FROM channelChatLog WHERE id = $1 ORDER BY timestamp DESC LIMIT $2",
        [245, limit]
      );
      this.logger.info(
        `Retrieved ${result.rows.length} messages for room ${roomId}`
      );
      return result.rows;
    } catch (error) {
      this.logger.error(
        `Failed to get chat messages for room ${roomId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * 사용자의 채팅 메시지 조회
   */
  async getUserChatMessages(
    userId: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const result = await this.dbService.readQuery(
        "SELECT * FROM chat_messages WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2",
        [userId, limit]
      );
      this.logger.info(
        `Retrieved ${result.rows.length} messages for user ${userId}`
      );
      return result.rows;
    } catch (error) {
      this.logger.error(
        `Failed to get chat messages for user ${userId}:`,
        error
      );
      throw error;
    }
  }
}

export const createChatService = (dbService: DatabaseService): ChatService => {
  return new ChatService(dbService);
};
