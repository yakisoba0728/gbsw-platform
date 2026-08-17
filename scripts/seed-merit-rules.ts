/**
 * 상벌점 규정 초기 투입.
 *
 *   npm run seed:merit
 *
 * **이 스크립트는 can()도 recordAudit도 거치지 않는다.** 행위자가 없는 설치
 * 시점의 작업이고(마이그레이션이 학년도 2026을 심는 것과 같은 자리),
 * 무엇이 들어갔는지는 `prisma/seed/merit-rules.data.ts`가 git에 남아 감사 역할을
 * 대신한다. **다른 코드가 이 예외를 따라 하면 안 된다** — 화면에서 오는 모든
 * 쓰기는 서비스를 거쳐야 한다.
 *
 * 규정이 하나라도 있으면 아무것도 하지 않는다. 항목명으로 대조해 골라 넣지
 * 않는 이유: 관리자가 화면에서 항목명을 고칠 수 있어서, 이름을 키로 삼으면
 * 고친 뒤 다시 돌릴 때 예전 이름의 규정이 되살아난다.
 */
// 라벨은 화면과 같은 곳에서 가져온다. 이 모듈은 임포트 시점에 아무것도 읽지
// 않으므로(환경변수·DB 없음) 아래 db/client와 달리 정적 import로 안전하다.
// 경로는 `@/`가 아니라 상대경로다 — 다른 스크립트들과 같다. tsx는 Next 밖에서
// 돌아 tsconfig의 paths를 쓸 수 있다는 보장이 없다.
import { MERIT_KIND_LABELS, MERIT_TRACK_LABELS } from "../src/core/authz/merit-track";
import { MERIT_RULE_SEED } from "../prisma/seed/merit-rules.data";

async function main() {
  // core/db/client는 임포트 시점에 DATABASE_URL을 읽고 없으면 던진다. Next나
  // prisma CLI 밖에서 도는 스크립트라 .env를 직접 읽어야 하며, 그래서 정적
  // import가 아니라 이 시점의 동적 import를 쓴다 (정적이면 위로 끌어올려진다).
  process.loadEnvFile(".env");
  const { prisma } = await import("../src/core/db/client");

  try {
    const existing = await prisma.meritRule.count();
    if (existing > 0) {
      console.log(
        `이미 규정 ${existing}개가 있습니다. 아무것도 하지 않았습니다.\n` +
          `처음부터 다시 넣으려면 규정을 먼저 비운 뒤 실행하세요.`,
      );
      return;
    }

    await prisma.meritRule.createMany({ data: MERIT_RULE_SEED });

    /*
     * 요약은 **세 종류를 각각 센다.** 예전엔 `kind === "MERIT" ? "상점" : "벌점"`
     * 이라 상쇄점 1건이 벌점으로 집계됐다 — DB에 들어간 값은 정확했고 출력 문구만
     * 틀려서, 원본 표(교내 벌점 54)와 대조하는 사람만 55라는 숫자에 걸려 넘어졌다.
     *
     * 라벨은 core/authz/merit-track에서 가져온다. `Record<MeritKind, …>`인
     * MERIT_KIND_LABELS를 쓰므로 종류가 하나 늘면 그쪽이 타입 검사에서 먼저
     * 깨진다 — 이 스크립트가 조용히 한 종류를 빠뜨리는 일이 생기지 않는다
     * (merit-track의 KIND_BUCKETS와 같은 수법이다).
     */
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
