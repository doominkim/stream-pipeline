import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";

export interface ChatMessageData {
  type: string;
  cid?: string;
  ctime: number;
  msg?: string;
  uid?: string;
  profile?: any;
  extras: {
    streamingChannelId?: string;
    [key: string]: any;
  };
  [key: string]: any;
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
    let dedupId: string | undefined;
    if (chat.ctime && chat.uid) {
      dedupId = `${chat.ctime}_${chat.uid}`;
    } else if (chat.ctime && chat.cid) {
      dedupId = `${chat.ctime}_${chat.cid}`;
    } else if (chat.ctime && chat.type) {
      dedupId = `${chat.ctime}_${chat.type}`;
    } else {
      dedupId = randomUUID();
    }

    if (!groupId) {
      console.error("[SqsChatClient] MessageGroupId가 없습니다.", {
        groupId,
        chat,
      });
      return;
    }
    if (!dedupId) {
      console.error("[SqsChatClient] MessageDeduplicationId가 없습니다.", {
        dedupId,
        chat,
      });
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
