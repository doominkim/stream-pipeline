import { Router } from "express";
import { HealthController } from "../controllers/healthController";
import { DatabaseService } from "../services/databaseService";
import { ChatService } from "../services/chatService";
import { ChannelService } from "../services/channelService";

export const createRoutes = (
  dbService: DatabaseService
  //   chatService: ChatService,
  //   channelService: ChannelService
): Router => {
  const router = Router();

  // 컨트롤러 인스턴스 생성
  const healthController = new HealthController(dbService);
  //   const chatController = new ChatController(chatService);
  //   const channelController = new ChannelController(channelService);

  // 헬스체크 라우트
  router.get("/health", (req, res) => healthController.getHealth(req, res));
  router.get("/health/db", (req, res) =>
    healthController.getDatabaseHealth(req, res)
  );
  router.get("/health/redis", (req, res) =>
    healthController.getRedisHealth(req, res)
  );
  router.get("/health/system", (req, res) =>
    healthController.getSystemHealth(req, res)
  );

  //   // 채팅 API 라우트
  //   router.get("/api/rooms/:roomId/messages", (req, res) =>
  //     chatController.getRoomMessages(req, res)
  //   );
  //   router.get("/api/users/:userId/messages", (req, res) =>
  //     chatController.getUserMessages(req, res)
  //   );

  //   // 채널 API 라우트
  //   router.get("/api/channels", (req, res) =>
  //     channelController.getAllChannels(req, res)
  //   );
  //   router.get("/api/channels/chat-collected", (req, res) =>
  //     channelController.getChatCollectedChannels(req, res)
  //   );
  //   router.get("/api/channels/audio-collected", (req, res) =>
  //     channelController.getAudioCollectedChannels(req, res)
  //   );
  //   router.get("/api/channels/live", (req, res) =>
  //     channelController.getLiveChannels(req, res)
  //   );
  //   router.get("/api/channels/:id", (req, res) =>
  //     channelController.getChannelById(req, res)
  //   );
  //   router.get("/api/channels/uuid/:uuid", (req, res) =>
  //     channelController.getChannelByUuid(req, res)
  //   );
  //   router.post("/api/channels", (req, res) =>
  //     channelController.createChannel(req, res)
  //   );
  //   router.put("/api/channels/:id", (req, res) =>
  //     channelController.updateChannel(req, res)
  //   );
  //   router.delete("/api/channels/:id", (req, res) =>
  //     channelController.deleteChannel(req, res)
  //   );

  return router;
};
