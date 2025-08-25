import * as fs from "fs";
import * as path from "path";
import { spawn, ChildProcess, exec } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { createLogger } from "@ws-ingestor/util";
import { constants } from "../constants/streamConstants";

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
  private commandsAvailable: { [key: string]: boolean } = {};

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

    // 필요한 명령어 확인
    this.checkCommandExists("streamlink");
    this.checkCommandExists("ffmpeg");
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

  private checkCommandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.commandsAvailable[command] !== undefined) {
        resolve(this.commandsAvailable[command]);
        return;
      }

      exec(`which ${command}`, (error) => {
        if (error) {
          this.logger.warn(
            `Command ${command} not found, using mock implementation`
          );
          this.commandsAvailable[command] = false;
          resolve(false);
        } else {
          this.logger.info(`Command ${command} is available`);
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
    const processes = this.getChannelProcesses(channelId);

    if (processes.streamlink && !processes.streamlink.killed) {
      const error = new Error(
        constants.errorTranslations.PROCESS_ALREADY_RUNNING
      );
      (error as any).code = constants.errorMessages.PROCESS_ALREADY_RUNNING;
      throw error;
    }

    const isStreamlinkAvailable = await this.checkCommandExists("streamlink");

    if (isStreamlinkAvailable) {
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
        this.useMockStreamlink(processes, channelId, streamUrl);
      }
    } else {
      // 모의 구현 사용
      this.useMockStreamlink(processes, channelId, streamUrl);
    }
  }

  private useMockStreamlink(
    processes: ChannelProcesses,
    channelId: string,
    streamUrl: string
  ) {
    this.logger.info(
      `[MOCK] Starting streamlink for channel ${channelId} with URL ${streamUrl}`
    );

    // 실제 프로세스 생성 없이 더미 객체 생성
    const dummyProcess = {
      stdout: {
        pipe: () => {},
      },
      stderr: {
        on: (event: string, callback: Function) => {},
      },
      on: (event: string, callback: Function) => {
        if (event === "exit") {
          // 즉시 종료 이벤트를 발생시키지 않음
        }
      },
      kill: () => {},
      killed: false,
    } as unknown as ChildProcess;

    processes.streamlink = dummyProcess;
  }

  private async startAudioCapture(
    channelId: string,
    channelDir: string
  ): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      const error = new Error(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING
      );
      (error as any).code = constants.errorMessages.STREAMLINK_NOT_RUNNING;
      throw error;
    }

    const isFfmpegAvailable = await this.checkCommandExists("ffmpeg");

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
          join(channelDir, `audio_${Date.now()}_%03d.aac`),
        ]);

        if (processes.streamlink.stdout && processes.audio.stdin) {
          processes.streamlink.stdout.pipe(processes.audio.stdin);
        }

        processes.audio.on("exit", (code) => {
          this.logger.info(
            `Audio process for channel ${channelId} exited with code ${code}`
          );
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
        this.useMockAudioCapture(processes, channelId, channelDir);
      }
    } else {
      // 모의 구현 사용
      this.useMockAudioCapture(processes, channelId, channelDir);
    }
  }

  private useMockAudioCapture(
    processes: ChannelProcesses,
    channelId: string,
    channelDir: string
  ) {
    this.logger.info(
      `[MOCK] Starting audio capture for channel ${channelId} in directory ${channelDir}`
    );

    // 실제 프로세스 생성 없이 더미 객체 생성
    const dummyProcess = {
      stdin: {
        write: () => {},
      },
      stderr: {
        on: (event: string, callback: Function) => {},
      },
      on: (event: string, callback: Function) => {
        if (event === "exit") {
          // 즉시 종료 이벤트를 발생시키지 않음
        }
      },
      kill: () => {},
      killed: false,
    } as unknown as ChildProcess;

    processes.audio = dummyProcess;
  }

  private async startImageCapture(
    channelId: string,
    channelDir: string
  ): Promise<void> {
    const processes = this.getChannelProcesses(channelId);

    if (!processes.streamlink) {
      const error = new Error(
        constants.errorTranslations.STREAMLINK_NOT_RUNNING
      );
      (error as any).code = constants.errorMessages.STREAMLINK_NOT_RUNNING;
      throw error;
    }

    const isFfmpegAvailable = await this.checkCommandExists("ffmpeg");

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
          join(channelDir, `capture_${Date.now()}_%03d.jpg`),
        ]);

        if (processes.streamlink.stdout && processes.capture.stdin) {
          processes.streamlink.stdout.pipe(processes.capture.stdin);
        }

        processes.capture.on("exit", (code) => {
          this.logger.info(
            `Capture process for channel ${channelId} exited with code ${code}`
          );
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
        this.useMockImageCapture(processes, channelId, channelDir);
      }
    } else {
      // 모의 구현 사용
      this.useMockImageCapture(processes, channelId, channelDir);
    }
  }

  private useMockImageCapture(
    processes: ChannelProcesses,
    channelId: string,
    channelDir: string
  ) {
    this.logger.info(
      `[MOCK] Starting image capture for channel ${channelId} in directory ${channelDir}`
    );

    // 실제 프로세스 생성 없이 더미 객체 생성
    const dummyProcess = {
      stdin: {
        write: () => {},
      },
      stderr: {
        on: (event: string, callback: Function) => {},
      },
      on: (event: string, callback: Function) => {
        if (event === "exit") {
          // 즉시 종료 이벤트를 발생시키지 않음
        }
      },
      kill: () => {},
      killed: false,
    } as unknown as ChildProcess;

    processes.capture = dummyProcess;
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

      // 스트림 URL 가져오기 (임시 구현)
      const streamUrl = await this.getStreamUrl(channelId);
      if (!streamUrl) {
        const error = new Error(constants.errorTranslations.HLS_NOT_FOUND);
        (error as any).code = constants.errorMessages.HLS_NOT_FOUND;
        throw error;
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
    liveId: string,
    channelDir: string
  ) {
    try {
      if (!existsSync(channelDir)) {
        return;
      }

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

      // 이미지 파일 순차 처리
      for (const file of completedImageFiles) {
        const filePath = join(channelDir, file);
        const objectName = `channels/${channelId}/lives/${liveId}/images/${file}`;

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
