import { ChipLink } from "@/components/ui/chip-link";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";

/**
 * 교내 · 기숙사 탭. 주소를 만드는 규칙만 호출부가 준다 — 화면마다 보존할 쿼리가
 * 다르고, 그 판단은 화면의 것이다.
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
