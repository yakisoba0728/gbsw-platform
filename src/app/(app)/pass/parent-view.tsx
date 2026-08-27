import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import type { SessionUser } from "@/core/auth/session";
import { requiresConsent } from "@/core/authz/pass-type";
import { honorificName } from "@/core/authz/roles";
import { getMyChildPasses } from "@/modules/pass/request.service";
import { ConsentButton } from "./consent-button";
import { PassCard } from "./pass-card";

export async function ParentView({ actor }: { actor: SessionUser }) {
  const passes = await getMyChildPasses(actor);

  // 확인을 기다리는 것을 위로 올린다 — 학부모가 이 화면에 오는 이유가 그것이다.
  const waiting = passes.filter(
    (pass) =>
      pass.status === "REQUESTED" && requiresConsent(pass.type),
  );

  // 나머지는 id 집합으로 가른다. `!waiting.includes(pass)`는 건마다 대기 목록을
  // 다시 훑어 O(n²)이고, 참조 비교라 같은 행이라도 객체가 새로 만들어지면
  // (직렬화 한 번, map 한 번) 조용히 어긋나 같은 건이 두 목록에 다 뜬다.
  const waitingIds = new Set(waiting.map((pass) => pass.id));
  const rest = passes.filter((pass) => !waitingIds.has(pass.id));

  return (
    <div className="@container mx-auto max-w-3xl space-y-4">
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
        aside={<span className="text-xs text-mut">{rest.length}건</span>}
        flush
      >
        {rest.length === 0 ? (
          <EmptyState variant="inside">아직 기록이 없습니다.</EmptyState>
        ) : (
          <ul>
            {rest.map((pass) => (
              <PassCard key={pass.id} pass={pass}>
                <p className="text-caption text-mut">
                  {honorificName(pass.studentProfile.user.name, "STUDENT")}
                </p>
              </PassCard>
            ))}
          </ul>
        )}
      </SectionCard>

      <Note tone="warn">
        보호자 확인 뒤에도 선생님의 승인이 있어야 출입증이 나옵니다.
      </Note>
    </div>
  );
}
