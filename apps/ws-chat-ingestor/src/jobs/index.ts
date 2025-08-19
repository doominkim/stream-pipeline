import { CronJob } from "../services/cronService";
import { createLogger } from "@ws-ingestor/util";
import { DatabaseService } from "../services/databaseService";
import { RedisService } from "../services/redisService";
import { createChatService } from "../services/chatService";
import { ChzzkModule } from "chzzk-z";
import { sendChatToKinesis } from "../services/kinesisService";
import fs from "fs";
import path from "path";

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

let chatSentCount = 0;
setInterval(() => {
  const now = new Date();
  const logFile = path.join(
    process.cwd(),
    `chat-kinesis-count-${now.toISOString().slice(0, 10)}.log`
  );
  const logLine = `${now.toISOString()}, count: ${chatSentCount}\n`;
  console.log(`[KINESIS LOG] writing to:`, logFile, "count:", chatSentCount);
  fs.appendFileSync(logFile, logLine);
  chatSentCount = 0;
}, 60000);

const MAX_CHANNEL_COUNT = process.env.MAX_CHANNEL_COUNT
  ? Number(process.env.MAX_CHANNEL_COUNT)
  : 10;
const MAX_CONCURRENT_USERS = 10000;

const myChannels = new Set<string>(); // channelUuid들을 저장
const isCollectingChzzkModules: Map<string, ChzzkModule> = new Map(); // channelUuid -> ChzzkModule
const channelUuidToIdMap: Map<string, number> = new Map(); // channelUuid -> actual channelId
let cleanupCounter = 0; // 죽은 락 정리 카운터

export const createChatIngestJob = (
  dbService: DatabaseService,
  redisService: RedisService
): CronJob => ({
  name: "chat-ingest",
  schedule: "*/10 * * * * *", // 10초마다
  enabled: true,
  task: async () => {
    // 1. 점유 채널 relock 및 해제
    for (const channelUuid of [...myChannels]) {
      const ok = await redisService.relockChannel(channelUuid, 30);
      if (!ok) {
        // relock 실패 시 Redis에서도 락 삭제
        await redisService.unlockChannel(channelUuid);
        myChannels.delete(channelUuid);
        const mod = isCollectingChzzkModules.get(channelUuid);
        if (mod) {
          // 수집 중단: setInterval 등 정리 필요(여기선 단순히 Map에서만 제거)
          isCollectingChzzkModules.delete(channelUuid);
        }
        channelUuidToIdMap.delete(channelUuid);
        logger.warn(
          `[LOCK LOST] ${channelUuid} relock failed, removed from myChannels and Redis`
        );
      }
    }

    // 2. 점유 채널이 MAX 미만이면 신규 채널 점유 시도
    if (myChannels.size < MAX_CHANNEL_COUNT) {
      let currentConcurrentUsers = 0;
      for (const channelUuid of myChannels) {
        const info = await redisService.getChannelInfo(channelUuid);
        const count = Number((info as any)?.concurrentUserCount) || 0;
        currentConcurrentUsers += count;
      }

      const channelUuids = await redisService.keys("channel:*");
      const { channelUuids: allChannelUuids, lockUuids } =
        redisService.extractUuidsFromChannelKeys(channelUuids);

      for (const channelUuid of allChannelUuids) {
        if (myChannels.size >= MAX_CHANNEL_COUNT) break;
        if (currentConcurrentUsers >= MAX_CONCURRENT_USERS) break;
        if (myChannels.has(channelUuid)) continue;

        const isLocked = await redisService.isLocked(channelUuid);
        if (isLocked) continue;

        const candidateInfo = await redisService.getChannelInfo(channelUuid);
        const candidateConcurrentUsers =
          Number((candidateInfo as any)?.concurrentUserCount) || 0;
        if (
          currentConcurrentUsers + candidateConcurrentUsers >
          MAX_CONCURRENT_USERS
        )
          continue;

        const locked = await redisService.lockChannel(channelUuid, 30);
        if (locked) {
          myChannels.add(channelUuid);
          currentConcurrentUsers += candidateConcurrentUsers;
          logger.info(
            `[LOCK ACQUIRED] ${channelUuid} locked by ${redisService.instanceName}`
          );

          // 채널 정보 조회하여 실제 channelId 저장
          const channelInfo = await redisService.getChannelInfo(channelUuid);
          if (channelInfo && channelInfo.id) {
            channelUuidToIdMap.set(channelUuid, channelInfo.id);
            logger.info(
              `[CHANNEL INFO] ${channelUuid} -> channelId: ${channelInfo.id}, name: ${channelInfo.channelName}`
            );
          } else {
            logger.warn(
              `[CHANNEL INFO] Failed to get channel info for ${channelUuid}`
            );
          }

          if (!isCollectingChzzkModules.get(channelUuid)) {
            const chzzkModule = new ChzzkModule();
            try {
              await chzzkModule.chat.join(channelUuid);
              isCollectingChzzkModules.set(channelUuid, chzzkModule);
              logger.debug(`채널 ${channelUuid} 채팅 연결 성공`);

              setInterval(async () => {
                const events = chzzkModule.chat.pollingEvent();
                if (Array.isArray(events)) {
                  for (const chat of events) {
                    try {
                      // 실제 channelId를 chat 객체에 추가
                      const actualChannelId =
                        channelUuidToIdMap.get(channelUuid);
                      if (actualChannelId) {
                        const chatWithChannelId = {
                          ...chat,
                          channelId: actualChannelId,
                          channelUuid: channelUuid,
                        };
                        await sendChatToKinesis(chatWithChannelId);
                        chatSentCount++;
                        console.log(
                          `[CHAT] ${chat.profile?.nickname}: ${chat.msg} (channelId: ${actualChannelId})`
                        );
                      } else {
                        logger.warn(
                          `[CHAT] No channelId found for ${channelUuid}, skipping chat`
                        );
                      }
                    } catch (err) {
                      logger.error("채팅 Kinesis 전송 실패", err);
                    }
                  }
                }
              }, 1000);
            } catch (joinError) {
              logger.warn(`채널 ${channelUuid} 채팅 조인 실패:`, joinError);
            }
          }
        }
      }
    }
  },
});

export const getAllCronJobs = (
  dbService: DatabaseService,
  redisService: RedisService
): CronJob[] => {
  return [createChatIngestJob(dbService, redisService)];
};
