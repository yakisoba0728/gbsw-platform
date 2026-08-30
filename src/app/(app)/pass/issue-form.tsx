"use client";

import { useActionState, useState } from "react";
import { StudentPicker, type PickerStudent } from "@/components/students/student-picker";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Segmented, SegmentButton } from "@/components/ui/segmented";
import { PASS_TYPE_LABELS, PASS_TYPES, type PassType } from "@/core/authz/pass-type";
import { EMPTY_PASS_STATE } from "./action-state";
import { issueAction } from "./actions";

/**
 * 신청 없이 바로 부여. **시작 칸이 없다** — 「지금 내보낸다」는 상황이라
 * 서비스가 지금부터로 만든다. 받는 것은 언제까지인가뿐이다: 외출은 시각,
 * 외박은 날짜와 시각. 시각 칸은 기본값을 두지 않는다.
 */
export function IssueForm({
  students,
  today,
}: {
  students: PickerStudent[];
  today: string;
}) {
  const [type, setType] = useState<PassType>("OUTING");
  const [state, action, pending] = useActionState(issueAction, EMPTY_PASS_STATE);

  /**
   * 고른 학생을 새로 마운트시키는 열쇠. 부여가 끝나면 React가 폼을 되돌려 행선지·
   * 사유가 비는데, 고른 학생은 리액트 상태라 함께 돌아가지 않는다 — 그러면 다 비운
   * 폼에 학생만 남아 방금 내보낸 학생을 또 고른 것처럼 보인다.
   */
  const [pickerKey, setPickerKey] = useState(0);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setPickerKey((n) => n + 1);
  }

  return (
    <form action={action}>
      {/* 유형은 둘 중 하나가 늘 켜져 있고 끌 수 없다 — 목록을 좁히는 칩이 아니라
          같은 폼의 다른 모드라, 세그먼티드 컨트롤로 세운다. */}
      <Segmented className="mb-4">
        {PASS_TYPES.map((value) => (
          <SegmentButton
            key={value}
            active={type === value}
            onClick={() => setType(value)}
          >
            {PASS_TYPE_LABELS[value]}
          </SegmentButton>
        ))}
      </Segmented>
      <input type="hidden" name="type" value={type} />

      {/* 고르는 버튼이 자기 이름을 말하므로(「학생 고르기」) htmlFor로 묶을 칸이 없다. */}
      <Label>학생</Label>
      <div className="mb-4">
        <StudentPicker key={pickerKey} students={students} name="studentId" required />
      </div>

      {type === "OUTING" ? (
        <>
          <Label htmlFor="endTime">돌아오는 시각</Label>
          <Input id="endTime" name="endTime" type="time" required className="mb-4" />
        </>
      ) : (
        // 이 폼은 사이드 칼럼(20rem)에도 서므로 두 칸을 나란히 두지 않는다 —
        // 그 폭에서 날짜 입력칸은 「yyyy-mm-dd」가 잘린다.
        <>
          <Label htmlFor="endDate">돌아오는 날짜</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={today}
            min={today}
            required
            className="mb-4"
          />
          <Label htmlFor="endTime">돌아오는 시각</Label>
          <Input id="endTime" name="endTime" type="time" required className="mb-4" />
        </>
      )}

      <Label htmlFor="issue-destination">행선지</Label>
      <Input
        id="issue-destination"
        name="destination"
        maxLength={60}
        required
        className="mb-4"
      />

      <Label htmlFor="issue-reason">사유</Label>
      <Textarea
        id="issue-reason"
        name="reason"
        rows={2}
        maxLength={200}
        required
        className="mb-4"
      />

      {type === "OVERNIGHT" && (
        <div className="mb-4 space-y-2">
          <CheckboxField
            name="guardianConfirmed"
            value="on"
            label="보호자를 확인했습니다"
            required
          />
          <Input
            name="consentNote"
            size="sm"
            maxLength={100}
            placeholder="확인 방법 (예: 아버지와 통화)"
          />
        </div>
      )}

      {state.error && (
        <Note tone="error" className="mb-4">
          {state.error}
        </Note>
      )}
      {state.ok && (
        <Note tone="success" className="mb-4">
          출입증을 부여했습니다.
        </Note>
      )}

      <ConfirmSubmit
        label="바로 부여"
        title="출입증 바로 부여"
        description="결재 없이 곧바로 승인 상태로 만듭니다."
        confirmLabel="부여"
        pendingLabel="부여하는 중…"
        pending={pending}
        size="md"
      />
    </form>
  );
}
