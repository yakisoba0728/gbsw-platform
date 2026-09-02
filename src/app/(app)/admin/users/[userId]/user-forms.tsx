"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
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

export type EditableUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  updatedAt: string;
  isStudent: boolean;
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

  const kept = state.values;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="updatedAt" value={user.updatedAt} />

      <Label htmlFor="name">이름</Label>
      <Input
        id="name"
        name="name"
        size="sm"
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
        size="sm"
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
        size="sm"
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
            size="sm"
            defaultValue={kept?.birthDate ?? user.birthDate}
            required
            className="mb-4"
          />

          {user.canEditAssignment ? (
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="grade">학년</Label>
                <Input
                  id="grade"
                  name="grade"
                  inputMode="numeric"
                  size="sm"
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
                  size="sm"
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
                  size="sm"
                  defaultValue={kept?.number ?? user.number}
                  required
                />
              </div>
            </div>
          ) : (
            <p className="mb-4 text-caption text-mut">
              재학 중이 아니라 학년·반·번호는 여기서 고칠 수 없습니다. 학적은 학생
              관리에서 바꿉니다.
            </p>
          )}
        </>
      )}

      <Label htmlFor="update-reason">사유 (선택)</Label>
      <Input
        id="update-reason"
        name="reason"
        maxLength={200}
        placeholder="예: 학생 요청으로 연락처 수정"
        className="mb-3"
      />

      <ConfirmSubmit
        label="저장"
        title="계정 정보 저장"
        description="바뀐 칸만 저장됩니다."
        confirmLabel="저장"
        pendingLabel="저장 중…"
        pending={pending}
        size="md"
      />

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

  const blocked = user.isSelf;

  return (
    <div>
      <ConfirmDialog
        trigger={(open) => (
          <Button
            type="button"
            variant="secondary"
            full
            disabled={pending || blocked}
            onClick={open}
          >
            비밀번호 초기화
          </Button>
        )}
        title="비밀번호 초기화"
        description="지금 쓰는 비밀번호가 즉시 막히고 임시 비밀번호가 나옵니다."
        reasonLabel="사유"
        reasonPlaceholder="예: 본인이 분실 신고"
        reasonRequired={false}
        confirmLabel="초기화"
        pendingLabel="초기화 중…"
        action={formAction}
        pending={pending}
        state={state}
      >
        <input type="hidden" name="userId" value={user.id} />
      </ConfirmDialog>

      {blocked && (
        <p className="mt-1.5 text-xs text-mut">
          자기 계정은 비밀번호 변경 화면에서 바꿉니다.
        </p>
      )}
      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}

      {state.tempPassword && (
        <SecretPanel
          label="임시 비밀번호"
          value={state.tempPassword}
          note="지금 전달해 주세요. 이 화면을 벗어나면 다시 볼 수 없습니다."
          className="mt-3"
        />
      )}
    </div>
  );
}

export function ToggleActiveForm({ user }: { user: EditableUser }) {
  const [state, formAction, pending] = useActionState(
    setUserActiveAction,
    USER_ACTION_INITIAL,
  );

  const blocked = user.active && user.isSelf;

  return (
    <div>
      <ConfirmDialog
        trigger={(open) => (
          <Button
            type="button"
            variant={user.active ? "danger" : "secondary"}
            full
            disabled={pending || blocked}
            onClick={open}
          >
            {user.active ? "계정 비활성화" : "계정 활성화"}
          </Button>
        )}
        title={user.active ? "계정 비활성화" : "계정 활성화"}
        description={
          user.active
            ? "로그인이 막힙니다. 기록은 그대로 남습니다."
            : "다시 로그인할 수 있게 됩니다."
        }
        reasonLabel="사유"
        reasonPlaceholder={user.active ? "예: 전학" : "예: 복학"}
        reasonRequired={false}
        confirmLabel={user.active ? "비활성화" : "활성화"}
        confirmVariant={user.active ? "danger" : "primary"}
        pendingLabel={user.active ? "비활성화 중…" : "활성화 중…"}
        action={formAction}
        pending={pending}
        state={state}
      >
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="active" value={String(!user.active)} />
      </ConfirmDialog>

      {blocked && (
        <p className="mt-1.5 text-xs text-mut">
          자기 계정은 비활성화할 수 없습니다.
        </p>
      )}
      {state.error && <Note tone="error" className="mt-3">{state.error}</Note>}
    </div>
  );
}

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
        size="sm"
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
