import express from "express";
import { createLogger, createHealthCheck } from "@ws-ingestor/util";
import { DEFAULT_PORTS } from "@ws-ingestor/common";
import { StreamService } from "./stream/stream.service";
import { StreamController } from "./stream/stream.controller";

const logger = createLogger("media-ingestor");
const app = express();
const port = process.env.PORT || DEFAULT_PORTS.MEDIA_INGESTOR || 3002;

// JSON 파싱 미들웨어 추가
app.use(express.json());

// 스트림 서비스 및 컨트롤러 초기화
const streamService = new StreamService();
const streamController = new StreamController(streamService);

// 라우트 설정
streamController.setupRoutes(app);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(createHealthCheck("media-ingestor"));
});

// 서버 시작
const server = app.listen(port, () => {
  logger.info(`Media ingestor server running on port ${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
