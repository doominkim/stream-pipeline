import Redis, { Redis as RedisClient, RedisOptions } from "ioredis";

export class RedisService {
  private client: RedisClient;

  constructor(options?: RedisOptions) {
    // 기본 옵션 제공
    const defaultOptions: RedisOptions = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      db: 0,
      connectTimeout: 10000, // 10초 연결 타임아웃
      commandTimeout: 5000, // 5초 명령 타임아웃
      lazyConnect: true, // 지연 연결
      maxRetriesPerRequest: 3,
      // TLS 옵션 추가
      tls:
        process.env.REDIS_TLS === "true"
          ? {
              rejectUnauthorized: false, // 자체 서명된 인증서 허용
              servername: process.env.REDIS_HOST || "localhost",
            }
          : undefined,
    };

    // options가 있으면 기본값과 병합
    const finalOptions = options
      ? { ...defaultOptions, ...options }
      : defaultOptions;

    console.log("Redis connection options:", finalOptions);

    this.client = new Redis(finalOptions);

    this.client.on("connect", () => {
      console.log("Redis connected successfully");
    });

    this.client.on("ready", () => {
      console.log("Redis ready to accept commands");
    });

    this.client.on("error", (err) => {
      console.error("Redis error:", err);
    });

    this.client.on("close", () => {
      console.log("Redis connection closed");
    });

    this.client.on("reconnecting", () => {
      console.log("Redis reconnecting...");
    });
  }

  getClient(): RedisClient {
    return this.client;
  }

  async ping(): Promise<string> {
    try {
      console.log("Attempting Redis PING...");
      const result = await this.client.ping();
      console.log("Redis PING successful:", result);
      return result;
    } catch (error) {
      console.error("Redis PING failed:", error);
      throw error;
    }
  }

  // 필요한 경우, 여기에 커스텀 메서드 추가 (ex. set, get, lock 등)
}

// 싱글턴 인스턴스 (일반적으로 이렇게 사용)
const redisService = new RedisService({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
  tls:
    process.env.REDIS_TLS === "true"
      ? {
          rejectUnauthorized: false,
          servername: process.env.REDIS_HOST || "localhost",
        }
      : undefined,
});

export default redisService;
