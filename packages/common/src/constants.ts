// Common constants
export const MESSAGE_TYPES = {
  CHAT: "chat",
  AUDIO: "audio",
  HEARTBEAT: "heartbeat",
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
} as const;

export const DEFAULT_PORTS = {
  CHAT_INGESTOR: 3001,
  AUDIO_INGESTOR: 3002,
} as const;
