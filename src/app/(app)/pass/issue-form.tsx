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

export function IssueForm({
  students,
  today,
}: {
  students: PickerStudent[];
  today: string;
}) {
  const [type, setType] = useState<PassType>("OUTING");
  const [endDate, setEndDate] = useState(today);
  const [endTime, setEndTime] = useState("");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [guardianConfirmed, setGuardianConfirmed] = useState(false);
  const [consentNote, setConsentNote] = useState("");
  const [state, action, pending] = useActionState(issueAction, EMPTY_PASS_STATE);

  const [pickerKey, setPickerKey] = useState(0);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) {
      setPickerKey((n) => n + 1);
      setEndDate(today);
      setEndTime("");
      setDestination("");
      setReason("");
      setGuardianConfirmed(false);
      setConsentNote("");
    }
  }

  return (
    <form action={action}>
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

      <Label htmlFor="studentId">학생</Label>
      <div className="mb-4">
        <StudentPicker
          key={pickerKey}
          id="studentId"
          students={students}
          name="studentId"
          required
        />
      </div>

      {type === "OUTING" ? (
        <>
          <Label htmlFor="endTime">돌아오는 시각</Label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
            className="mb-4"
          />
        </>
      ) : (
        <>
          <Label htmlFor="endDate">돌아오는 날짜</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            min={today}
            required
            className="mb-4"
          />
          <Label htmlFor="endTime">돌아오는 시각</Label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
            className="mb-4"
          />
        </>
      )}

      <Label htmlFor="issue-destination">행선지</Label>
      <Input
        id="issue-destination"
        name="destination"
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
        maxLength={60}
        required
        className="mb-4"
      />

      <Label htmlFor="issue-reason">사유</Label>
      <Textarea
        id="issue-reason"
        name="reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
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
            checked={guardianConfirmed}
            onChange={(event) => setGuardianConfirmed(event.target.checked)}
            label="보호자를 확인했습니다"
            required
          />
          <Input
            name="consentNote"
            value={consentNote}
            onChange={(event) => setConsentNote(event.target.value)}
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
