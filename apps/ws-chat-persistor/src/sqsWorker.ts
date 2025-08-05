import { SqsChatClient, ChatMessageData } from "@ws-ingestor/util";
import dotenv from "dotenv";

dotenv.config();

const sqsClient = new SqsChatClient(
  process.env.SQS_QUEUE_URL!,
  process.env.AWS_REGION!
);

export async function pollSqsAndProcessMessages() {
  while (true) {
    const response = await sqsClient.receiveMessages();
    if (response.Messages) {
      for (const msg of response.Messages) {
        try {
          if (!msg.Body) continue;
          const chat: ChatMessageData = JSON.parse(msg.Body);
          // 실제 적재 로직 대신 로그 출력
          console.log("[SQS] 채팅 메시지 수신:", chat);
          // 메시지 삭제
          if (msg.ReceiptHandle) {
            await sqsClient.deleteMessage(msg.ReceiptHandle);
          }
        } catch (err) {
          console.error("메시지 처리 오류:", err);
        }
      }
    }
  }
}
