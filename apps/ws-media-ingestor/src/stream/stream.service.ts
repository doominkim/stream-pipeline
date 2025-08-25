import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { createLogger } from "@ws-ingestor/util";
import { StreamError } from "./stream.error";
import { constants } from "./stream.constants";

interface ChannelProcesses {
  streamlink: ChildProcess | null;
  audio: ChildProcess | null;
  capture: ChildProcess | null;
  interval?: NodeJS.Timeout;
}

export interface FileType {
  AUDIO: "audio";
  IMAGE: "image";
}

export const FileType: FileType = {
  AUDIO: "audio",
  IMAGE: "image",
};

export class StreamService {
  private readonly logger = createLogger("stream-service");
  private readonly outputDir = "recordings";
  private readonly maxFileAge = 24 * 60 * 60 * 1000; // 24시간
  private readonly maxDirSize = 10 * 1024 * 1024 * 1024; // 10GB
  private readonly channelProcesses: Map<string, ChannelProcesses> = new Map();
  private readonly uploadedFiles: Set<string> = new Set();
  private readonly processingFiles: Set<string> = new Set(); // 처리 중인 파일 추적
  private readonly MAX_PROCESSES = 50; // 최대 프로세스 수 제한
  private readonly MAX_CONCURRENT_UPLOADS = 3; // 동시 업로드 수 제한
  private readonly UPLOAD_RETRY_COUNT = 3; // 업로드 재시도 횟수
  private lastErrorLog: number | null = null;

  constructor() {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
    // 주기적으로 임시 파일 정리
    setInterval(() => this.cleanupTempFiles(), 60 * 60 * 1000); // 1시간마다
    // 주기적으로 업로드된 파일 목록 정리
    setInterval(() => this.cleanupUploadedFiles(), 60 * 60 * 1000); // 1시간마다
    // 주기적으로 프로세스 Map 정리
    setInterval(() => this.cleanupProcesses(), 30 * 60 * 1000); // 30분마다
  }

  private cleanupProcesses() {
    if (this.channelProcesses.size > this.MAX_PROCESSES) {
      const keysToDelete = Array.from(this.channelProcesses.keys()).slice(
        0,
        10
      );
      keysToDelete.forEach((key) => {
        const processes = this.channelProcesses.get(key);
        if (
          processes &&
          !processes.streamlink &&
          !processes.audio &&
          !processes.capture
        ) {
          if (processes.interval) {
            clearInterval(processes.interval);
          }
          this.channelProcesses.delete(key);
        }
      });
      this.logger.info("Cleaned up inactive channel processes");
    }
  }

  private getChannelProcesses(channelId: string): ChannelProcesses {
    if (!this.channelProcesses.has(channelId)) {
      this.channelProcesses.set(channelId, {
        streamlink: null,
        audio: null,
        capture: null,
        interval: undefined,
      });
    }
    return this.channelProcesses.get(channelId)!;
  }

  private async startStreamlink(
    channelId: string,
    streamUrl: string
  ): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (processes.streamlink && !processes.streamlink.killed) {
      throw new StreamError(
        constants.errorTranslations.PROCESS_ALREADY_RUNNING,
        constants.errorMessages.PROCESS_ALREADY_RUNNING
      );
    }

    processes.streamlink = spawn("streamlink", [
      "--http-header",
      "User-Agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "--http-header",
      "Referer=https://chzzk.naver.com/",
      "--http-header",
      "Origin=https://chzzk.naver.com",
      "-O",
      streamUrl,
      "best",
    ]);

    processes.streamlink.on("exit", () => {
      this.logger.info(`Streamlink process for channel ${channelId} exited`);
      processes.streamlink = null;
    });

