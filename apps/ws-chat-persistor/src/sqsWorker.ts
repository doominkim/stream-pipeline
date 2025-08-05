import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import dotenv from "dotenv";

dotenv.config();

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const queueUrl = process.env.SQS_QUEUE_URL!;

export interface ChatMessageData {
  userId: string;
  roomId: string;
  message: string;
  timestamp: number;
}

export async function pollSqsAndProcessMessages() {
  while (true) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 10,
    });
    const response = await sqs.send(command);
    if (response.Messages) {
      for (const msg of response.Messages) {
        try {
          if (!msg.Body) continue;
          const chat: ChatMessageData = JSON.parse(msg.Body);
          // 실제 적재 로직 대신 로그 출력
          console.log("[SQS] 채팅 메시지 수신:", chat);
          // 메시지 삭제
          if (msg.ReceiptHandle) {
            await sqs.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: msg.ReceiptHandle,
              })
            );
          }
        } catch (err) {
          console.error("메시지 처리 오류:", err);
        }
      }
    }
  }
}
