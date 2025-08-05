import { CronJob } from "../services/cronService";
import { createLogger } from "@ws-ingestor/util";
import { DatabaseService } from "../services/databaseService";
import { RedisService } from "../services/redisService";

const logger = createLogger("cron-jobs");

/**
 * 데이터베이스 연결 상태 확인 작업
 */
export const createDatabaseHealthCheckJob = (
  dbService: DatabaseService
): CronJob => ({
  name: "database-health-check",
  schedule: "* * * * *", // 1분마다
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
  schedule: "*/5 * * * * *", // 5초마다 (node-cron은 초 단위도 지원)
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

/**
 * 모든 크론 작업을 반환합니다
 */
export const getAllCronJobs = (
  dbService: DatabaseService,
  redisService: RedisService
): CronJob[] => {
  return [
    createDatabaseHealthCheckJob(dbService),
    createRedisHealthCheckJob(redisService),
    createSystemMonitorJob(),
  ];
};
