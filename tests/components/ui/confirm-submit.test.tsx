import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";

function render({ pending = false, disabled = false }: { pending?: boolean; disabled?: boolean }) {
  return renderToStaticMarkup(
    <form>
      <ConfirmSubmit
        label="저장"
        ariaLabel="교내 벌점 기준 저장"
        title="저장 확인"
        description="저장합니다."
        confirmLabel="저장"
        pendingLabel="저장 중…"
        pending={pending}
        disabled={disabled}
      />
    </form>,
  );
}

describe("ConfirmSubmit", () => {
  it("전제조건 때문에 비활성이어도 처리 중 문구를 표시하지 않는다", () => {
    const html = render({ disabled: true });

    expect(html).toContain("disabled=\"\"");
    expect(html).toContain(">저장</button>");
    expect(html).not.toContain("저장 중…");
  });

  it("실제 작업이 진행 중일 때만 pending 문구와 aria-busy를 표시한다", () => {
    const html = render({ pending: true });

    expect(html).toContain("저장 중…");
    expect(html).toContain("aria-busy=\"true\"");
  });

  it("반복되는 버튼에 대상이 포함된 접근 가능한 이름을 붙인다", () => {
    expect(render({})).toContain('aria-label="교내 벌점 기준 저장"');
  });
});
