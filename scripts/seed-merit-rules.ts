import { existsSync } from "node:fs";
import { MERIT_KIND_LABELS, MERIT_TRACK_LABELS } from "../src/core/authz/merit-track";
import { MERIT_RULE_SEED } from "../prisma/seed/merit-rules.data";

async function main() {
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
