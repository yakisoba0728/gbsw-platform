import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { getMyPasses } from "@/modules/pass/request.service";
import { PassCard } from "./pass-card";
import { WithdrawButton } from "./withdraw-button";

type MyPass = Awaited<ReturnType<typeof getMyPasses>>["entries"][number];

/**
 * 지금 이 순간 문 앞에서 통하는 것. 승인만으로는 모자라 시작 시각도 지나야 한다 —
 * 내일 나가는 외박에 「지금 유효」가 붙으면 학생이 그걸 들고 정문에 선다.
 */
function isUsableNow(pass: MyPass, now: Date): boolean {
  return (
    pass.status === "APPROVED" &&
    pass.startAt.getTime() <= now.getTime() &&
    pass.endAt.getTime() > now.getTime()
  );
}

/**
 * 학생 화면은 목록 하나다. **QR을 여기에 띄우지 않는다** — 화면을 여는 순간
 * 코드가 뜨면 손에 든 채로 지나가는 눈에 그대로 보인다. 눌러야 뜬다.
 *
 * 누를 자리는 이제 목록이 아니라 머리글의 「학생증」 한 곳이다. QR이 출입증
 * 한 건이 아니라 사람에 붙게 되면서, 줄마다 따로 열 것이 없어졌다.
 */
export async function StudentView({
  actor,
  page,
  requested,
}: {
  actor: SessionUser;
  page: number;
  requested: boolean;
}) {
  const result = await getMyPasses(actor, page);
  const passes = result.entries;
  const now = new Date();

  return (
    <div className="@container mx-auto max-w-3xl space-y-4">
      {requested && (
        <Note tone="success" aria-live="polite">
          출입증을 신청했습니다. 현재 처리 단계는 아래 목록에서 확인할 수 있습니다.
        </Note>
      )}

      <SectionCard
        title="내 출입증"
        hint={`전체 ${result.total}건`}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/scan"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              스캔
            </Link>
            <Link
              href="/pass/qr"
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              학생증
            </Link>
            <Link href="/pass/new" className={buttonClass({ size: "sm" })}>
              신청
            </Link>
          </div>
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
                  {/* 「QR 보기」가 여기 있었다. QR이 출입증마다가 아니라 사람에
                      붙으면서 줄마다 열 것이 없어졌다 — 배지만 남는다. */}
                  {usable && <Badge tone="info">지금 유효</Badge>}
                  {withdrawable && <WithdrawButton passId={pass.id} />}
                </PassCard>
              );
            })}
          </ul>
        )}
        <Pagination
          label="내 출입증 내역 페이지"
          page={result.page}
          pageCount={result.pageCount}
          href={(next) => `/pass?page=${next}`}
        />
      </SectionCard>
    </div>
  );
}