    if (processes.streamlink.stderr) {
      processes.streamlink.stderr.on("data", (data: Buffer) => {
        // this.logger.info(`Streamlink info for channel ${channelId}: ${data}`);
      });
    }
  }

  private async startAudioCapture(
    channelId: string,
    channelDir: string
  ): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      throw new StreamError(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING,
        constants.errorMessages.STREAMLINK_NOT_RUNNING
      );
    }

    processes.audio = spawn("ffmpeg", [
      "-i",
      "-",
      "-map",
      "0:a",
      "-c:a",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      "10",
      "-movflags",
      "+faststart",
      "-write_xing",
      "1",
      "-id3v2_version",
      "3",
      "-timestamp",
      "now",
      join(channelDir, `audio_${Date.now()}_%03d.aac`),
    ]);

    if (processes.streamlink.stdout && processes.audio.stdin) {
      processes.streamlink.stdout.pipe(processes.audio.stdin);
    }

    processes.audio.on("exit", () => {
      // this.logger.info(`Audio process for channel ${channelId} exited`);
      processes.audio = null;
    });

    if (processes.audio.stderr) {
      processes.audio.stderr.on("data", (data: Buffer) => {
        // this.logger.info(`Audio ffmpeg info for channel ${channelId}: ${data}`);
      });
    }
  }

  private async startImageCapture(
    channelId: string,
    channelDir: string
  ): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      throw new StreamError(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING,
        constants.errorMessages.STREAMLINK_NOT_RUNNING
      );
    }

    processes.capture = spawn("ffmpeg", [
      "-i",
      "-",
      "-f",
      "image2",
      "-vf",
      "fps=1/30",
      "-timestamp",
      "now",
      join(channelDir, `capture_${Date.now()}_%03d.jpg`),
    ]);

    if (processes.streamlink.stdout && processes.capture.stdin) {
      processes.streamlink.stdout.pipe(processes.capture.stdin);
    }

    processes.capture.on("exit", () => {
      // this.logger.info(`Capture process for channel ${channelId} exited`);
      processes.capture = null;
    });

    if (processes.capture.stderr) {
      processes.capture.stderr.on("data", (data: Buffer) => {
        // this.logger.info(`Capture ffmpeg info for channel ${channelId}: ${data}`);
      });
    }
  }

  async startRecording(channelId: string): Promise<string> {
    try {
      // 프로세스 실행 여부 확인
      const processes = this.getChannelProcesses(channelId);
      if (processes.streamlink && !processes.streamlink.killed) {
        return "이미 실행중인 프로세스입니다";
      }

      // 채널 설정 확인 - 채널 서비스에서 채널 정보 가져오기 (임시 구현)
      const channel = await this.getChannelInfo(channelId);
      if (!channel) {
        throw new StreamError(
          constants.errorTranslations.CHANNEL_NOT_FOUND,
          constants.errorMessages.CHANNEL_NOT_FOUND
        );
      }

      if (!channel.openLive) {
        await this.stopRecording(channelId);

        throw new StreamError(
          constants.errorTranslations.CHANNEL_NOT_LIVE,
          constants.errorMessages.CHANNEL_NOT_LIVE
        );
      }

      if (!channel.isAudioCollected && !channel.isCaptureCollected) {
        throw new StreamError(
          constants.errorTranslations.NO_COLLECTION_ENABLED,
          constants.errorMessages.NO_COLLECTION_ENABLED
        );
      }

      // 스트림 URL 가져오기 (임시 구현)
      const streamUrl = await this.getStreamUrl(channelId);
      if (!streamUrl) {
        throw new StreamError(
          constants.errorTranslations.HLS_NOT_FOUND,
          constants.errorMessages.HLS_NOT_FOUND
        );
      }

      const liveId = Date.now().toString(); // 임시 liveId 생성
      const channelDir = join(this.outputDir, channelId, liveId);

      if (!existsSync(channelDir)) {
        mkdirSync(channelDir, { recursive: true });
      }

      // Streamlink 프로세스 시작
      await this.startStreamlink(channelId, streamUrl);

      // 오디오 수집이 활성화된 경우
      if (channel.isAudioCollected) {
        await this.startAudioCapture(channelId, channelDir);
      }

      // 캡처 수집이 활성화된 경우
      if (channel.isCaptureCollected) {
        await this.startImageCapture(channelId, channelDir);
      }

      // 파일 생성 이벤트 감지
      const checkAndUploadFiles = async () => {
        try {
          await this.checkAndUploadFiles(channelId, liveId, channelDir);
        } catch (error: any) {
          this.logger.error(
            `Error in checkAndUploadFiles: ${error.message || "Unknown error"}`
          );
        }
      };

      // 기존 interval이 있다면 제거
      if (processes.interval) {
        clearInterval(processes.interval);
      }

      // 10초마다 파일 체크 및 업로드 (interval ID 저장)
      processes.interval = setInterval(checkAndUploadFiles, 10000);

      return "Recording started";
    } catch (error: any) {
      this.logger.error(
        `Error starting recording: ${error.message || "Unknown error"}`
      );
      throw error;
    }
  }

  async stopRecording(channelId: string): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (!processes) {
      return;
    }

    // interval 정리
    if (processes.interval) {
      clearInterval(processes.interval);
      processes.interval = undefined;
    }

    if (processes.capture) {
      processes.capture.kill();
      processes.capture = null;
    }

    if (processes.audio) {
      processes.audio.kill();
      processes.audio = null;
    }

    if (processes.streamlink) {
      processes.streamlink.kill();
      processes.streamlink = null;
    }

    this.channelProcesses.delete(channelId);
  }

  private cleanupTempFiles() {
    try {
      const now = Date.now();
      const files = readdirSync(this.outputDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = join(this.outputDir, file);
        const stats = statSync(filePath);
        totalSize += stats.size;

        // 파일이 24시간 이상 지났거나 디렉토리 크기가 10GB를 초과하면 삭제
        if (
          now - stats.mtimeMs > this.maxFileAge ||
          totalSize > this.maxDirSize
        ) {
          try {
            unlinkSync(filePath);
            this.logger.info(`Cleaned up temporary file: ${file}`);
          } catch (error: any) {
            this.logger.error(
              `Error cleaning up file ${file}: ${
                error.message || "Unknown error"
              }`
            );
          }
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error in cleanupTempFiles: ${error.message || "Unknown error"}`
      );
    }
  }

  private cleanupUploadedFiles() {
    this.uploadedFiles.clear();
    this.processingFiles.clear(); // 처리 중인 파일 목록도 정리
    this.logger.info("Cleared uploaded and processing files cache");
  }

  private isFileComplete(filePath: string): boolean {
    try {
      const stats = statSync(filePath);
      const now = Date.now();

      // 파일 크기가 0보다 크고
      // 10초 이상 크기가 변하지 않았고 (더 긴 시간으로 설정)
      // 10초 이상 수정되지 않았다면 완성된 것으로 간주
      return stats.size > 0 && now - stats.ctimeMs > 10000;
    } catch (error) {
      return false;
    }
  }

  private async checkAndUploadFiles(
    channelId: string,
    liveId: string,
    channelDir: string
  ) {
    try {
      const files = readdirSync(channelDir);
      const audioFiles = files.filter((file) => file.endsWith(".aac"));
      const imageFiles = files.filter((file) => file.endsWith(".jpg"));

      // 완성된 파일만 필터링
      const completedAudioFiles = audioFiles.filter((file) =>
        this.isFileComplete(join(channelDir, file))
      );
      const completedImageFiles = imageFiles.filter((file) =>
        this.isFileComplete(join(channelDir, file))
      );

      // 동시 업로드 수 제한 - 처리 중인 파일 수가 제한을 초과하면 대기
      if (this.processingFiles.size >= this.MAX_CONCURRENT_UPLOADS) {
        this.logger.info(
          `Max concurrent uploads reached (${this.processingFiles.size}/${this.MAX_CONCURRENT_UPLOADS}), skipping this cycle`
        );
        return;
      }

      // 처리할 파일 수 제한
      const filesToProcess = completedAudioFiles.slice(
        0,
        this.MAX_CONCURRENT_UPLOADS - this.processingFiles.size
      );

      // 오디오 파일 순차 처리
      for (const file of filesToProcess) {
        const filePath = join(channelDir, file);
        const objectName = `channels/${channelId}/lives/${liveId}/audios/${file}`;

        // 이미 처리 중인 파일인지 확인
        if (this.processingFiles.has(objectName)) {
          continue;
        }

        try {
          // 처리 시작 표시
          this.processingFiles.add(objectName);

          // 파일 처리 로직 (임시 구현)
          this.logger.info(`Processing audio file: ${file}`);

          // 처리 완료 후 파일 삭제
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            this.logger.info(`Successfully processed audio file: ${file}`);
          }
        } catch (error: any) {
          // 에러 로그 빈도 제한 (1분에 한 번만 기록)
          const now = Date.now();
          if (!this.lastErrorLog || now - this.lastErrorLog > 60000) {
            this.logger.error(
              `Upload failed for audio file ${file}: ${
                error.message || "Unknown error"
              }`
            );
            this.lastErrorLog = now;
          }
        } finally {
          // 처리 완료 후 제거
          this.processingFiles.delete(objectName);
        }
      }

      // 이미지 파일 순차 처리
      for (const file of completedImageFiles) {
        const filePath = join(channelDir, file);
        const objectName = `channels/${channelId}/lives/${liveId}/images/${file}`;

        try {
          // 파일 처리 로직 (임시 구현)
          this.logger.info(`Processing image file: ${file}`);

          // 처리 완료 후 파일 삭제
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            this.logger.info(`Deleted uploaded image file: ${file}`);
          }
        } catch (error: any) {
          this.logger.error(
            `Error processing image file ${file}: ${
              error.message || "Unknown error"
            }`
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Error in checkAndUploadFiles: ${error.message || "Unknown error"}`
      );
    }
  }

  // 임시 구현 - 채널 정보 가져오기
  private async getChannelInfo(channelId: string): Promise<any> {
    // 실제로는 DB에서 채널 정보를 가져와야 함
    return {
      uuid: channelId,
      channelName: `Channel ${channelId}`,
      openLive: true,
      isAudioCollected: true,
      isCaptureCollected: true,
    };
  }

  // 임시 구현 - 스트림 URL 가져오기
  private async getStreamUrl(channelId: string): Promise<string> {
    // 실제로는 외부 API 등을 통해 스트림 URL을 가져와야 함
    return `https://example.com/stream/${channelId}`;
  }
}
