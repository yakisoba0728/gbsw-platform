import { Segmented, SegmentLink } from "@/components/ui/segmented";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";

/**
 * 교내 · 기숙사 탭. 주소를 만드는 규칙만 호출부가 준다 — 화면마다 보존할 쿼리가
 * 다르고, 그 판단은 화면의 것이다.
 *
 * **필터 칩이 아니라 세그먼티드 컨트롤이다.** 둘 중 하나는 늘 켜져 있고 끌 수
 * 없다 — 목록을 좁히는 것이 아니라 다른 장부를 보는 일이라, 끌 수 있는 칩과
 * 같은 모양이면 「둘 다 끄면 전체」로 읽힌다.
 */
export function TrackTabs({
  current,
  hrefFor,
}: {
  current: MeritTrack;
  hrefFor: (track: MeritTrack) => string;
}) {
  return (
    <Segmented role="navigation" aria-label="상벌점 구분">
      {MERIT_TRACKS.map((track) => (
        <SegmentLink
          key={track}
          href={hrefFor(track)}
          active={track === current}
        >
          {MERIT_TRACK_LABELS[track]}
        </SegmentLink>
      ))}
    </Segmented>
  );
}
