import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";
import { ChatMessageData } from "@ws-ingestor/util";

let kinesis: KinesisClient | null = null;

function getKinesisClient(): KinesisClient {
  if (!kinesis) {
    const streamName = process.env.KINESIS_STREAM_NAME;
    const region = process.env.AWS_REGION;

    if (!streamName) {
      console.warn(
        "KINESIS_STREAM_NAME 환경변수가 설정되지 않았습니다. Kinesis 전송이 비활성화됩니다."
      );
      return null as any;
    }
    if (!region) {
      console.warn(
        "AWS_REGION 환경변수가 설정되지 않았습니다. Kinesis 전송이 비활성화됩니다."
      );
      return null as any;
    }

    kinesis = new KinesisClient({ region });
  }
  return kinesis;
}

export async function sendChatToKinesis(chat: ChatMessageData): Promise<void> {
  const streamName = process.env.KINESIS_STREAM_NAME;
  const kinesisClient = getKinesisClient();

  if (!streamName || !kinesisClient) {
    console.warn("Kinesis 설정이 완료되지 않아 전송을 건너뜁니다.");
    return;
  }

  const partitionKey =
    chat.extras?.streamingChannelId || chat.uid || `${Date.now()}`;
  const data = JSON.stringify(chat);
  const cmd = new PutRecordCommand({
    StreamName: streamName,
    PartitionKey: partitionKey,
    Data: Buffer.from(data),
  });
  try {
    const result = await kinesisClient.send(cmd);
    // console.log(result);
  } catch (e) {
    // 최소한의 에러 로깅
    console.error("Kinesis 전송 실패", e);
    throw e;
  }
}
