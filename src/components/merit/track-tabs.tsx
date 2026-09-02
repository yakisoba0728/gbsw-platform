import { Segmented, SegmentLink } from "@/components/ui/segmented";
import {
  MERIT_TRACK_LABELS,
  MERIT_TRACKS,
  type MeritTrack,
} from "@/core/authz/merit-track";

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
