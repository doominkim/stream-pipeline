import { Request, Response } from "express";
import { createHealthCheck } from "@ws-ingestor/util";
import { DatabaseService } from "../services/databaseService";

export class HealthController {
  constructor(private dbService: DatabaseService) {}

  /**
   * 기본 헬스체크
   */
  getHealth(req: Request, res: Response): void {
    res.json(createHealthCheck("chat-ingestor"));
  }

  /**
   * 데이터베이스 헬스체크
   */
  async getDatabaseHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await this.dbService.healthCheck();
      res.json({
        status: "healthy",
        database: health.read && health.write ? "connected" : "partial",
        connections: health,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });
    }
  }
}
