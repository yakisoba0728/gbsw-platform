import type { Metadata } from "next";
import { requireAuth } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { isMeritTrack, type MeritTrack } from "@/core/authz/merit-track";
import { AdminMeritView } from "./admin-view";

export const metadata: Metadata = { title: "상벌점" };

export default async function MeritPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAuth();
  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";

  // 관리자와 그 외를 여기서 가른다. 서비스가 권한을 다시 검사하므로
  // 이 분기는 "무엇을 보여줄까"의 문제이지 접근 통제가 아니다.
  if (can(user, "merit:read:any")) {
    return <AdminMeritView actor={user} track={track} params={raw} />;
  }

  // Task 7에서 학생·학부모 화면으로 채운다.
  return <p className="text-sm text-mut">준비 중입니다.</p>;
}
