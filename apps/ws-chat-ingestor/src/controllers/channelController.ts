import { Request, Response } from "express";
import { ChannelService } from "../services/channelService";
import { CreateChannelDto, UpdateChannelDto } from "@ws-ingestor/common";

export class ChannelController {
  constructor(private channelService: ChannelService) {}

  /**
   * 모든 채널 조회
   */
  async getAllChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await this.channelService.getAllChannels();
      res.json({
        channels,
        count: channels.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to get channels",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * ID로 채널 조회
   */
  async getChannelById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const channelId = parseInt(id);

      if (isNaN(channelId)) {
        res.status(400).json({ error: "Invalid channel ID" });
        return;
      }

      const channel = await this.channelService.getChannelById(channelId);

      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      res.json({
        channel,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get channel",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * UUID로 채널 조회
   */
  async getChannelByUuid(req: Request, res: Response): Promise<void> {
    try {
      const { uuid } = req.params;

      if (!uuid) {
        res.status(400).json({ error: "UUID is required" });
        return;
      }

      const channel = await this.channelService.getChannelByUuid(uuid);

      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      res.json({
        channel,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get channel",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 채널 생성
   */
  async createChannel(req: Request, res: Response): Promise<void> {
    try {
      const channelData: CreateChannelDto = req.body;

      // 필수 필드 검증
      if (!channelData.uuid || !channelData.channelName) {
        res.status(400).json({ error: "UUID and channelName are required" });
        return;
      }

      // 채널 존재 여부 확인
      const exists = await this.channelService.channelExists(channelData.uuid);
      if (exists) {
        res
          .status(409)
          .json({ error: "Channel with this UUID already exists" });
        return;
      }

      const channel = await this.channelService.createChannel(channelData);
      res.status(201).json({
        channel,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to create channel",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 채널 업데이트
   */
  async updateChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const channelId = parseInt(id);
      const updateData: UpdateChannelDto = req.body;

      if (isNaN(channelId)) {
        res.status(400).json({ error: "Invalid channel ID" });
        return;
      }

      const channel = await this.channelService.updateChannel(
        channelId,
        updateData
      );

      if (!channel) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      res.json({
        channel,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to update channel",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 채널 삭제
   */
  async deleteChannel(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const channelId = parseInt(id);

      if (isNaN(channelId)) {
        res.status(400).json({ error: "Invalid channel ID" });
        return;
      }

      const deleted = await this.channelService.deleteChannel(channelId);

      if (!deleted) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      res.json({
        message: "Channel deleted successfully",
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Failed to delete channel",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 채팅 수집이 활성화된 채널 조회
   */
  async getChatCollectedChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await this.channelService.getChatCollectedChannels();
      res.json({
        channels,
        count: channels.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get chat-collected channels",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 오디오 수집이 활성화된 채널 조회
   */
  async getAudioCollectedChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await this.channelService.getAudioCollectedChannels();
      res.json({
        channels,
        count: channels.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get audio-collected channels",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 라이브 중인 채널 조회
   */
  async getLiveChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await this.channelService.getLiveChannels();
      res.json({
        channels,
        count: channels.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "Failed to get live channels",
        timestamp: Date.now(),
      });
    }
  }
}
