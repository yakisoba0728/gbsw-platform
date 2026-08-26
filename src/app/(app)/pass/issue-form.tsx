"use client";

import { useActionState, useState } from "react";
import { StudentPicker, type PickerStudent } from "@/components/students/student-picker";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { PASS_TYPE_LABELS, PASS_TYPES, type PassType } from "@/core/authz/pass-type";
import { EMPTY_PASS_STATE } from "./action-state";
import { issueAction } from "./actions";

/**
 * 신청 없이 바로 부여. **시작 시각 칸이 없다** — 「지금 내보낸다」는 상황이라
 * 서비스가 지금부터로 만든다.
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
      <div className="mb-4 flex gap-2">
        {PASS_TYPES.map((value) => (
          <Button
            key={value}
            type="button"
            variant="chip"
            active={type === value}
            onClick={() => setType(value)}
          >
            {PASS_TYPE_LABELS[value]}
          </Button>
        ))}
      </div>
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

      <Button type="submit" full disabled={pending}>
        {pending ? "부여하는 중…" : "바로 부여"}
      </Button>
    </form>
  );
}
