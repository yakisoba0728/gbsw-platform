import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AwardConfirmDialog } from "@/components/merit/award-confirm-dialog";

describe("AwardConfirmDialog", () => {
  it("확인 버튼을 폼의 기본 submit 버튼으로 만들지 않는다", () => {
    const html = renderToStaticMarkup(
      <form>
        <AwardConfirmDialog
          open
          onClose={vi.fn()}
          rule={{
            id: "rule-1",
            kind: "DEMERIT",
            label: "점호 지각",
            points: 3,
            category: "생활",
          }}
          note=""
          students={[
            {
              studentProfileId: "sp-1",
              name: "김민준",
              grade: 2,
              classNo: 3,
              number: 7,
            },
          ]}
          showClass
          scopeLabel="2학년 3반"
          pending={false}
          error={null}
          onConfirm={vi.fn()}
        />
      </form>,
    );
    const confirm = html.match(/<button[^>]*>부여<\/button>/)?.[0];

    expect(html).not.toContain('type="submit"');
    expect(confirm).toContain('type="button"');
  });
});
