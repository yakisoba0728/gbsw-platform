import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_TRACK_TITLES,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { honorificName } from "@/core/authz/roles";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import {
  getChildMerit,
  getMyMerit,
  listChildAwardYears,
  listMyAwardYears,
  listMyChildren,
  type StudentMeritView,
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
    // 자녀 목록은 쿼리와 무관한 크롬이다 — 학년도·트랙을 바꿔도 그대로라 여기서 기다린다.
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
    return (
      <OwnMeritView
        title={`${honorificName(
          children.find((c) => c.studentProfileId === childId)!.name,
          "STUDENT",
        )} ${MERIT_TRACK_TITLES[track]}`}
        track={track}
        // 조회는 시작만 하고 약속을 넘긴다. 여기서 기다리면 제목·탭·자녀 고르기까지
        // 함께 멈춰, 탭을 누른 사람이 자기가 무엇을 눌렀는지 잃는다.
        viewPromise={meritOrNoYear(() => getChildMerit(user, childId, track, year))}
        // 학년도 선택지도 자녀 연결을 다시 검사한다 — 위를 옮겨도 안 뚫리게.
        yearsPromise={isYearScoped(track) ? listChildAwardYears(user, childId) : null}
        // prop 이름이 `children`이면 React가 JSX 자식으로 해석해 렌더 트리가 망가진다.
        childOptions={children}
        selectedChild={childId}
        params={{ ...raw, child: childId }}
      />
    );
  }

  return (
    <OwnMeritView
      title={`내 ${MERIT_TRACK_TITLES[track]}`}
      track={track}
      viewPromise={meritOrNoYear(() => getMyMerit(user, track, year))}
      yearsPromise={isYearScoped(track) ? listMyAwardYears(user) : null}
      params={raw}
    />
  );
}

/**
 * 현재 학년도가 없으면 서비스가 던진다. 경계 밖으로 새면 error.tsx가 화면 전체를
 * 오류로 덮으므로 여기서 받아 null로 바꾼다 — 안내는 OwnMeritView가 결과 자리에 낸다.
 * 조회를 함수로 받는다: 약속이 만들어지는 자리에서 곧바로 catch가 붙어야, 아무도
 * 아직 기다리지 않는 사이에 거부가 새지 않는다.
 */
async function meritOrNoYear(
  load: () => Promise<StudentMeritView>,
): Promise<StudentMeritView | null> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    return null;
  }
}
