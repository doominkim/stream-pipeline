import express from "express";
import { StreamService } from "./stream.service";
import { createLogger } from "@ws-ingestor/util";
import { StreamError } from "./stream.error";

export class StreamController {
  private readonly logger = createLogger("stream-controller");

  constructor(private readonly streamService: StreamService) {}

  setupRoutes(app: express.Application): void {
    app.post("/stream/start/:channelId", this.startRecording.bind(this));
    app.delete("/stream/stop/:channelId", this.stopRecording.bind(this));
  }

  async startRecording(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { channelId } = req.params;
      const result = await this.streamService.startRecording(channelId);
      res.status(200).json({ success: true, message: result });
    } catch (error: any) {
      this.logger.error(
        `Error starting recording: ${error.message || "Unknown error"}`
      );
      res.status(400).json({
        success: false,
        message: error.message || "Unknown error occurred",
        code: (error as StreamError).code || "UNKNOWN_ERROR",
      });
    }
  }

  async stopRecording(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { channelId } = req.params;
      await this.streamService.stopRecording(channelId);
      res.status(200).json({ success: true, message: "Recording stopped" });
    } catch (error: any) {
      this.logger.error(
        `Error stopping recording: ${error.message || "Unknown error"}`
      );
      res.status(400).json({
        success: false,
        message: error.message || "Unknown error occurred",
        code: (error as StreamError).code || "UNKNOWN_ERROR",
      });
    }
  }
}
