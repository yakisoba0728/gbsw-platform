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

  if (can(user, "merit:read:any")) {
    return <AdminMeritView actor={user} track={track} params={raw} />;
  }

  if (user.role === "PARENT") {
    const children = await listMyChildren(user);
    if (children.length === 0) {
      return <EmptyState>연결된 자녀가 없습니다.</EmptyState>;
    }
    const childId =
      typeof raw.child === "string" &&
      children.some((c) => c.studentProfileId === raw.child)
        ? raw.child
        : children[0].studentProfileId;

    return (
      <OwnMeritView
        title={`${honorificName(
          children.find((c) => c.studentProfileId === childId)!.name,
          "STUDENT",
        )} ${MERIT_TRACK_TITLES[track]}`}
        track={track}
        viewPromise={meritOrNoYear(() => getChildMerit(user, childId, track, year))}
        yearsPromise={isYearScoped(track) ? listChildAwardYears(user, childId) : null}
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
