import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";

export interface ChatMessageData {
  type: string;
  cid: string;
  ctime: number;
  msg: string;
  uid: string;
  profile: {
    userIdHash: string;
    nickname: string;
    profileImageUrl: string;
    userRoleCode: string;
    badge: any;
    title: any;
    verifiedMark: boolean;
    activityBadges: any[];
    streamingProperty: any;
    viewerBadges: any[];
  };
  extras: {
    osType: string;
    chatType: string;
    streamingChannelId: string;
    emojis: any;
    extraToken: string;
  };
}

export class SqsChatClient {
  private sqs: SQSClient;
  private queueUrl: string;

  constructor(queueUrl: string, region: string) {
    this.sqs = new SQSClient({ region });
    this.queueUrl = queueUrl;
  }

  async sendChat(chat: ChatMessageData) {
    const groupId = chat.extras?.streamingChannelId;
    const dedupId =
      chat.ctime && chat.uid ? `${chat.ctime}_${chat.uid}` : undefined;
    if (!groupId || !dedupId) {
      console.error(
        "[SqsChatClient] MessageGroupId 또는 MessageDeduplicationId가 없습니다.",
        { groupId, dedupId, chat }
      );
      return;
    }
    const params = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(chat),
      MessageGroupId: groupId,
      MessageDeduplicationId: dedupId,
    };
    await this.sqs.send(new SendMessageCommand(params));
  }

  async receiveMessages(maxNumberOfMessages = 10, waitTimeSeconds = 10) {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.queueUrl,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
    });
    return this.sqs.send(command);
  }

  async deleteMessage(receiptHandle: string) {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );
  }
}
