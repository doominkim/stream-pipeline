import { WebSocketServer } from "ws";
import express from "express";
import dotenv from "dotenv";
import { createLogger } from "@ws-ingestor/util";
import { createCronService } from "./services/cronService";
import { createDatabaseService } from "./services/databaseService";
import { createChatService } from "./services/chatService";
import { createChannelService } from "./services/channelService";
import { getDatabaseConfigs, validateDatabaseConfigs } from "./config/database";
import { getAllCronJobs } from "./jobs";
import { createRoutes } from "./routes";

// Load environment variables
dotenv.config();

const logger = createLogger("chat-ingestor");
const app = express();
const port = process.env.PORT || 3001;

// Database configuration
const dbConfigs = getDatabaseConfigs();
validateDatabaseConfigs(dbConfigs);

// Initialize services
const dbService = createDatabaseService(dbConfigs);
const chatService = createChatService(dbService);
const channelService = createChannelService(dbService);
const cronService = createCronService();

// Setup routes
const routes = createRoutes(dbService, chatService, channelService);
app.use(routes);

// Create HTTP server
app.listen(port, () => {
  logger.info(`Chat ingestor server running on port ${port}`);
});

// Initialize cron jobs
const cronJobs = getAllCronJobs(dbService);
cronJobs.forEach((job) => {
  cronService.addJob(job);
});

logger.info(`Initialized ${cronJobs.length} cron jobs`);
