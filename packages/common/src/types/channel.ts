export interface Channel {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  uuid: string;
  channelName: string;
  channelImageUrl?: string;
  channelDescription?: string;
  openLive: boolean;
  follower?: number;
  isChatCollected: boolean;
  isAudioCollected: boolean;
  isCaptureCollected: boolean;
  isEnabledAi: boolean;
}

export interface CreateChannelDto {
  uuid: string;
  channelName: string;
  channelImageUrl?: string;
  channelDescription?: string;
  openLive?: boolean;
  follower?: number;
  isChatCollected?: boolean;
  isAudioCollected?: boolean;
  isCaptureCollected?: boolean;
  isEnabledAi?: boolean;
}

export interface UpdateChannelDto {
  channelName?: string;
  channelImageUrl?: string;
  channelDescription?: string;
  openLive?: boolean;
  follower?: number;
  isChatCollected?: boolean;
  isAudioCollected?: boolean;
  isCaptureCollected?: boolean;
  isEnabledAi?: boolean;
}
