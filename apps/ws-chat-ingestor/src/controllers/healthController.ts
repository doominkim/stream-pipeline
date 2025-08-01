import { Request, Response } from "express";
import { createHealthCheck } from "@ws-ingestor/util";
import { DatabaseService } from "../services/databaseService";
import redisService from "../services/redisService";

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

  /**
   * Redis 헬스체크
   */
  async getRedisHealth(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      const result = await redisService.ping();
      const responseTime = Date.now() - startTime;

      res.json({
        status: "healthy",
        redis: "connected",
        response: result,
        responseTime: `${responseTime}ms`,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        redis: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 전체 시스템 상태
   */
  async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const dbHealth = await this.dbService.healthCheck();
      const redisStartTime = Date.now();
      const redisResult = await redisService.ping();
      const redisResponseTime = Date.now() - redisStartTime;
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const systemHealth = {
        status: "healthy",
        timestamp: Date.now(),
        uptime: process.uptime(),
        database: {
          read: dbHealth.read,
          write: dbHealth.write,
          status: dbHealth.read && dbHealth.write ? "healthy" : "partial",
        },
        redis: {
          status: "healthy",
          response: redisResult,
          responseTime: `${redisResponseTime}ms`,
        },
        system: {
          memory: {
            rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          },
          cpu: {
            user: `${Math.round(cpuUsage.user / 1000)}ms`,
            system: `${Math.round(cpuUsage.system / 1000)}ms`,
          },
        },
      };

      res.json(systemHealth);
    } catch (error) {
      res.status(500).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
      });
    }
  }
}
