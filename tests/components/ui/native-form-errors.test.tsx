import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  focusNativeValidationIssue,
  NativeFieldError,
  NativeFormErrorSummary,
  readNativeValidationIssues,
  type NativeValidationIssue,
} from "@/components/ui/native-form-errors";

type FakeControl = {
  id: string;
  name: string;
  willValidate: boolean;
  validity: { valid: boolean };
  validationMessage: string;
  labels: Array<{ textContent: string }>;
  getAttribute: (name: string) => string | null;
  focus: ReturnType<typeof vi.fn>;
};

function fakeControl({
  id,
  name,
  valid,
  message = "이 입력란을 작성하세요.",
  label,
  ariaLabel,
  willValidate = true,
}: {
  id: string;
  name: string;
  valid: boolean;
  message?: string;
  label: string;
  ariaLabel?: string;
  willValidate?: boolean;
}): FakeControl {
  return {
    id,
    name,
    willValidate,
    validity: { valid },
    validationMessage: message,
    labels: [{ textContent: label }],
    getAttribute: (attribute) => (attribute === "aria-label" ? (ariaLabel ?? null) : null),
    focus: vi.fn(),
  };
}

function fakeForm(controls: FakeControl[]): HTMLFormElement {
  return { elements: controls } as unknown as HTMLFormElement;
}

describe("native form error summary", () => {
  it("브라우저가 막은 필드만 DOM 순서와 접근 가능한 이름으로 수집한다", () => {
    const form = fakeForm([
      fakeControl({ id: "cf-name", name: "name", valid: false, label: "게시판 이름" }),
      fakeControl({
        id: "cf-slug",
        name: "slug",
        valid: false,
        label: "주소",
        ariaLabel: "게시판 주소",
        message: "요청한 형식과 일치시키세요.",
      }),
      fakeControl({ id: "cf-description", name: "description", valid: true, label: "설명" }),
      fakeControl({
        id: "hidden",
        name: "hidden",
        valid: false,
        label: "숨김",
        willValidate: false,
      }),
    ]);

    expect(readNativeValidationIssues(form)).toEqual([
      {
        key: "cf-name",
        fieldId: "cf-name",
        fieldName: "name",
        label: "게시판 이름",
        message: "이 입력란을 작성하세요.",
      },
      {
        key: "cf-slug",
        fieldId: "cf-slug",
        fieldName: "slug",
        label: "게시판 주소",
        message: "요청한 형식과 일치시키세요.",
      },
    ]);
  });

  it("상단 오류 항목에서 문제 필드로 직접 돌아간다", () => {
    const name = fakeControl({
      id: "cf-name",
      name: "name",
      valid: false,
      label: "게시판 이름",
    });
    const slug = fakeControl({
      id: "cf-slug",
      name: "slug",
      valid: false,
      label: "주소",
    });
    const issue: NativeValidationIssue = {
      key: "cf-slug",
      fieldId: "cf-slug",
      fieldName: "slug",
      label: "주소",
      message: "형식을 확인해 주세요.",
    };

    focusNativeValidationIssue(fakeForm([name, slug]), issue);

    expect(name.focus).not.toHaveBeenCalled();
    expect(slug.focus).toHaveBeenCalledOnce();
  });

  it("요약은 alert 목록, 필드 문구는 aria-describedby 대상 id를 렌더링한다", () => {
    const issue: NativeValidationIssue = {
      key: "cf-name",
      fieldId: "cf-name",
      fieldName: "name",
      label: "게시판 이름",
      message: "이 입력란을 작성하세요.",
    };

    const summary = renderToStaticMarkup(
      <NativeFormErrorSummary issues={[issue]} onSelect={() => undefined} />,
    );
    const field = renderToStaticMarkup(
      <NativeFieldError id="cf-name-error" issue={issue} />,
    );

    expect(summary).toContain('role="alert"');
    expect(summary).toContain('aria-label="입력 오류 요약"');
    expect(summary).toContain("게시판 이름: 이 입력란을 작성하세요.");
    expect(field).toContain('id="cf-name-error"');
    expect(field).toContain("이 입력란을 작성하세요.");
  });
});
