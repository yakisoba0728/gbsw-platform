import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  isPassStatus,
  isPassType,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import {
  consenterRole,
  passEndLabel,
  passPeriod,
  PASS_STATUS_TONES,
  passStatusLabel,
} from "@/modules/pass/pass.labels";
import type { PassWithStudent } from "@/modules/pass/pass.repo";
import { honorificName } from "@/core/authz/roles";

// 화면 셋이 이 파일에서 가져다 쓰던 것이라 그대로 다시 내보낸다. 규칙 자체는
// pass.labels가 소유한다 — (app) 밖의 판독 화면도 같은 눈금을 써야 해서다.
export { passEndLabel, passPeriod };

/** 세 역할 화면이 함께 쓰는 한 장. 손대는 버튼은 호출부가 children으로 넣는다. */
export function PassCard({
  pass,
  children,
}: {
  pass: PassWithStudent;
  children?: React.ReactNode;
}) {
  const type = isPassType(pass.type) ? PASS_TYPE_LABELS[pass.type] : pass.type;
  const status = isPassStatus(pass.status) ? pass.status : null;
  const statusLabel = passStatusLabel(pass);
  const student = honorificName(pass.studentProfile.user.name, "STUDENT");
  const period = passPeriod(pass);

  return (
    // relative — 아래 링크가 이 줄 전체를 덮는다. 유형 글자에만 걸면 표적이
    // 20px밖에 안 돼 폰에서 눌리지 않는다(최소 36px).
    <li className="group relative border-b border-line px-5 py-4 last:border-b-0">
      {/*
        줄 전체를 덮는 링크. **children(버튼)보다 먼저 그린다** — 뒤에 그리면
        버튼 위를 덮어 취소·QR 보기가 안 눌린다. children 쪽에 z-10을 주어
        이 겹침 위로 올린다.

        글자가 아니라 빈 상자라 낭독기에 이름이 없다 — aria-label로 붙인다.
      */}
      <Link
        href={`/pass/${pass.id}`}
        aria-label={`${type} · ${period} · ${statusLabel} · ${student} 상세`}
        className="absolute inset-0 rounded-btn focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-ink">
            <span className="font-medium underline decoration-line-strong underline-offset-2 group-hover:decoration-ink">
              {type}
            </span>
            {status && (
              <Badge tone={PASS_STATUS_TONES[status]}>
                {statusLabel}
              </Badge>
            )}
          </p>
          <p className="mt-1 text-caption text-mut tabular-nums">
            {period}
          </p>
          <p className="mt-0.5 text-caption text-mut">
            {pass.destination}
            <span className="mx-1.5 text-mut2" aria-hidden>
              ·
            </span>
            {pass.reason}
          </p>
          {pass.decisionNote && (
            <p
              className={
                pass.status === "REJECTED"
                  ? "mt-1 text-xs text-rose"
                  : "mt-1 text-xs text-mut"
              }
            >
              {pass.status === "REJECTED" ? "반려 사유" : "승인 메모"}: {pass.decisionNote}
            </p>
          )}
          {pass.consentByProxy && pass.consentedByName && (
            <p className="mt-1 text-xs text-mut">
              보호자 확인 대행 · {honorificName(pass.consentedByName, consenterRole(pass))}
            </p>
          )}
        </div>
        {/* 겹침 링크 위로. 이게 없으면 버튼이 링크에 먹혀 안 눌린다. */}
        {children != null && <div className="relative z-10">{children}</div>}
      </div>
    </li>
  );
}
