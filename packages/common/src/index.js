"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PORTS = exports.MESSAGE_TYPES = void 0;
// Common constants
exports.MESSAGE_TYPES = {
    CHAT: "chat",
    AUDIO: "audio",
    HEARTBEAT: "heartbeat",
    JOIN_ROOM: "join_room",
    LEAVE_ROOM: "leave_room",
};
exports.DEFAULT_PORTS = {
    CHAT_INGESTOR: 3001,
    AUDIO_INGESTOR: 3002,
};
