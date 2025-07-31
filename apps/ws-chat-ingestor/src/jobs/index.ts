import { CronJob } from "../services/cronService";
import { createLogger } from "@ws-ingestor/util";

const logger = createLogger("cron-jobs");

/**
 * 데이터베이스 연결 상태 확인 작업
 */
export const createDatabaseHealthCheckJob = (db: any): CronJob => ({
  name: "database-health-check",
  schedule: "*/1 * * * *", // 30분마다
  enabled: true,
  task: async () => {
    try {
      await db.query("SELECT 1");
      logger.info("Database health check passed");
    } catch (error) {
      logger.error("Database health check failed:", error);
    }
  },
});

/**
 * 연결된 WebSocket 클라이언트 상태 확인 작업
 */
export const createConnectionHealthCheckJob = (
  connections: Map<string, any>
): CronJob => ({
  name: "connection-health-check",
  schedule: "*/5 * * * *", // 5분마다
  enabled: true,
  task: async () => {
    const activeConnections = Array.from(connections.entries()).filter(
      ([_, ws]) => ws.readyState === 1
    );
    logger.info(`Active WebSocket connections: ${activeConnections.length}`);

    // 연결이 끊어진 클라이언트 정리
    connections.forEach((ws, sessionId) => {
      if (ws.readyState !== 1) {
        connections.delete(sessionId);
        logger.info(`Cleaned up inactive connection: ${sessionId}`);
      }
    });
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
 * 로그 파일 정리 작업 (선택적)
 */
export const createLogCleanupJob = (): CronJob => ({
  name: "log-cleanup",
  schedule: "0 2 * * *", // 매일 새벽 2시
  enabled: false, // 기본적으로 비활성화
  task: async () => {
    logger.info("Log cleanup job started");
    // 로그 파일 정리 로직을 여기에 구현
    // 예: 30일 이상 된 로그 파일 삭제
  },
});

/**
 * 모든 크론 작업을 반환합니다
 */
export const getAllCronJobs = (
  db: any,
  connections: Map<string, any>
): CronJob[] => {
  return [
    createDatabaseHealthCheckJob(db),
    createConnectionHealthCheckJob(connections),
    createSystemMonitorJob(),
    createLogCleanupJob(),
  ];
};
