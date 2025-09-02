import { CronJob } from "../services/cronService";
import { createLogger } from "@ws-ingestor/util";
import { StreamService } from "../services/streamService";
import { DatabaseService } from "../services/databaseService";

const logger = createLogger("stream-jobs");

/**
 * 스트림 녹화 작업을 생성합니다.
 * RDS에서 가져온 채널들에 대해 스케줄에 따라 녹화를 시작합니다.
 */
export const createStreamRecordingJob = (
  streamService: StreamService,
  dbService: DatabaseService
): CronJob => ({
  name: "stream-recording",
  schedule: "*/10 * * * * *", // 5초마다 체크
  enabled: true,
  task: async () => {
    try {
      // RDS에서 채널 목록 가져오기
      const channels = await dbService.getRecordingChannels();

      // 채널이 없으면 종료
      if (!channels || channels.length === 0) {
        return;
      }

      // 각 채널에 대해 녹화 시작
      for (const channel of channels) {
        // 채널이 녹화 대상인지 확인
        if (!channel.isAudioCollected && !channel.isCaptureCollected) {
          continue;
        }

        try {
          // 채널이 이미 녹화 중인지 확인하는 로직 필요
          // 여기서는 간단하게 시작만 시도
          await streamService.startRecording(channel.uuid);
        } catch (error: any) {
          // 이미 실행 중이거나 방송 중이 아닌 경우는 정상적인 상황이므로 에러 레벨을 낮춤
          if (
            error.message.includes("이미 실행중인 프로세스입니다") ||
            error.code === "CHANNEL_NOT_LIVE"
          ) {
            logger.debug(`Channel ${channel.uuid}: ${error.message}`);
          } else {
            logger.error(
              `Failed to start recording for channel ${channel.uuid}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      logger.error("Error in stream recording job:", error);
    }
  },
});

/**
 * 모든 크론 작업 목록을 반환합니다
 */
export const getAllCronJobs = (
  streamService: StreamService,
  dbService: DatabaseService
): CronJob[] => {
  return [createStreamRecordingJob(streamService, dbService)];
};
