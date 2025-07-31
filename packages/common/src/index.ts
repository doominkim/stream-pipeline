// Common types and interfaces
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
  sessionId?: string;
}

export interface ChatMessage extends WebSocketMessage {
  type: "chat";
  payload: {
    message: string;
    userId: string;
    roomId: string;
  };
}

export interface AudioMessage extends WebSocketMessage {
  type: "audio";
  payload: {
    audioData: Buffer;
    userId: string;
    roomId: string;
    format: string;
  };
}

export interface ConnectionInfo {
  sessionId: string;
  userId?: string;
  roomId?: string;
  connectedAt: number;
}

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
