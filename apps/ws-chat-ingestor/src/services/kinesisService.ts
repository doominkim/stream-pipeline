import { KinesisClient, PutRecordCommand } from "@aws-sdk/client-kinesis";
import { ChatMessageData } from "@ws-ingestor/util";

const streamName = process.env.KINESIS_STREAM_NAME;
const region = process.env.AWS_REGION;

if (!streamName) throw new Error("KINESIS_STREAM_NAME 환경변수 필요");
if (!region) throw new Error("AWS_REGION 환경변수 필요");

const kinesis = new KinesisClient({ region });

export async function sendChatToKinesis(chat: ChatMessageData): Promise<void> {
  const partitionKey =
    chat.extras?.streamingChannelId || chat.uid || `${Date.now()}`;
  const data = JSON.stringify(chat);
  const cmd = new PutRecordCommand({
    StreamName: streamName,
    PartitionKey: partitionKey,
    Data: Buffer.from(data),
  });
  try {
    const result = await kinesis.send(cmd);
    // console.log(result);
  } catch (e) {
    // 최소한의 에러 로깅
    console.error("Kinesis 전송 실패", e);
    throw e;
  }
}
