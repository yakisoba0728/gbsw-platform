import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { Pagination } from "@/components/ui/pagination";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { honorificName } from "@/core/authz/roles";
import {
  getMyChildPasses,
  getMyChildPassesAwaitingConsent,
} from "@/modules/pass/request.service";
import { ConsentButton } from "./consent-button";
import { PassCard } from "./pass-card";

export async function ParentView({
  actor,
  page,
  consented,
}: {
  actor: SessionUser;
  page: number;
  consented: boolean;
}) {
  const now = new Date();
  const [waiting, history] = await Promise.all([
    getMyChildPassesAwaitingConsent(actor, now),
    getMyChildPasses(actor, page, now),
  ]);

  return (
    <div className="@container mx-auto max-w-3xl space-y-4">
      {consented && (
        <Note tone="success" role="status">
          보호자 확인을 완료했습니다. 이제 교사 승인을 기다립니다.
        </Note>
      )}

      <SectionCard
        title="확인이 필요한 신청"
        // 판독은 메뉴에서 빠졌다 — 세 역할 모두 출입증 화면에서 들어간다.
        aside={
          <Link
            href="/scan"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            스캔
          </Link>
        }
        flush
      >
        {waiting.length === 0 ? (
          <EmptyState variant="inside">확인을 기다리는 신청이 없습니다.</EmptyState>
        ) : (
          <ul>
            {waiting.map((pass) => (
              <PassCard key={pass.id} pass={pass}>
                <div className="w-full">
                  <p className="text-caption text-mut">
                    {honorificName(pass.studentProfile.user.name, "STUDENT")}
                  </p>
                  <ConsentButton passId={pass.id} />
                </div>
              </PassCard>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="자녀 출입증 내역"
        aside={<span className="text-xs text-mut">전체 {history.total}건</span>}
        flush
      >
        {history.entries.length === 0 ? (
          <EmptyState variant="inside">아직 기록이 없습니다.</EmptyState>
        ) : (
          <ul>
            {history.entries.map((pass) => (
              <PassCard key={pass.id} pass={pass}>
                <p className="text-caption text-mut">
                  {honorificName(pass.studentProfile.user.name, "STUDENT")}
                </p>
              </PassCard>
            ))}
          </ul>
        )}
        <Pagination
          label="자녀 출입증 내역 페이지"
          page={history.page}
          pageCount={history.pageCount}
          href={(next) => `/pass?page=${next}`}
        />
      </SectionCard>

      <Note tone="warn">
        보호자 확인 뒤에도 선생님의 승인이 있어야 출입증이 나옵니다.
      </Note>
    </div>
  );
}
