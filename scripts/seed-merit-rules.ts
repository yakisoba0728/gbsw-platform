/**
 * 상벌점 규정 초기 투입 (`npm run seed:merit`). **can()도 recordAudit도 거치지
 * 않는다** — 행위자가 없는 설치 작업이다. 다른 코드가 따라 하면 안 된다.
 */
import { existsSync } from "node:fs";
// 경로는 상대경로다 — tsx는 Next 밖에서 돌아 tsconfig의 paths를 못 쓸 수 있다.
import { MERIT_KIND_LABELS, MERIT_TRACK_LABELS } from "../src/core/authz/merit-track";
import { MERIT_RULE_SEED } from "../prisma/seed/merit-rules.data";

async function main() {
  // db/client는 임포트 시점에 DATABASE_URL을 읽는다. .env를 먼저 읽어야 해서
  // 정적 import가 아니라 동적 import를 쓴다.
  //
  // 컨테이너에는 .env가 없고 compose가 환경변수를 직접 주입한다 — 없으면
  // 건너뛴다(prisma.config.ts와 같은 판단). 무조건 읽으면 배포 서버에서
  // 이 스크립트가 ENOENT로 죽는다.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const { prisma } = await import("../src/core/db/client");

  try {
    const existing = await prisma.meritRule.count();
    if (existing > 0) {
      console.log(
        `이미 규정 ${existing}개가 있습니다.\n` +
          `처음부터 다시 넣으려면 규정을 먼저 비운 뒤 실행하세요.`,
      );
      return;
    }

    await prisma.meritRule.createMany({ data: MERIT_RULE_SEED });

    // 라벨은 Record<MeritKind, …>라 종류가 늘면 타입 검사에서 먼저 깨진다.
    const bySection = new Map<string, number>();
    for (const rule of MERIT_RULE_SEED) {
      const key = `${MERIT_TRACK_LABELS[rule.track]} ${MERIT_KIND_LABELS[rule.kind]}`;
      bySection.set(key, (bySection.get(key) ?? 0) + 1);
    }

    console.log(`규정 ${MERIT_RULE_SEED.length}개를 넣었습니다.`);
    for (const [section, count] of bySection) {
      console.log(`  ${section} ${count}개`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
