import express from "express";
import dotenv from "dotenv";
import { createLogger } from "@ws-ingestor/util";
import { createCronService } from "./services/cronService";
import { createDatabaseService } from "./services/databaseService";
import { getDatabaseConfigs, validateDatabaseConfigs } from "./config/database";
import { getAllCronJobs } from "./jobs";
import { createRoutes } from "./routes";
import { RedisService } from "./services/redisService";

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
const redisService = new RedisService();
const cronService = createCronService();

// Setup routes
const routes = createRoutes(dbService);
app.use(routes);

// Create HTTP server
app.listen(port, () => {
  logger.info(`Chat ingestor server running on port ${port}`);
});

// Initialize cron jobs
const cronJobs = getAllCronJobs(dbService, redisService);
cronJobs.forEach((job) => {
  cronService.addJob(job);
});

logger.info(`Initialized ${cronJobs.length} cron jobs`);
