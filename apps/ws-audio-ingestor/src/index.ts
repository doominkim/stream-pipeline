import { WebSocketServer } from "ws";
import express from "express";
import {
  createLogger,
  generateSessionId,
  parseMessage,
  createHealthCheck,
} from "@ws-ingestor/util";
import {
  AudioMessage,
  MESSAGE_TYPES,
  DEFAULT_PORTS,
} from "@ws-ingestor/common";

const logger = createLogger("audio-ingestor");
const app = express();
const port = process.env.PORT || DEFAULT_PORTS.AUDIO_INGESTOR;

// Health check endpoint
app.get("/health", (req, res) => {
  res.json(createHealthCheck("audio-ingestor"));
});

// Create HTTP server
const server = app.listen(port, () => {
  logger.info(`Audio ingestor server running on port ${port}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const connections = new Map<string, any>();

wss.on("connection", (ws, req) => {
  const sessionId = generateSessionId();
  connections.set(sessionId, ws);

  logger.info(`New audio connection established: ${sessionId}`);

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

      if (message.type === MESSAGE_TYPES.AUDIO) {
        const audioMessage = message as AudioMessage;
        logger.info(
          `Audio message from ${audioMessage.payload.userId} in room ${audioMessage.payload.roomId}, format: ${audioMessage.payload.format}`
        );

        // Broadcast to all connections in the same room
        connections.forEach((connection, connSessionId) => {
          if (connection.readyState === 1) {
            // WebSocket.OPEN
            connection.send(JSON.stringify(audioMessage));
          }
        });
      }
    } catch (error) {
      logger.error(`Error processing message from ${sessionId}:`, error);
    }
  });

  ws.on("close", () => {
    connections.delete(sessionId);
    logger.info(`Audio connection closed: ${sessionId}`);
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
