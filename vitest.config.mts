import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig의 @/* 별칭을 Vite가 직접 해석한다 (vite-tsconfig-paths 불필요).
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 실제 접속은 하지 않는다. core/db/client가 임포트 시점에 던지지 않게만 해준다.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
