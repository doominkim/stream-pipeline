import express from "express";
import { createLogger, createHealthCheck } from "@ws-ingestor/util";
import { DEFAULT_PORTS } from "@ws-ingestor/common";
import { StreamService } from "./services/streamService";
import { StreamController } from "./controllers/streamController";
import { createCronService } from "./services/cronService";
import { createDatabaseService } from "./services/databaseService";
import { getDatabaseConfigs, validateDatabaseConfigs } from "./config/database";
import { getAllCronJobs } from "./jobs";

const logger = createLogger("media-ingestor");
const app = express();
const port = process.env.PORT || DEFAULT_PORTS.MEDIA_INGESTOR || 3002;

// JSON 파싱 미들웨어 추가
app.use(express.json());

// 데이터베이스 설정 및 초기화
const dbConfigs = getDatabaseConfigs();
try {
  validateDatabaseConfigs(dbConfigs);
} catch (error) {
  logger.error("Invalid database configuration:", error);
  process.exit(1);
}

// 서비스 초기화
const dbService = createDatabaseService(dbConfigs);
const streamService = new StreamService(dbService);
const cronService = createCronService();

// StreamService 초기화 및 필수 명령어 확인
(async () => {
  const initialized = await streamService.initialize();
  if (!initialized) {
    logger.error(
      "Failed to initialize StreamService. Required dependencies are missing."
    );
    process.exit(1);
  }

  logger.info("StreamService initialized successfully");

  // 컨트롤러 초기화
  const streamController = new StreamController(streamService);

  // 라우트 설정
  streamController.setupRoutes(app);

  // 크론 작업 등록
  const cronJobs = getAllCronJobs(streamService, dbService);
  cronJobs.forEach((job) => {
    cronService.addJob(job);
    logger.info(`Registered cron job: ${job.name}`);
  });

  // 서버 시작
  const server = app.listen(port, () => {
    logger.info(`Media ingestor server running on port ${port}`);
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, shutting down gracefully");
    cronService.shutdown();

    try {
      await dbService.close();
      logger.info("Database connections closed");
    } catch (error) {
      logger.error("Error closing database connections:", error);
    }

    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  });
})();

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(createHealthCheck("media-ingestor"));
});

// 데이터베이스 헬스체크 endpoint
app.get("/health/db", async (req, res) => {
  try {
    const health = await dbService.healthCheck();
    res.json({
      status: "healthy",
      database: health.read && health.write ? "connected" : "partial",
      connections: health,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: Date.now(),
    });
  }
});
