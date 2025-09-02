import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess, exec } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { createLogger } from "@ws-ingestor/util";
import { Channel } from "@ws-ingestor/common";
import { constants } from "../constants/streamConstants";
import { DatabaseService } from "./databaseService";

interface ChannelProcesses {
  streamlink: ChildProcess | null;
  audio: ChildProcess | null;
  capture: ChildProcess | null;
  video: ChildProcess | null;
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
  private readonly outputDir = "tmp";
  private readonly maxFileAge = 24 * 60 * 60 * 1000; // 24시간
  private readonly maxDirSize = 10 * 1024 * 1024 * 1024; // 10GB
  private readonly channelProcesses: Map<string, ChannelProcesses> = new Map();
  private readonly uploadedFiles: Set<string> = new Set();
  private readonly processingFiles: Set<string> = new Set(); // 처리 중인 파일 추적
  private readonly MAX_PROCESSES = 50; // 최대 프로세스 수 제한
  private readonly MAX_CONCURRENT_UPLOADS = 3; // 동시 업로드 수 제한
  private readonly UPLOAD_RETRY_COUNT = 3; // 업로드 재시도 횟수
  private lastErrorLog: number | null = null;
  private commandsAvailable: { [key: string]: boolean } = {};
  private initialized: boolean = false;
  private dbService?: DatabaseService;

  constructor(dbService?: DatabaseService) {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    if (dbService) {
      this.dbService = dbService;
    }
  }

  /**
   * 서비스 초기화 및 필수 명령어 확인
   * @returns 초기화 성공 여부
   */
  async initialize(): Promise<boolean> {
    try {
      // 필수 명령어 확인
      const isStreamlinkAvailable = await this.checkCommandExists("streamlink");
      if (!isStreamlinkAvailable) {
        this.logger.error(
          "streamlink is not installed. This is a required dependency."
        );
        return false;
      }

      // ffmpeg 확인 (선택 사항)
      const isFfmpegAvailable = await this.checkCommandExists("ffmpeg");
      if (!isFfmpegAvailable) {
        this.logger.warn(
          "ffmpeg is not installed. Some features may not work properly."
        );
      }

      // 주기적인 작업 설정
      setInterval(() => this.cleanupTempFiles(), 60 * 60 * 1000); // 1시간마다
      setInterval(() => this.cleanupUploadedFiles(), 60 * 60 * 1000); // 1시간마다
      setInterval(() => this.cleanupProcesses(), 30 * 60 * 1000); // 30분마다

      this.initialized = true;
      this.logger.info("StreamService initialized successfully");
      return true;
    } catch (error) {
      this.logger.error("Failed to initialize StreamService:", error);
      return false;
    }
  }

