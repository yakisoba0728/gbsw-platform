"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Note } from "@/components/ui/note";
import { SecretPanel } from "@/components/ui/secret-panel";
import { formatPhone } from "@/lib/masks";
import {
  UPDATE_USER_INITIAL,
  USER_ACTION_INITIAL,
} from "../action-state";
import {
  deleteUserPermanentlyAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "../actions";

/** 각 폼이 자기 결과를 직접 렌더한다. 부모로 끌어올리면 렌더 중 setState로 터진다. */

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  updatedAt: string;
  isStudent: boolean;
  /** 재학 중일 때만 true — 이때만 학년·반·번호를 이 화면에서 고칠 수 있다. */
  canEditAssignment: boolean;
  birthDate: string;
  grade: string;
  classNo: string;
  number: string;
  active: boolean;
  isSelf: boolean;
};

const FIELD_LABEL: Record<string, string> = {
  name: "이름",
  email: "이메일",
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

  // React 19는 액션이 끝나면 폼을 자동 reset()한다 — 리셋이 되돌리는 값이
  // 곧 defaultValue다. 저장이 거부됐으면 방금 제출한 값을 내려 교사가 고친
  // 칸을 지키고, 성공했으면 revalidate가 가져온 서버 값을 그대로 쓴다.
  const kept = state.values;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="updatedAt" value={user.updatedAt} />

      <Label htmlFor="name">이름</Label>
      <Input
        id="name"
        name="name"
        dense
        defaultValue={kept?.name ?? user.name}
        maxLength={50}
        required
        className="mb-4"
      />

      <Label htmlFor="email">이메일</Label>
      <Input
        id="email"
        name="email"
        type="email"
        dense
        defaultValue={kept?.email ?? user.email}
        maxLength={200}
        required
        className="mb-4"
      />

      <Label htmlFor="phone">전화번호</Label>
      <MaskedInput
        id="phone"
        name="phone"
        type="tel"
        dense
        defaultValue={kept?.phone ?? user.phone}
        placeholder="010-0000-0000"
        format={formatPhone}
        required
        className="mb-4"
      />

      {user.isStudent && (
        <>
          <Label htmlFor="birthDate">생년월일</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            dense
            defaultValue={kept?.birthDate ?? user.birthDate}
            required
            className="mb-4"
          />

          {user.canEditAssignment ? (
            // 세 칸 모두 type="number"가 아니다. react-dom은 포커스된 number
            // 칸의 defaultValue 갱신을 건너뛰므로(커서 튐 방지), 그 칸에 커서를
            // 둔 채 Enter로 제출해 거부되면 위의 리셋이 옛 값을 되돌린다.
            // 잃는 min·max는 updateUserSchema가 한글 문구로 그대로 막는다.
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="grade">학년</Label>
                <Input
                  id="grade"
                  name="grade"
                  inputMode="numeric"
                  dense
                  defaultValue={kept?.grade ?? user.grade}
                  required
                />
              </div>
              <div>
                <Label htmlFor="classNo">반</Label>
                <Input
                  id="classNo"
                  name="classNo"
                  inputMode="numeric"
                  dense
                  defaultValue={kept?.classNo ?? user.classNo}
                  required
                />
              </div>
              <div>
                <Label htmlFor="number">번호</Label>
                <Input
                  id="number"
                  name="number"
                  inputMode="numeric"
                  dense
                  defaultValue={kept?.number ?? user.number}
                  required
                />
              </div>
            </div>
          ) : (
            // 재학 중이 아니면 칸을 감춘다 — 생년월일 오타 하나를 고치려고
            // 학년·반·번호를 지어낼 필요가 없어야 한다.
            <p className="mb-4 text-caption text-mut">
              재학 중이 아니라 학년·반·번호는 여기서 고칠 수 없습니다. 학적은 학생
              관리에서 바꿉니다.
            </p>
          )}
        </>
      )}

      <Button type="submit" full disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </Button>

      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}
      {state.changed !== null &&
        (state.changed.length === 0 ? (
          <Note tone="success" className="mt-3">바뀐 내용이 없습니다.</Note>
        ) : (
          <Note tone="success" className="mt-3">
            저장했습니다 — {state.changed.map((f) => FIELD_LABEL[f] ?? f).join(", ")}
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

      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}

      {state.tempPassword && (
        <SecretPanel
          label="임시 비밀번호"
          value={state.tempPassword}
          note="지금 전달해 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다."
          className="mt-3"
        />
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
        <p className="mt-1.5 text-xs text-mut">
          자기 계정은 비활성화할 수 없습니다.
        </p>
      )}
      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}
    </form>
  );
}

/**
 * 완전 삭제 (오등록 정리 전용). 이름 직접 입력을 요구하는 것도 서버가 다시 대조한다.
 */
export function HardDeleteForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(
    deleteUserPermanentlyAction,
    USER_ACTION_INITIAL,
  );
  const [confirmName, setConfirmName] = useState("");
  const matches = confirmName.length > 0 && confirmName === user.name;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />

      <p className="mb-3 text-caption text-mut">
        되돌릴 수 없습니다. 소속 이력·상벌점·초대코드가 함께 사라집니다.
      </p>

      <Label htmlFor="confirmName">
        확인을 위해 이름(<span className="font-medium text-ink">{user.name}</span>)을
        그대로 입력해 주세요
      </Label>
      <Input
        id="confirmName"
        name="confirmName"
        dense
        value={confirmName}
        onChange={(e) => setConfirmName(e.target.value)}
        autoComplete="off"
        className="mb-3"
      />

      <Button type="submit" variant="danger" full disabled={pending || !matches}>
        {pending ? "삭제 중…" : "완전 삭제"}
      </Button>

      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}
    </form>
  );
}
