import { WebSocketServer } from "ws";
import express from "express";
import {
  createLogger,
  generateSessionId,
  parseMessage,
  createHealthCheck,
} from "@ws-ingestor/util";
import { ChatMessage, MESSAGE_TYPES, DEFAULT_PORTS } from "@ws-ingestor/common";

const logger = createLogger("chat-ingestor");
const app = express();
const port = process.env.PORT || DEFAULT_PORTS.CHAT_INGESTOR;

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(createHealthCheck("chat-ingestor"));
});

// Create HTTP server
const server = app.listen(port, () => {
  logger.info(`Chat ingestor server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const connections = new Map<string, any>();

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

  ws.on("message", (data) => {
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
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  wss.close();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