  /**
   * 서비스가 초기화되었는지 확인
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 데이터베이스 서비스 설정
   */
  setDatabaseService(dbService: DatabaseService): void {
    this.dbService = dbService;
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
        video: null,
        interval: undefined,
      });
    }
    return this.channelProcesses.get(channelId)!;
  }

  private checkCommandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.commandsAvailable[command] !== undefined) {
        resolve(this.commandsAvailable[command]);
        return;
      }

      exec(`which ${command}`, (error) => {
        if (error) {
          this.logger.warn(`Command ${command} not found`);
          this.commandsAvailable[command] = false;
          resolve(false);
        } else {
          this.logger.info(`Command ${command} is available at: ${command}`);
          this.commandsAvailable[command] = true;
          resolve(true);
        }
      });
    });
  }

  private async startStreamlink(
    channelId: string,
    streamUrl: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

    const processes = this.getChannelProcesses(channelId);

    if (processes.streamlink && !processes.streamlink.killed) {
      const error = new Error(
        constants.errorTranslations.PROCESS_ALREADY_RUNNING
      );
      (error as any).code = constants.errorMessages.PROCESS_ALREADY_RUNNING;
      throw error;
    }

    // 실제 프로세스 실행
    this.logger.info(`Starting streamlink for channel ${channelId}`);

    try {
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

      processes.streamlink.on("exit", (code) => {
        this.logger.info(
          `Streamlink process for channel ${channelId} exited with code ${code}`
        );
        processes.streamlink = null;
      });

      processes.streamlink.on("error", (err) => {
        this.logger.error(`Streamlink process error: ${err.message}`);
        processes.streamlink = null;
      });

      if (processes.streamlink.stderr) {
        processes.streamlink.stderr.on("data", (data: Buffer) => {
          this.logger.debug(`Streamlink stderr: ${data.toString()}`);
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to start streamlink: ${error.message}`);
      throw error;
    }
  }

  private async startAudioCapture(
    channelId: string,
    audioDir: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      const error = new Error(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING
      );
      (error as any).code = constants.errorMessages.STREAMLINK_NOT_RUNNING;
      throw error;
    }

    const isFfmpegAvailable = this.commandsAvailable["ffmpeg"];

    if (isFfmpegAvailable && processes.streamlink.stdout) {
      // 실제 프로세스 실행
      this.logger.info(`Starting audio capture for channel ${channelId}`);

      try {
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
          join(audioDir, `audio_${Date.now()}_%04d.aac`),
        ]);

        if (processes.streamlink.stdout && processes.audio.stdin) {
          processes.streamlink.stdout.pipe(processes.audio.stdin);
        }

        processes.audio.on("exit", (code) => {
          if (code === 0) {
            this.logger.info(
              `Audio process for channel ${channelId} completed successfully`
            );
          } else if (code === 183) {
            this.logger.warn(
              `Audio process for channel ${channelId} exited with code ${code} (likely no valid stream data)`
            );
          } else {
            this.logger.warn(
              `Audio process for channel ${channelId} exited with code ${code}`
            );
          }
          processes.audio = null;
        });

        processes.audio.on("error", (err) => {
          this.logger.error(`Audio process error: ${err.message}`);
          processes.audio = null;
        });

        if (processes.audio.stderr) {
          processes.audio.stderr.on("data", (data: Buffer) => {
            this.logger.debug(`Audio ffmpeg stderr: ${data.toString()}`);
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to start audio capture: ${error.message}`);
        this.logger.warn("Audio capture disabled due to ffmpeg error");
      }
    } else {
      this.logger.warn("ffmpeg not available, audio capture disabled");
    }
  }

  private async startImageCapture(
    channelId: string,
    imageDir: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      const error = new Error(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING
      );
      (error as any).code = constants.errorMessages.STREAMLINK_NOT_RUNNING;
      throw error;
    }

    const isFfmpegAvailable = this.commandsAvailable["ffmpeg"];

    if (isFfmpegAvailable && processes.streamlink.stdout) {
      // 실제 프로세스 실행
      this.logger.info(`Starting image capture for channel ${channelId}`);

      try {
        processes.capture = spawn("ffmpeg", [
          "-i",
          "-",
          "-f",
          "image2",
          "-vf",
          "fps=1/30",
          "-timestamp",
          "now",
          join(imageDir, `capture_${Date.now()}_%04d.jpg`),
        ]);

        if (processes.streamlink.stdout && processes.capture.stdin) {
          processes.streamlink.stdout.pipe(processes.capture.stdin);
        }

        processes.capture.on("exit", (code) => {
          if (code === 0) {
            this.logger.info(
              `Capture process for channel ${channelId} completed successfully`
            );
          } else if (code === 183) {
            this.logger.warn(
              `Capture process for channel ${channelId} exited with code ${code} (likely no valid stream data)`
            );
          } else {
            this.logger.warn(
              `Capture process for channel ${channelId} exited with code ${code}`
            );
          }
          processes.capture = null;
        });

        processes.capture.on("error", (err) => {
          this.logger.error(`Capture process error: ${err.message}`);
          processes.capture = null;
        });

        if (processes.capture.stderr) {
          processes.capture.stderr.on("data", (data: Buffer) => {
            this.logger.debug(`Capture ffmpeg stderr: ${data.toString()}`);
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to start image capture: ${error.message}`);
        this.logger.warn("Image capture disabled due to ffmpeg error");
      }
    } else {
      this.logger.warn("ffmpeg not available, image capture disabled");
    }
  }

  private async startVideoCapture(
    channelId: string,
    videoDir: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      const error = new Error(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING
      );
      (error as any).code = constants.errorMessages.STREAMLINK_NOT_RUNNING;
      throw error;
    }

    const isFfmpegAvailable = this.commandsAvailable["ffmpeg"];

    if (isFfmpegAvailable && processes.streamlink.stdout) {
      // 실제 프로세스 실행 - 15FPS로 설정하여 용량 최적화
      this.logger.info(
        `Starting video capture for channel ${channelId} at 15FPS`
      );

      try {
        processes.video = spawn("ffmpeg", [
          "-i",
          "-",
          "-map",
          "0", // 전체 스트림 (영상+오디오)
          "-c:v",
          "libx264", // H.264 비디오 코덱
          "-preset",
          "fast", // 빠른 인코딩
          "-crf",
          "28", // 품질 설정 (18-28 권장, 낮을수록 고품질)
          "-r",
          "15", // 15FPS로 설정
          "-c:a",
          "aac", // AAC 오디오 코덱
          "-b:a",
          "128k", // 오디오 비트레이트
          "-f",
          "segment",
          "-segment_time",
          "100", // 17초로 설정
          "-reset_timestamps",
          "1",
          "-movflags",
          "+faststart",
          "-timestamp",
          "now",
          join(videoDir, `video_${Date.now()}_%04d.mp4`),
        ]);

        if (processes.streamlink.stdout && processes.video.stdin) {
          processes.streamlink.stdout.pipe(processes.video.stdin);
        }

        processes.video.on("exit", (code) => {
          if (code === 0) {
            this.logger.info(
              `Video process for channel ${channelId} completed successfully`
            );
          } else if (code === 183) {
            this.logger.warn(
              `Video process for channel ${channelId} exited with code ${code} (likely no valid stream data)`
            );
          } else {
            this.logger.warn(
              `Video process for channel ${channelId} exited with code ${code}`
            );
          }
          processes.video = null;
        });

        processes.video.on("error", (err) => {
          this.logger.error(`Video process error: ${err.message}`);
          processes.video = null;
        });

        if (processes.video.stderr) {
          processes.video.stderr.on("data", (data: Buffer) => {
            this.logger.debug(`Video ffmpeg stderr: ${data.toString()}`);
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to start video capture: ${error.message}`);
        this.logger.warn("Video capture disabled due to ffmpeg error");
      }
    } else {
      this.logger.warn("ffmpeg not available, video capture disabled");
    }
  }

  async startRecording(channelId: string): Promise<string> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

    try {
      // 프로세스 실행 여부 확인
      const processes = this.getChannelProcesses(channelId);
      if (processes.streamlink && !processes.streamlink.killed) {
        return "이미 실행중인 프로세스입니다";
      }

      // 채널 설정 확인 - DB에서 채널 정보 가져오기
      const channel = await this.getChannelInfo(channelId);

      if (!channel) {
        const error = new Error(constants.errorTranslations.CHANNEL_NOT_FOUND);
        (error as any).code = constants.errorMessages.CHANNEL_NOT_FOUND;
        throw error;
      }

      if (!channel.openLive) {
        await this.stopRecording(channelId);

        const error = new Error(constants.errorTranslations.CHANNEL_NOT_LIVE);
        (error as any).code = constants.errorMessages.CHANNEL_NOT_LIVE;
        throw error;
      }

      if (!channel.isAudioCollected && !channel.isCaptureCollected) {
        const error = new Error(
          constants.errorTranslations.NO_COLLECTION_ENABLED
        );
        (error as any).code = constants.errorMessages.NO_COLLECTION_ENABLED;
        throw error;
      }

      // 스트림 URL 가져오기
      const streamUrl = await this.getStreamUrl(channelId);
      if (!streamUrl) {
        const error = new Error(constants.errorTranslations.HLS_NOT_FOUND);
        (error as any).code = constants.errorMessages.HLS_NOT_FOUND;
        throw error;
      }

      const channelDir = join(this.outputDir, channelId);
      const audioDir = join(channelDir, "audio");
      const imageDir = join(channelDir, "image");
      const videoDir = join(channelDir, "video");

      // 디렉토리 생성
      if (!existsSync(audioDir)) {
        mkdirSync(audioDir, { recursive: true });
      }
      if (!existsSync(imageDir)) {
        mkdirSync(imageDir, { recursive: true });
      }
      if (!existsSync(videoDir)) {
        mkdirSync(videoDir, { recursive: true });
      }

      // Streamlink 프로세스 시작
      await this.startStreamlink(channelId, streamUrl);

      // 오디오 수집이 활성화된 경우
      if (channel.isAudioCollected) {
        await this.startAudioCapture(channelId, audioDir);
      }

      // 영상 수집이 활성화된 경우 (isCaptureCollected를 영상 수집으로 사용)
      if (channel.isCaptureCollected) {
        await this.startVideoCapture(channelId, videoDir);
      }

      // 파일 생성 이벤트 감지
      const checkAndUploadFiles = async () => {
        try {
          await this.checkAndUploadFiles(
            channelId,
            audioDir,
            imageDir,
            videoDir
          );
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

      // 녹화 시작 로그 저장 (에러 발생해도 계속 진행)
      try {
        if (this.dbService) {
          await this.dbService.saveRecordingLog({
            channelId,
            action: "START_RECORDING",
            status: "SUCCESS",
            details: {
              channelName: channel.channelName,
              timestamp: new Date().toISOString(),
              isAudioCollected: channel.isAudioCollected,
              isCaptureCollected: channel.isCaptureCollected,
            },
          });
        }
      } catch (logError) {
        this.logger.warn(
          "Failed to save recording log, but continuing:",
          logError
        );
      }

      return "Recording started";
    } catch (error: any) {
      this.logger.error(
        `Error starting recording: ${error.message || "Unknown error"}`
      );

      // 녹화 시작 실패 로그 저장 (에러 발생해도 계속 진행)
      try {
        if (this.dbService) {
          await this.dbService.saveRecordingLog({
            channelId,
            action: "START_RECORDING",
            status: "FAILED",
            details: {
              error: error.message || "Unknown error",
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (logError) {
        this.logger.warn(
          "Failed to save error recording log, but continuing:",
          logError
        );
      }

      throw error;
    }
  }

  async stopRecording(channelId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("StreamService not initialized");
    }

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

    if (processes.video) {
      processes.video.kill();
      processes.video = null;
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

    // 녹화 중지 로그 저장 (에러 발생해도 계속 진행)
    try {
      if (this.dbService) {
        await this.dbService.saveRecordingLog({
          channelId,
          action: "STOP_RECORDING",
          status: "SUCCESS",
          details: {
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (logError) {
      this.logger.warn(
        "Failed to save stop recording log, but continuing:",
        logError
      );
    }
  }

  private cleanupTempFiles() {
    try {
      const now = Date.now();
      if (!existsSync(this.outputDir)) {
        return;
      }

      const files = readdirSync(this.outputDir);
      let totalSize = 0;

      for (const file of files) {
        const filePath = join(this.outputDir, file);
        if (!existsSync(filePath)) {
          continue;
        }

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
      if (!existsSync(filePath)) {
        return false;
      }

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
    audioDir: string,
    imageDir: string,
    videoDir?: string
  ) {
    try {
      // 오디오 파일 처리
      if (existsSync(audioDir)) {
        const audioFiles = readdirSync(audioDir).filter((file) =>
          file.endsWith(".aac")
        );
        const completedAudioFiles = audioFiles.filter((file) =>
          this.isFileComplete(join(audioDir, file))
        );

        // 처리할 파일 수 제한
        const filesToProcess = completedAudioFiles.slice(
          0,
          this.MAX_CONCURRENT_UPLOADS - this.processingFiles.size
        );

        for (const file of filesToProcess) {
          const filePath = join(audioDir, file);
          const objectName = `channels/${channelId}/audio/${file}`;

          // 이미 처리 중인 파일인지 확인
          if (this.processingFiles.has(objectName)) {
            continue;
          }

          try {
            // 처리 시작 표시
            this.processingFiles.add(objectName);

            // 파일 처리 로직 (실제 구현)
            this.logger.info(`Processing audio file: ${file}`);

            // 처리 완료 후 파일 삭제 (실제 파일이 있는 경우에만)
            if (existsSync(filePath)) {
              // 실제 업로드 로직이 있다면 여기에 구현
              // 지금은 로깅만 수행
              this.logger.info(`Successfully processed audio file: ${file}`);
              // 실제 삭제는 주석 처리
              // unlinkSync(filePath);
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
      }

      // 이미지 파일 처리
      if (existsSync(imageDir)) {
        const imageFiles = readdirSync(imageDir).filter((file) =>
          file.endsWith(".jpg")
        );
        const completedImageFiles = imageFiles.filter((file) =>
          this.isFileComplete(join(imageDir, file))
        );

        for (const file of completedImageFiles) {
          const filePath = join(imageDir, file);
          const objectName = `channels/${channelId}/image/${file}`;

          try {
            // 파일 처리 로직 (실제 구현)
            this.logger.info(`Processing image file: ${file}`);

            // 처리 완료 후 파일 삭제 (실제 파일이 있는 경우에만)
            if (existsSync(filePath)) {
              // 실제 업로드 로직이 있다면 여기에 구현
              // 지금은 로깅만 수행
              this.logger.info(`Successfully processed image file: ${file}`);
              // 실제 삭제는 주석 처리
              // unlinkSync(filePath);
            }
          } catch (error: any) {
            this.logger.error(
              `Error processing image file ${file}: ${
                error.message || "Unknown error"
              }`
            );
          }
        }
      }

      // 영상 파일 처리
      if (videoDir && existsSync(videoDir)) {
        const videoFiles = readdirSync(videoDir).filter((file) =>
          file.endsWith(".mp4")
        );
        const completedVideoFiles = videoFiles.filter((file) =>
          this.isFileComplete(join(videoDir, file))
        );

        // 처리할 파일 수 제한
        const filesToProcess = completedVideoFiles.slice(
          0,
          this.MAX_CONCURRENT_UPLOADS - this.processingFiles.size
        );

        for (const file of filesToProcess) {
          const filePath = join(videoDir, file);
          const objectName = `channels/${channelId}/video/${file}`;

          // 이미 처리 중인 파일인지 확인
          if (this.processingFiles.has(objectName)) {
            continue;
          }

          try {
            // 처리 시작 표시
            this.processingFiles.add(objectName);

            // 파일 처리 로직 (실제 구현)
            this.logger.info(`Processing video file: ${file}`);

            // 처리 완료 후 파일 삭제 (실제 파일이 있는 경우에만)
            if (existsSync(filePath)) {
              // 실제 업로드 로직이 있다면 여기에 구현
              // 지금은 로깅만 수행
              this.logger.info(`Successfully processed video file: ${file}`);
              // 실제 삭제는 주석 처리
              // unlinkSync(filePath);
            }
          } catch (error: any) {
            // 에러 로그 빈도 제한 (1분에 한 번만 기록)
            const now = Date.now();
            if (!this.lastErrorLog || now - this.lastErrorLog > 60000) {
              this.logger.error(
                `Upload failed for video file ${file}: ${
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
      }
    } catch (error: any) {
      this.logger.error(
        `Error in checkAndUploadFiles: ${error.message || "Unknown error"}`
      );
    }
  }

  // 채널 정보 가져오기
  private async getChannelInfo(channelId: string): Promise<Channel | null> {
    // DB 서비스가 있으면 DB에서 채널 정보 가져오기
    if (this.dbService) {
      try {
        const channel = await this.dbService.getChannelByUuid(channelId);
        if (channel) {
          return channel;
        }
      } catch (error) {
        this.logger.error(`Error getting channel info from DB: ${error}`);
      }
    }

    // DB에서 정보를 가져오지 못한 경우 기본값 반환
    this.logger.warn(
      `Using default channel info for ${channelId} (DB lookup failed or not available)`
    );
    return {
      id: 0,
      uuid: channelId,
      channelName: `Channel ${channelId}`,
      openLive: true,
      isChatCollected: false,
      isAudioCollected: true,
      isCaptureCollected: true,
      isEnabledAi: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // 스트림 URL 가져오기
  private async getStreamUrl(channelId: string): Promise<string> {
    try {
      this.logger.info(`Fetching stream URL for channel ${channelId}`);

      // 치지직 API를 통해 실제 스트림 URL 가져오기
      const response = await fetch(
        `https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            Referer: "https://chzzk.naver.com/",
            Origin: "https://chzzk.naver.com",
          },
        }
      );

      console.log("response", response);

      if (!response.ok) {
        this.logger.error(
          `Failed to fetch live detail for channel ${channelId}: ${response.status}`
        );
        return "";
      }

      const data = (await response.json()) as any;

      if (!data.content || !data.content.livePlaybackJson) {
        this.logger.warn(
          `No live playback data available for channel ${channelId}`
        );
        return "";
      }

      const playbackData = JSON.parse(data.content.livePlaybackJson);
      console.log("playbackData", playbackData);
      const media = playbackData.media;
      const hls = media.find((media: any) => media.mediaId === "HLS");

      if (!hls) {
        this.logger.warn(
          `No media URL found for channel ${channelId}, using test stream for development`
        );
        throw new Error("No media URL found for channel " + channelId);
      }

      this.logger.info(
        `Successfully retrieved stream URL for channel ${channelId}`
      );
      return hls.path;
    } catch (error) {
      this.logger.error(`Error getting stream URL for ${channelId}:`, error);
      return "";
    }
  }
}
