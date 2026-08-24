import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_TRACK_TITLES,
  type MeritTrack,
} from "@/core/authz/merit-track";
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

  // 서비스가 권한을 다시 검사한다 — 이 분기는 접근 통제가 아니라 화면 선택이다.
  if (can(user, "merit:read:any")) {
    return <AdminMeritView actor={user} track={track} params={raw} />;
  }

  if (user.role === "PARENT") {
    const children = await listMyChildren(user);
    if (children.length === 0) {
      // 카드 밖(페이지 본문)에 바로 서는 자리라 자기 테두리를 그린다.
      return <EmptyState>연결된 자녀가 없습니다.</EmptyState>;
    }
    // 자녀가 여럿이면 ?child= 로 고른다. 없으면 첫째.
    const childId =
      typeof raw.child === "string" &&
      children.some((c) => c.studentProfileId === raw.child)
        ? raw.child
        : children[0].studentProfileId;

    // 위의 children.some 검사는 편의일 뿐이다 — 조작된 ?child=는 서비스가 막는다.
    let view: Awaited<ReturnType<typeof getChildMerit>> | null = null;
    try {
      view = await getChildMerit(user, childId, track, year);
    } catch (error) {
      if (!(error instanceof AcademicYearError)) throw error;
    }
    if (!view) return <NoAcademicYearNotice />;

    // 학년도 선택지도 자녀 연결을 다시 검사한다 — 위를 옮겨도 안 뚫리게.
    const years = isYearScoped(track) ? await listChildAwardYears(user, childId) : [];

    return (
      <OwnMeritView
        title={`${children.find((c) => c.studentProfileId === childId)!.name} ${MERIT_TRACK_TITLES[track]}`}
        view={view}
        years={years}
        // prop 이름이 `children`이면 React가 JSX 자식으로 해석해 렌더 트리가 망가진다.
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

  return <OwnMeritView
      title={`내 ${MERIT_TRACK_TITLES[track]}`}
      view={view}
      years={years}
      params={raw}
    />;
}
