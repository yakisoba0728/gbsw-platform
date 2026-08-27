import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { getMyPasses } from "@/modules/pass/request.service";
import { PassCard } from "./pass-card";
import { WithdrawButton } from "./withdraw-button";
import { pageClass } from "@/components/ui/page-shell";

type MyPass = Awaited<ReturnType<typeof getMyPasses>>[number];

/**
 * 지금 이 순간 문 앞에서 통하는 것. 승인만으로는 모자라 시작 시각도 지나야 한다 —
 * 내일 나가는 외박에 「지금 유효」가 붙으면 학생이 그걸 들고 정문에 선다.
 */
function isUsableNow(pass: MyPass, now: Date): boolean {
  return (
    pass.status === "APPROVED" &&
    pass.startAt.getTime() <= now.getTime() &&
    pass.endAt.getTime() >= now.getTime()
  );
}

/**
 * 학생 화면은 목록 하나다. **QR을 여기에 띄우지 않는다** — 화면을 여는 순간
 * 코드가 뜨면 손에 든 채로 지나가는 눈에 그대로 보이고, 여러 건을 들고 있을 때
 * 어느 것이 뜬 것인지 학생도 모른다. 고른 한 건의 QR은 `/pass/{id}`가 띄운다.
 */
export async function StudentView({ actor }: { actor: SessionUser }) {
  const passes = await getMyPasses(actor);
  const now = new Date();
  const hasUsable = passes.some((pass) => isUsableNow(pass, now));

  return (
    <div className={pageClass("page", "@container")}>
      <SectionCard
        title="내 출입증"
        // 목록에서 줄을 찾기 전에 카드 머리글이 먼저 답한다 — 정문 앞에서 묻는
        // 것은 「지금 쓸 것이 있나」 하나다.
        hint={
          hasUsable
            ? "지금 유효한 출입증이 있습니다."
            : "지금 유효한 출입증이 없습니다."
        }
        aside={
          <Link href="/pass/new" className={buttonClass({ size: "sm" })}>
            신청하기
          </Link>
        }
        flush
      >
        {passes.length === 0 ? (
          <EmptyState variant="inside">아직 신청한 출입증이 없습니다.</EmptyState>
        ) : (
          <ul>
            {passes.map((pass) => {
              // 둘은 함께 참이 될 수 없다 — 쓸 수 있는 것은 승인된 것뿐이고,
              // 물릴 수 있는 것은 아직 승인 전인 것뿐이다.
              const usable = isUsableNow(pass, now);
              const withdrawable =
                pass.status === "REQUESTED" || pass.status === "CONSENTED";

              return (
                <PassCard key={pass.id} pass={pass}>
                  {usable && (
                    <div className="flex items-center gap-2">
                      <Badge tone="info">지금 유효</Badge>
                      {/* 줄 전체가 아니라 이 버튼이 폰에서 누를 자리다 —
                          유형 이름에 걸린 링크는 표적이 글자만 하다. */}
                      <Link
                        href={`/pass/${pass.id}`}
                        className={buttonClass({
                          variant: "secondary",
                          size: "sm",
                        })}
                      >
                        QR 보기
                      </Link>
                    </div>
                  )}
                  {withdrawable && <WithdrawButton passId={pass.id} />}
                </PassCard>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
