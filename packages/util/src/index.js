"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthCheck = exports.parseMessage = exports.generateSessionId = exports.validateMessage = exports.createLogger = void 0;
const winston_1 = __importDefault(require("winston"));
// Logger configuration
const createLogger = (serviceName) => {
    return winston_1.default.createLogger({
        level: "info",
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
        defaultMeta: { service: serviceName },
        transports: [
            new winston_1.default.transports.File({ filename: "error.log", level: "error" }),
            new winston_1.default.transports.File({ filename: "combined.log" }),
            new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple()),
            }),
        ],
    });
};
exports.createLogger = createLogger;
// Message validation
const validateMessage = (message) => {
    return (typeof message === "object" &&
        message !== null &&
        typeof message.type === "string" &&
        message.payload !== undefined &&
        typeof message.timestamp === "number");
};
exports.validateMessage = validateMessage;
// Generate session ID
const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};
exports.generateSessionId = generateSessionId;
// Parse message from WebSocket
const parseMessage = (data) => {
    try {
        const message = typeof data === "string" ? JSON.parse(data) : data;
        return (0, exports.validateMessage)(message) ? message : null;
    }
    catch (error) {
        return null;
    }
};
exports.parseMessage = parseMessage;
// Health check utility
const createHealthCheck = (serviceName) => {
    return {
        status: "healthy",
        service: serviceName,
        timestamp: Date.now(),
        uptime: process.uptime(),
    };
};
exports.createHealthCheck = createHealthCheck;
