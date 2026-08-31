"use client";

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type FormEventHandler,
  type RefObject,
} from "react";

export type NativeValidationIssue = {
  key: string;
  fieldId: string;
  fieldName: string;
  label: string;
  message: string;
};

type ValidatableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * 브라우저 constraint validation 결과를 화면에 남길 수 있는 작은 값으로 옮긴다.
 *
 * `reportValidity()`의 말풍선은 첫 칸만 보여 주고 닫히면 사라진다. 폼의 모든
 * invalid control을 DOM 순서대로 읽어 두면 긴 폼의 상단 요약과 필드 옆 문구가
 * 같은 사실을 공유할 수 있다. 저장 가능 여부는 여전히 브라우저가 결정한다.
 */
export function readNativeValidationIssues(form: HTMLFormElement): NativeValidationIssue[] {
  const seen = new Set<string>();
  const issues: NativeValidationIssue[] = [];

  Array.from(form.elements).forEach((element, index) => {
    const control = asValidatableControl(element);
    if (!control || !control.willValidate || control.validity.valid) return;

    const fieldId = control.id;
    const fieldName = control.name;
    const key = fieldId || fieldName || `field-${index}`;
    // 라디오처럼 같은 이름을 쓰는 칸은 상단에서 한 번만 알린다.
    if (seen.has(key)) return;
    seen.add(key);

    issues.push({
      key,
      fieldId,
      fieldName,
      label: nativeControlLabel(control),
      message: control.validationMessage || "입력값을 확인해 주세요.",
    });
  });

  return issues;
}

function asValidatableControl(element: Element): ValidatableControl | null {
  if (!("validity" in element) || !("willValidate" in element)) return null;
  return element as ValidatableControl;
}

function nativeControlLabel(control: ValidatableControl): string {
  const ariaLabel = control.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const label = control.labels?.[0]?.textContent?.trim();
  if (label) return label;

  return control.name || control.id || "입력 항목";
}

function issueMatchesControl(
  issue: NativeValidationIssue,
  control: ValidatableControl,
): boolean {
  return Boolean(
    (issue.fieldId && issue.fieldId === control.id) ||
      (issue.fieldName && issue.fieldName === control.name),
  );
}

/** 오류 요약 링크와 첫 오류 이동이 함께 쓰는 포커스 경로. */
export function focusNativeValidationIssue(
  form: HTMLFormElement,
  issue: NativeValidationIssue,
): void {
  const control = Array.from(form.elements)
    .map(asValidatableControl)
    .find((candidate) => candidate !== null && issueMatchesControl(issue, candidate));
  control?.focus();
}

export function useNativeFormErrors(): {
  formRef: RefObject<HTMLFormElement | null>;
  issues: NativeValidationIssue[];
  issueFor: (field: string) => NativeValidationIssue | undefined;
  focusIssue: (issue: NativeValidationIssue) => void;
  onInvalidCapture: FormEventHandler<HTMLFormElement>;
  onInputCapture: FormEventHandler<HTMLFormElement>;
  onResetCapture: FormEventHandler<HTMLFormElement>;
} {
  const formRef = useRef<HTMLFormElement>(null);
  const scheduledRead = useRef(false);
  const [issues, setIssues] = useState<NativeValidationIssue[]>([]);

  const focusIssue = useCallback((issue: NativeValidationIssue) => {
    const form = formRef.current;
    if (!form) return;
    focusNativeValidationIssue(form, issue);
  }, []);

  const onInvalidCapture = useCallback((event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    if (scheduledRead.current) return;
    scheduledRead.current = true;

    // reportValidity()는 invalid 이벤트를 칸마다 연달아 보낸다. 한 차례가 모두
    // 끝난 뒤 한 번만 읽어야 요약이 일부 항목만 담았다가 흔들리지 않는다.
    queueMicrotask(() => {
      scheduledRead.current = false;
      const nextIssues = readNativeValidationIssues(form);
      setIssues(nextIssues);

      // 브라우저도 첫 invalid 칸으로 이동하지만, 커스텀 버튼에서 reportValidity를
      // 부르는 경로에서도 확실히 같은 칸에 머물도록 보강한다.
      const first = nextIssues[0];
      if (first) focusNativeValidationIssue(form, first);
    });
  }, []);

  const onInputCapture = useCallback((event: FormEvent<HTMLFormElement>) => {
    const control = asValidatableControl(event.target as Element);
    if (!control) return;
    const form = event.currentTarget;

    // 오류 요약이 열린 뒤에는 타이핑할 때마다 현재 validity로 다시 계산한다.
    // 아직 제출하지 않은 폼에는 아무 상태도 만들지 않는다.
    setIssues((current) =>
      current.length === 0 ? current : readNativeValidationIssues(form),
    );
  }, []);

  const issueFor = useCallback(
    (field: string) =>
      issues.find((issue) => issue.fieldId === field || issue.fieldName === field),
    [issues],
  );

  return {
    formRef,
    issues,
    issueFor,
    focusIssue,
    onInvalidCapture,
    onInputCapture,
    onResetCapture: () => setIssues([]),
  };
}

/** 긴 폼의 첫머리에 두는 오류 목록. 항목을 누르면 해당 입력칸으로 돌아간다. */
export function NativeFormErrorSummary({
  issues,
  onSelect,
}: {
  issues: readonly NativeValidationIssue[];
  onSelect: (issue: NativeValidationIssue) => void;
}) {
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      aria-label="입력 오류 요약"
      className="rounded-btn border border-rose-line bg-rose-soft px-3 py-2 text-caption text-rose"
    >
      <p className="font-medium">입력하지 않았거나 형식이 맞지 않는 항목이 있습니다.</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {issues.map((issue) => (
          <li key={issue.key}>
            <button
              type="button"
              className="text-left underline underline-offset-2"
              onClick={() => onSelect(issue)}
            >
              {issue.label}: {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 입력칸의 aria-describedby가 가리키는, 계속 남는 브라우저 오류 문구. */
export function NativeFieldError({
  id,
  issue,
}: {
  id: string;
  issue: NativeValidationIssue | undefined;
}) {
  if (!issue) return null;
  return (
    <p id={id} className="mt-1 text-caption font-medium text-rose">
      {issue.message}
    </p>
  );
}
