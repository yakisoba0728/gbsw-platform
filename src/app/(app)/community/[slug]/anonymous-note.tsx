import { Note } from "@/components/ui/note";

export function AnonymousNote({
  kind,
  className,
}: {
  kind: "글" | "댓글";
  className?: string;
}) {
  return (
    <Note tone="warn" className={className}>
      이 게시판의 {kind}은 작성자가 화면에 보이지 않습니다. 다만 학교는 감사 기록으로
      작성자를 확인할 수 있습니다.
    </Note>
  );
}
