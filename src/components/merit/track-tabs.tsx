import { ChipLink } from "@/components/ui/chip-link";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";

/**
 * 교내 · 기숙사 탭. 화면 여섯 곳이 `MERIT_TRACKS.map` 골격까지 통째로 같았다.
 *
 * 주소를 만드는 규칙만 호출부가 준다 — 여섯 곳이 보존할 쿼리를 저마다 다르게
 * 정하기 때문이다. 예컨대 학생 상세는 학년도를 지키지만 기숙사로 넘어갈 땐
 * 버리고(누적이라 의미가 없다), 규정 관리는 트랙을 바꾸면 검색어까지 버린다
 * (규정 목록이 트랙별로 아예 달라서 0건이 빈 화면처럼 읽힌다). 그 판단은
 * 화면의 것이라 여기로 가져오지 않는다.
 *
 * 트랙이 늘어나면(`MERIT_TRACKS`에 추가) 여섯 화면이 함께 따라온다.
 */
export function TrackTabs({
  current,
  hrefFor,
}: {
  current: MeritTrack;
  hrefFor: (track: MeritTrack) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      {MERIT_TRACKS.map((track) => (
        <ChipLink key={track} href={hrefFor(track)} active={track === current}>
          {MERIT_TRACK_LABELS[track]}
        </ChipLink>
      ))}
    </div>
  );
}
