"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { PASS_TYPE_LABELS, PASS_TYPES, type PassType } from "@/core/authz/pass-type";
import { formatSeat } from "@/lib/student-number";
import { EMPTY_PASS_STATE } from "./action-state";
import { issueAction } from "./actions";

export type IssueStudent = {
  id: string;
  name: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/**
 * 신청 없이 바로 부여. **시작 시각 칸이 없다** — 「지금 내보낸다」는 상황이라
 * 서비스가 지금부터로 만든다.
 */
export function IssueForm({
  students,
  today,
}: {
  students: IssueStudent[];
  today: string;
}) {
  const [type, setType] = useState<PassType>("OUTING");
  const [state, action, pending] = useActionState(issueAction, EMPTY_PASS_STATE);

  const groups = groupByClass(students);

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

      <Label htmlFor="studentId">학생</Label>
      <Select id="studentId" name="studentId" required className="mb-4">
        <option value="">고르세요</option>
        {groups.map(([label, rows]) => (
          <optgroup key={label} label={label}>
            {rows.map((student) => (
              <option key={student.id} value={student.id}>
                {formatSeat(student) ?? "미배정"} {student.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>

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

/** 반별 optgroup. 300명을 한 줄로 늘어놓으면 고를 수 없다. */
function groupByClass(students: IssueStudent[]): [string, IssueStudent[]][] {
  const groups = new Map<string, IssueStudent[]>();

  for (const student of students) {
    const label =
      student.grade && student.classNo
        ? `${student.grade}학년 ${student.classNo}반`
        : "미배정";
    const bucket = groups.get(label);
    if (bucket) bucket.push(student);
    else groups.set(label, [student]);
  }

  return [...groups];
}
