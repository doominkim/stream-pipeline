import cron from "node-cron";
import { createLogger } from "@ws-ingestor/util";

const logger = createLogger("cron-service");

export interface CronJob {
  name: string;
  schedule: string;
  task: () => Promise<void> | void;
  enabled?: boolean;
}

export class CronService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private logger = createLogger("cron-service");

  constructor() {
    this.logger.info("Cron service initialized");
  }

  /**
   * 크론 작업을 추가합니다
   */
  addJob(job: CronJob): void {
    if (!job.enabled) {
      this.logger.info(`Job ${job.name} is disabled, skipping`);
      return;
    }

    try {
      const scheduledTask = cron.schedule(
        job.schedule,
        async () => {
          try {
            this.logger.info(`Starting scheduled job: ${job.name}`);
            await job.task();
            this.logger.info(`Completed scheduled job: ${job.name}`);
          } catch (error) {
            this.logger.error(`Error in scheduled job ${job.name}:`, error);
          }
        },
        {
          scheduled: false,
          timezone: "Asia/Seoul",
        }
      );

      this.jobs.set(job.name, scheduledTask);
      scheduledTask.start();
      this.logger.info(
        `Added and started cron job: ${job.name} with schedule: ${job.schedule}`
      );
    } catch (error) {
      this.logger.error(`Failed to add cron job ${job.name}:`, error);
    }
  }

  /**
   * 특정 작업을 중지합니다
   */
  stopJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.logger.info(`Stopped cron job: ${jobName}`);
    } else {
      this.logger.warn(`Cron job not found: ${jobName}`);
    }
  }

  /**
   * 특정 작업을 시작합니다
   */
  startJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      this.logger.info(`Started cron job: ${jobName}`);
    } else {
      this.logger.warn(`Cron job not found: ${jobName}`);
    }
  }

  /**
   * 모든 작업을 중지합니다
   */
  stopAllJobs(): void {
    this.jobs.forEach((job, name) => {
      job.stop();
      this.logger.info(`Stopped cron job: ${name}`);
    });
  }

  /**
   * 모든 작업을 시작합니다
   */
  startAllJobs(): void {
    this.jobs.forEach((job, name) => {
      job.start();
      this.logger.info(`Started cron job: ${name}`);
    });
  }

  /**
   * 등록된 작업 목록을 반환합니다
   */
  getJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * 서비스를 종료합니다
   */
  shutdown(): void {
    this.stopAllJobs();
    this.logger.info("Cron service shutdown completed");
  }
}

export const createCronService = (): CronService => {
  return new CronService();
};
