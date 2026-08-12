"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { formatPhone } from "@/lib/masks";
import {
  UPDATE_USER_INITIAL,
  USER_ACTION_INITIAL,
} from "../action-state";
import {
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "../actions";

/*
 * 각 폼이 자기 결과를 직접 렌더한다.
 * 결과를 부모로 끌어올리면 자식 렌더 중에 부모 setState를 부르게 되어
 * "Cannot update a component while rendering a different component"로 터진다.
 */

export type EditableUser = {
  id: string;
  name: string;
  phone: string;
  isStudent: boolean;
  birthDate: string;
  grade: string;
  classNo: string;
  number: string;
  active: boolean;
  isSelf: boolean;
};

function Note({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "bad" ? "alert" : undefined}
      className={
        tone === "bad"
          ? "mt-3 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
          : "mt-3 rounded-btn bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green"
      }
    >
      {children}
    </p>
  );
}

const FIELD_LABEL: Record<string, string> = {
  name: "이름",
  phone: "전화번호",
  birthDate: "생년월일",
  grade: "학년",
  classNo: "반",
  number: "번호",
};

export function EditUserForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(
    updateUserAction,
    UPDATE_USER_INITIAL,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />

      <Label htmlFor="name">이름</Label>
      <Input
        id="name"
        name="name"
        dense
        defaultValue={user.name}
        maxLength={50}
        required
        className="mb-[13px]"
      />

      <Label htmlFor="phone">전화번호</Label>
      <MaskedInput
        id="phone"
        name="phone"
        dense
        defaultValue={user.phone}
        placeholder="010-0000-0000"
        format={formatPhone}
        className="mb-[13px]"
      />

      {user.isStudent && (
        <>
          <Label htmlFor="birthDate">생년월일</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            dense
            defaultValue={user.birthDate}
            required
            className="mb-[13px]"
          />

          <div className="mb-[13px] grid grid-cols-3 gap-2">
            <div>
              <Label htmlFor="grade">학년</Label>
              <Input
                id="grade"
                name="grade"
                type="number"
                dense
                min={1}
                max={3}
                defaultValue={user.grade}
                required
              />
            </div>
            <div>
              <Label htmlFor="classNo">반</Label>
              <Input
                id="classNo"
                name="classNo"
                type="number"
                dense
                min={1}
                max={20}
                defaultValue={user.classNo}
                required
              />
            </div>
            <div>
              <Label htmlFor="number">번호</Label>
              <Input
                id="number"
                name="number"
                type="number"
                dense
                min={1}
                max={50}
                defaultValue={user.number}
                required
              />
            </div>
          </div>
        </>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </Button>

      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.changed !== null &&
        (state.changed.length === 0 ? (
          <Note tone="ok">바뀐 내용이 없습니다.</Note>
        ) : (
          <Note tone="ok">
            저장했습니다 —{" "}
            {state.changed.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
          </Note>
        ))}
    </form>
  );
}

export function ResetPasswordForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    USER_ACTION_INITIAL,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <Button type="submit" variant="secondary" full disabled={pending}>
        {pending ? "처리 중…" : "비밀번호 초기화"}
      </Button>

      {state.error && <Note tone="bad">{state.error}</Note>}

      {state.tempPassword && (
        <div className="mt-3 rounded-btn bg-pri-soft px-4 py-3">
          <p className="text-[11.5px] font-semibold text-pri">임시 비밀번호</p>
          <p className="mt-0.5 text-xl font-extrabold text-ink">
            {state.tempPassword}
          </p>
          <p className="mt-1 text-[11.5px] text-mut">
            지금 전달하세요. 이 화면을 벗어나면 다시 볼 수 없습니다.
          </p>
        </div>
      )}
    </form>
  );
}

export function ToggleActiveForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(
    setUserActiveAction,
    USER_ACTION_INITIAL,
  );

  const blocked = user.active && user.isSelf;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="active" value={String(!user.active)} />
      <Button
        type="submit"
        variant={user.active ? "danger" : "secondary"}
        full
        disabled={pending || blocked}
      >
        {pending ? "처리 중…" : user.active ? "계정 비활성화" : "계정 활성화"}
      </Button>

      {blocked && (
        <p className="mt-1.5 text-[11.5px] text-mut">
          자기 계정은 비활성화할 수 없습니다.
        </p>
      )}
      {state.error && <Note tone="bad">{state.error}</Note>}
    </form>
  );
}
