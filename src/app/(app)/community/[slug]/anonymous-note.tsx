import { Note } from "@/components/ui/note";

/**
 * 익명 게시판 고지. **글 폼과 댓글 폼이 같은 문구를 쓴다** — 한쪽에만 두면
 * 학생이 보는 약속이 화면마다 갈린다.
 *
 * 댓글도 글과 똑같이 작성자·시각이 붙은 감사로그(`community:comment:create`)를
 * 남긴다. 「화면에 안 보인다」까지만 알리면 학생은 완전한 익명으로 알고 쓴다.
 *
 * 마진은 이 배너가 놓이는 화면이 정한다 (`Note`와 같은 규약).
 */
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
