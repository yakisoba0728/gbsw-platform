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

export function readNativeValidationIssues(form: HTMLFormElement): NativeValidationIssue[] {
  const seen = new Set<string>();
  const issues: NativeValidationIssue[] = [];

  Array.from(form.elements).forEach((element, index) => {
    const control = asValidatableControl(element);
    if (!control || !control.willValidate || control.validity.valid) return;

    const fieldId = control.id;
    const fieldName = control.name;
    const key = fieldId || fieldName || `field-${index}`;
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

    queueMicrotask(() => {
      scheduledRead.current = false;
      const nextIssues = readNativeValidationIssues(form);
      setIssues(nextIssues);

      const first = nextIssues[0];
      if (first) focusNativeValidationIssue(form, first);
    });
  }, []);

  const onInputCapture = useCallback((event: FormEvent<HTMLFormElement>) => {
    const control = asValidatableControl(event.target as Element);
    if (!control) return;
    const form = event.currentTarget;

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
