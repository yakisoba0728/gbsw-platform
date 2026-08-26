"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { PASS_TYPE_LABELS, PASS_TYPES, type PassType } from "@/core/authz/pass-type";
import { EMPTY_PASS_STATE } from "../action-state";
import { requestAction } from "../actions";

/**
 * 유형에 따라 날짜 칸이 갈린다 — 외출은 「날짜 하나 + 시각 둘」, 외박은
 * 「날짜와 시각 둘씩」이다. 안 쓰는 칸은 감추지 않고 **렌더하지 않는다**:
 * 감추기만 하면 그 값이 FormData에 실려 스키마가 갈라 준 뜻이 흐려진다.
 *
 * **시각 칸은 기본값을 두지 않는다.** 임의로 채우면 학생이 확인 없이 낸다.
 */
export function RequestForm({ today }: { today: string }) {
  const router = useRouter();
  const [type, setType] = useState<PassType>("OUTING");
  const [state, action, pending] = useActionState(requestAction, EMPTY_PASS_STATE);

  useEffect(() => {
    if (state.ok) router.push("/pass");
  }, [state.ok, router]);

  return (
    <form action={action}>
      <fieldset className="mb-5">
        <legend className="mb-2 text-caption font-medium text-ink">유형</legend>
        <div className="flex gap-2">
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
      </fieldset>

      <input type="hidden" name="type" value={type} />

      {type === "OUTING" ? (
        <div className="mb-4 grid gap-4 @sm:grid-cols-3">
          <div>
            <Label htmlFor="date">날짜</Label>
            <Input id="date" name="date" type="date" defaultValue={today} min={today} required />
          </div>
          <div>
            <Label htmlFor="startTime">나가는 시각</Label>
            <Input id="startTime" name="startTime" type="time" required />
          </div>
          <div>
            <Label htmlFor="endTime">돌아오는 시각</Label>
            <Input id="endTime" name="endTime" type="time" required />
          </div>
        </div>
      ) : (
        // 날짜와 시각이 짝이라 두 칸씩 묶는다 — 네 줄로 세우면 「나가는」과
        // 「돌아오는」이 한눈에 갈리지 않는다. 폭이 좁으면 그대로 한 줄씩 선다.
        <div className="mb-4 grid gap-4 @sm:grid-cols-2">
          <div>
            <Label htmlFor="startDate">나가는 날짜</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={today}
              min={today}
              required
            />
          </div>
          <div>
            <Label htmlFor="startTime">나가는 시각</Label>
            <Input id="startTime" name="startTime" type="time" required />
          </div>
          <div>
            <Label htmlFor="endDate">돌아오는 날짜</Label>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={today}
              min={today}
              required
            />
          </div>
          <div>
            <Label htmlFor="endTime">돌아오는 시각</Label>
            <Input id="endTime" name="endTime" type="time" required />
          </div>
        </div>
      )}

      <Label htmlFor="destination">행선지</Label>
      <Input
        id="destination"
        name="destination"
        maxLength={60}
        placeholder="예) ○○치과 · 본가"
        required
        className="mb-4"
      />

      <Label htmlFor="reason">사유</Label>
      <Textarea
        id="reason"
        name="reason"
        rows={3}
        maxLength={200}
        placeholder="선생님이 보고 판단할 내용을 적습니다."
        required
        className="mb-5"
      />

      {type === "OVERNIGHT" && (
        <Note tone="warn" className="mb-4">
          외박은 보호자 확인을 거쳐 선생님이 승인합니다.
        </Note>
      )}

      {state.error && (
        <Note tone="error" className="mb-4">
          {state.error}
        </Note>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "신청하는 중…" : "신청하기"}
      </Button>
    </form>
  );
}
