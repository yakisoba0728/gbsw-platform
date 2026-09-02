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

function isUsableNow(pass: MyPass, now: Date): boolean {
  return (
    pass.status === "APPROVED" &&
    pass.startAt.getTime() <= now.getTime() &&
    pass.endAt.getTime() > now.getTime()
  );
}

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
              const usable = isUsableNow(pass, now);
              const withdrawable =
                pass.status === "REQUESTED" || pass.status === "CONSENTED";

              return (
                <PassCard key={pass.id} pass={pass}>
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
