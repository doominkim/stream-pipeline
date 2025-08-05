import { CronJob } from "../services/cronService";
import { createLogger } from "@ws-ingestor/util";
import { DatabaseService } from "../services/databaseService";
import { RedisService } from "../services/redisService";
import { createChatService } from "../services/chatService";
import { ChzzkModule } from "chzzk-z";
import { SqsChatClient } from "@ws-ingestor/util";

const logger = createLogger("cron-jobs");
/**
 * 데이터베이스 연결 상태 확인 작업
 */
export const createDatabaseHealthCheckJob = (
  dbService: DatabaseService
): CronJob => ({
  name: "database-health-check",
  schedule: "*/10 * * * * *", // 1분마다
  enabled: true,
  task: async () => {
    try {
      const health = await dbService.healthCheck();
      if (health.read && health.write) {
        logger.info(
          "Database health check passed - both read and write connections healthy"
        );
      } else {
        logger.warn("Database health check partial failure", { health });
      }
    } catch (error) {
      logger.error("Database health check failed:", error);
    }
  },
});

/**
 * Redis 연결 상태 확인 작업
 */
export const createRedisHealthCheckJob = (
  redisService: RedisService
): CronJob => ({
  name: "redis-health-check",
  schedule: "*/10 * * * * *", // 5초마다 (node-cron은 초 단위도 지원)
  enabled: true,
  task: async () => {
    try {
      const startTime = Date.now();
      const result = await redisService.ping();
      const responseTime = Date.now() - startTime;

      logger.info("Redis health check passed", {
        response: result,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Redis health check failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  },
});

/**
 * 시스템 리소스 모니터링 작업
 */
export const createSystemMonitorJob = (): CronJob => ({
  name: "system-monitor",
  schedule: "*/10 * * * *", // 10분마다
  enabled: true,
  task: async () => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    logger.info("System resource usage:", {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      cpu: {
        user: `${Math.round(cpuUsage.user / 1000)}ms`,
        system: `${Math.round(cpuUsage.system / 1000)}ms`,
      },
      uptime: `${Math.round(process.uptime())}s`,
    });
  },
});

const isCollectingChzzkModules: Map<string, ChzzkModule> = new Map();
export const createChatIngestJob = (
  dbService: DatabaseService,
  redisService: RedisService
): CronJob => ({
  name: "chat-ingest",
  schedule: "*/5 * * * * *", // 10분마다
  enabled: true,
  task: async () => {
    const chatService = createChatService(dbService);

    const uuid = "6e06f5e1907f17eff543abd06cb62891";
    if (!isCollectingChzzkModules.get(uuid)) {
      const chzzkModule = new ChzzkModule();
      try {
        // 채팅 조인 시도
        await chzzkModule.chat.join(uuid);
        isCollectingChzzkModules.set(uuid, chzzkModule);
        logger.debug(`채널 ${uuid} 채팅 연결 성공`);

        const sqsClient = new SqsChatClient(
          process.env.SQS_QUEUE_URL ||
            "https://sqs.ap-northeast-2.amazonaws.com/197565756669/ws-chat-persist-queue.fifo",
          process.env.AWS_REGION || "ap-northeast-2"
        );

        setInterval(async () => {
          const events = chzzkModule.chat.pollingEvent();
          if (Array.isArray(events)) {
            for (const chat of events) {
              try {
                await sqsClient.sendChat(chat);
                logger.debug("채팅 SQS 전송 성공", chat);
              } catch (err) {
                logger.error("채팅 SQS 전송 실패", err);
              }
            }
          }
        }, 1000);
      } catch (joinError) {
        console.log(joinError);
        logger.warn(`채널 ${uuid} 채팅 조인 실패:`);
      }
    }
  },
});

/**
 * 모든 크론 작업을 반환합니다
 */
export const getAllCronJobs = (
  dbService: DatabaseService,
  redisService: RedisService
): CronJob[] => {
  return [
    // createDatabaseHealthCheckJob(dbService),
    // createRedisHealthCheckJob(redisService),
    // createSystemMonitorJob(),
    createChatIngestJob(dbService, redisService),
  ];
};
