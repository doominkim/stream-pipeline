import { pollSqsAndProcessMessages } from "./sqsWorker";

async function main() {
  console.log("[ws-chat-persistor] SQS 워커 시작");
  await pollSqsAndProcessMessages();
}

main().catch((err) => {
  console.error("[ws-chat-persistor] 치명적 오류:", err);
  process.exit(1);
});
