import { WebSocketServer } from "ws";
import express from "express";
import dotenv from "dotenv";
import {
  createLogger,
  generateSessionId,
  parseMessage,
  createHealthCheck,
  createDatabaseConnection,
  DatabaseConfig,
} from "@ws-ingestor/util";
import { ChatMessage, MESSAGE_TYPES, DEFAULT_PORTS } from "@ws-ingestor/common";
import { createCronService } from "./services/cronService";
import { getAllCronJobs } from "./jobs";

// Load environment variables
dotenv.config();

const logger = createLogger("chat-ingestor");
const app = express();
const port = process.env.PORT || DEFAULT_PORTS.CHAT_INGESTOR;

// Database configuration
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "chat_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  ssl: process.env.DB_SSL === "true",
};

// Initialize database connection
const db = createDatabaseConnection(dbConfig);

// Initialize cron service
const cronService = createCronService();

console.log("dbConfig", dbConfig, db);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(createHealthCheck("chat-ingestor"));
});

// Database health check endpoint
app.get("/health/db", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (error) {
    logger.error("Database health check failed:", error);
    res.status(500).json({ status: "unhealthy", database: "disconnected" });
  }
});

// Cron jobs status endpoint
app.get("/health/cron", (req, res) => {
  res.json({
    status: "healthy",
    cron: "running",
    activeJobs: cronService.getJobs(),
    timestamp: Date.now(),
  });
});

// Create HTTP server
const server = app.listen(port, () => {
  logger.info(`Chat ingestor server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const connections = new Map<string, any>();

// Initialize cron jobs
const cronJobs = getAllCronJobs(db, connections);
cronJobs.forEach((job) => {
  cronService.addJob(job);
});

logger.info(`Initialized ${cronJobs.length} cron jobs`);

wss.on("connection", (ws, req) => {
  const sessionId = generateSessionId();
  connections.set(sessionId, ws);

  logger.info(`New chat connection established: ${sessionId}`);

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: "connection_established",
      payload: { sessionId },
      timestamp: Date.now(),
    })
  );

  ws.on("message", async (data) => {
    try {
      const message = parseMessage(data);
      if (!message) {
        logger.warn(`Invalid message received from ${sessionId}`);
        return;
      }

      if (message.type === MESSAGE_TYPES.CHAT) {
        const chatMessage = message as ChatMessage;
        logger.info(
          `Chat message from ${chatMessage.payload.userId} in room ${chatMessage.payload.roomId}`
        );

        // Save chat message to database
        try {
          await db.query(
            "INSERT INTO chat_messages (user_id, room_id, message, timestamp) VALUES ($1, $2, $3, $4)",
            [
              chatMessage.payload.userId,
              chatMessage.payload.roomId,
              chatMessage.payload.message,
              new Date(chatMessage.timestamp),
            ]
          );
          logger.info("Chat message saved to database");
        } catch (dbError) {
          logger.error("Failed to save chat message to database:", dbError);
        }

        // Broadcast to all connections in the same room
        connections.forEach((connection, connSessionId) => {
          if (connection.readyState === 1) {
            // WebSocket.OPEN
            connection.send(JSON.stringify(chatMessage));
          }
        });
      }
    } catch (error) {
      logger.error(`Error processing message from ${sessionId}:`, error);
    }
  });

  ws.on("close", () => {
    connections.delete(sessionId);
    logger.info(`Chat connection closed: ${sessionId}`);
  });

  ws.on("error", (error) => {
    logger.error(`WebSocket error for ${sessionId}:`, error);
    connections.delete(sessionId);
  });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // Stop all cron jobs
  cronService.shutdown();

  wss.close();
  server.close(async () => {
    await db.close();
    logger.info("Server closed");
    process.exit(0);
  });
});
