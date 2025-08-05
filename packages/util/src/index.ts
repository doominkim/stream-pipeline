import winston from "winston";

// Logger configuration
export const createLogger = (serviceName: string) => {
  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.File({ filename: "error.log", level: "error" }),
      new winston.transports.File({ filename: "combined.log" }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });
};

// 아래 함수들은 WebSocketMessage 타입 의존성 때문에 주석 처리 또는 제거
// Message validation
// export const validateMessage = (message: any): message is WebSocketMessage => {
//   return (
//     typeof message === "object" &&
//     message !== null &&
//     typeof message.type === "string" &&
//     message.payload !== undefined &&
//     typeof message.timestamp === "number"
//   );
// };

// Generate session ID
export const generateSessionId = (): string => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Parse message from WebSocket
// export const parseMessage = (data: any): WebSocketMessage | null => {
//   try {
//     const message = typeof data === "string" ? JSON.parse(data) : data;
//     return validateMessage(message) ? message : null;
//   } catch (error) {
//     return null;
//   }
// };

// Health check utility
export const createHealthCheck = (serviceName: string) => {
  return {
    status: "healthy",
    service: serviceName,
    timestamp: Date.now(),
    uptime: process.uptime(),
  };
};

// Database utilities
export * from "./database";
export * from "./sqs";
