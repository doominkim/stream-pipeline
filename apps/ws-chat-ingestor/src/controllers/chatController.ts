import { Request, Response } from "express";
import { ChatService } from "../services/chatService";
import { ChzzkModule } from "chzzk-z";

export class ChatController {
  constructor(private chatService: ChatService) {}

  /**
   * 특정 방의 채팅 메시지 조회
   */
  async getRoomMessages(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!roomId) {
        res.status(400).json({ error: "Room ID is required" });
        return;
      }

      const messages = await this.chatService.getChatMessages(roomId, limit);
      res.json({
        roomId,
        messages,
        count: messages.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get room messages",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 특정 사용자의 채팅 메시지 조회
   */
  async getUserMessages(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        res.status(400).json({ error: "User ID is required" });
        return;
      }

      const messages = await this.chatService.getUserChatMessages(
        userId,
        limit
      );
      res.json({
        userId,
        messages,
        count: messages.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get user messages",
        timestamp: Date.now(),
      });
    }
  }
}
