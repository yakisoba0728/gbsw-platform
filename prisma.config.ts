import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma CLI는 .env를 자동으로 읽지 않는다.
// dotenv 의존성 대신 Node 20.12+ 내장 process.loadEnvFile()을 쓴다.
// Docker에서는 .env가 없고 compose가 환경변수를 주입하므로 그냥 건너뛴다.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // 시드는 두지 않는다. 최초 관리자는 서버 부팅 시 발급되는 토큰으로
    // /register?token= 화면에서 만든다 (src/modules/bootstrap).
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
