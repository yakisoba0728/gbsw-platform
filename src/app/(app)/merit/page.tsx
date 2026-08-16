import type { Metadata } from "next";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { isMeritTrack, isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  getChildMerit,
  getMyMerit,
  listChildAwardYears,
  listMyAwardYears,
  listMyChildren,
} from "@/modules/merit/award.service";
import { AdminMeritView } from "./admin-view";
import { OwnMeritView } from "./own-view";

export const metadata: Metadata = { title: "상벌점" };

export default async function MeritPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year)
      ? Number(raw.year)
      : undefined;

  // 관리자와 그 외를 여기서 가른다. 서비스가 권한을 다시 검사하므로
  // 이 분기는 "무엇을 보여줄까"의 문제이지 접근 통제가 아니다.
  if (can(user, "merit:read:any")) {
    return <AdminMeritView actor={user} track={track} params={raw} />;
  }

  if (user.role === "PARENT") {
    const children = await listMyChildren(user);
    if (children.length === 0) {
      return <p className="text-sm text-mut">연결된 자녀가 없습니다.</p>;
    }
    // 자녀가 여럿이면 ?child= 로 고른다. 없으면 첫째.
    const childId =
      typeof raw.child === "string" &&
      children.some((c) => c.studentProfileId === raw.child)
        ? raw.child
        : children[0].studentProfileId;

    // getChildMerit이 연결을 다시 검사하므로 위의 children.some(...) 검사는
    // 편의일 뿐 접근 통제가 아니다 — 조작된 ?child=도 서비스에서 막힌다.
    // track=SCHOOL이고 연도를 명시하지 않으면 서비스가 내부적으로
    // getCurrentYear()를 거친다 — 학년도가 아예 없으면 여기서 던진다.
    let view: Awaited<ReturnType<typeof getChildMerit>> | null = null;
    try {
      view = await getChildMerit(user, childId, track, year);
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
    }
    if (!view) return <NoAcademicYearNotice />;

    // 학년도 선택지도 자녀 연결을 다시 검사한다 — 조회가 이미 성공한 뒤라 통과가
    // 보장되지만, 검사를 여기 두어야 이 호출부만 남기고 위를 옮겨도 안 뚫린다.
    const years = isYearScoped(track) ? await listChildAwardYears(user, childId) : [];

    return (
      <OwnMeritView
        title={`${children.find((c) => c.studentProfileId === childId)!.name} 상벌점`}
        view={view}
        years={years}
        // `children`이라는 prop 이름을 쓰지 않는다 — React가 JSX 자식으로 해석하는
        // 예약 이름이라, 자녀 목록을 그 이름으로 넘기면 렌더 트리가 망가진다.
        childOptions={children}
        selectedChild={childId}
        params={{ ...raw, child: childId }}
      />
    );
  }

  let view: Awaited<ReturnType<typeof getMyMerit>> | null = null;
  try {
    view = await getMyMerit(user, track, year);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
  }
  if (!view) return <NoAcademicYearNotice />;

  const years = isYearScoped(track) ? await listMyAwardYears(user) : [];

  return <OwnMeritView title="내 상벌점" view={view} years={years} params={raw} />;
}
