import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const compose = readFileSync("docker-compose.yml", "utf8");
const deployGuide = readFileSync("docs/deploy.md", "utf8");

describe("배포용 데이터베이스 비밀번호 안내", () => {
  it("URL-safe 생성 명령을 안내하고 Compose의 두 접속 문자열에 위험을 적는다", () => {
    expect(envExample).toContain("바꿔라: openssl rand -hex 24");
    expect(deployGuide).toMatch(
      /openssl rand -hex 24\s+# POSTGRES_PASSWORD 에 넣는다/,
    );
    expect(
      compose.match(/POSTGRES_PASSWORD에 `\/`를 쓰면 접속 문자열이 깨진다/g),
    ).toHaveLength(2);
  });
});
