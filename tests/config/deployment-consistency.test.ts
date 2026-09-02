import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("docker-compose.yml", "utf8");
const deployGuide = readFileSync("docs/deploy.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("배포 안내와 실제 설정의 일치", () => {
  it("메모리 부족을 일으킨 일괄 이미지 빌드를 명령으로 안내하지 않는다", () => {
    const forbiddenCommand = /^docker compose up -d --build.*$/gm;

    expect(deployGuide.match(forbiddenCommand) ?? []).toEqual([]);
    expect(readme.match(forbiddenCommand) ?? []).toEqual([]);
  });

  it("온서버 빌드 요구량과 앱 메모리 제한을 실제 운영값으로 안내한다", () => {
    const appMemoryLimit = compose.match(
      /\n  app:\n[\s\S]*?\n    mem_limit:\s*([^\s#]+)/,
    )?.[1];

    expect(appMemoryLimit).toBe("1g");
    expect(deployGuide).toMatch(/\| 서버 \|[^\n]*온서버 빌드[^\n]*8GB/);
    expect(deployGuide).toContain(`앱 컨테이너는 \`mem_limit: ${appMemoryLimit}\`이다.`);
  });

  it("복구 검증 쿼리는 Prisma가 매핑한 실제 사용자 테이블을 조회한다", () => {
    const userModel = schema.match(/model User \{([\s\S]*?)\n\}/)?.[1];
    const userTable = userModel?.match(/@@map\("([^"]+)"\)/)?.[1];

    expect(userTable).toBe("user");
    expect(deployGuide).toContain(`select count(*) from "${userTable}";`);
  });
});

describe("README 테스트 설명", () => {
  it("매번 낡는 수동 테스트 개수 대신 검증 계층을 안내한다", () => {
    const testSummary = readme.match(/^\| \*\*테스트\*\* \|(.+)\|$/m)?.[1] ?? "";

    expect(testSummary).toContain("단위");
    expect(testSummary).toContain("실 DB 통합");
    expect(testSummary).toContain("브라우저 E2E");
    expect(testSummary).not.toMatch(/\d[\d,]*(?:개|파일)/);
  });
});

describe("CI Docker runner 검증", () => {
  it("빌드한 이미지를 실제로 기동해 데이터베이스 health 본문까지 확인한다", () => {
    const smokeStep = ciWorkflow.match(
      /- name: Run Docker runner smoke([\s\S]*?)(?=\n      - name:|$)/,
    )?.[1];

    expect(smokeStep).toBeDefined();
    expect(smokeStep).toContain("docker run --detach");
    expect(smokeStep).toContain("--network host");
    expect(smokeStep).toContain("--env DATABASE_URL");
    expect(smokeStep).toContain("/api/health");
    expect(smokeStep).toContain('payload.ok !== true || payload.db !== "up"');
  });
});
