"use client";

import { useActionState, useState } from "react";
import { StudentPicker, type PickerStudent } from "@/components/students/student-picker";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { SecretPanel } from "@/components/ui/secret-panel";
import { INVITE_FORM_INITIAL, type InviteFormState } from "./action-state";
import {
  createAdminInviteAction,
  createParentInviteForAction,
  createStudentInviteAction,
} from "./actions";

type Target = "STUDENT" | "ADMIN" | "PARENT";

export function InviteForm({ students }: { students: PickerStudent[] }) {
  const [target, setTarget] = useState<Target>("STUDENT");

  return (
    <SectionCard
      variant="panel"
      title="초대코드 발급"
      hint="학부모 코드는 학생 본인도 만들 수 있습니다."
    >
      <div className="mb-5 flex gap-1.5">
        <Button
          variant="chip"
          size="sm"
          active={target === "STUDENT"}
          onClick={() => setTarget("STUDENT")}
        >
          학생
        </Button>
        <Button
          variant="chip"
          size="sm"
          active={target === "ADMIN"}
          onClick={() => setTarget("ADMIN")}
        >
          교사
        </Button>
        <Button
          variant="chip"
          size="sm"
          active={target === "PARENT"}
          onClick={() => setTarget("PARENT")}
        >
          학부모
        </Button>
      </div>

      {target === "STUDENT" && <StudentForm />}
      {target === "ADMIN" && <AdminForm />}
      {target === "PARENT" && <ParentForm students={students} />}
    </SectionCard>
  );
}

function ParentForm({ students }: { students: PickerStudent[] }) {
  const [state, formAction, pending] = useActionState(
    createParentInviteForAction,
    INVITE_FORM_INITIAL,
  );

  const values = state.values;
  // 빈 문자열은 "고르지 않았다"이므로 되돌릴 값이 아니다.
  const keepStudentId = values?.studentId || undefined;

  return (
    <form action={formAction}>
      {/* 고르는 버튼이 자기 이름을 말하므로(「학생 고르기」) htmlFor로 묶을 칸이 없다. */}
      <Label>학생</Label>
      <div className="mb-4">
        {/*
          key는 남는다 — 이유가 바뀌었다. 예전에는 React가 <option>.defaultSelected를
          마운트 때 한 번만 쓰기 때문이었고, 지금은 고른 학생이 리액트 상태라
          폼 자동 리셋도 defaultValue 갱신도 그것을 건드리지 못하기 때문이다.
          실패해서 되돌아올 때는 defaultValue가 방금 고른 그 학생이라 새로 마운트돼도
          같은 값이 다시 심기고, 성공해서 되돌릴 값이 사라질 때만 함께 비워진다.
        */}
        <StudentPicker
          key={keepStudentId ?? "none"}
          students={students}
          name="studentId"
          defaultValue={keepStudentId}
          required
        />
      </div>

      <Label htmlFor="p-name">학부모 이름</Label>
      <Input
        id="p-name"
        name="name"
        required
        maxLength={50}
        defaultValue={values?.name ?? ""}
        className="mb-4"
      />

      <ExpiryField defaultValue={values?.expiresInDays ?? ""} />

      <ConfirmSubmit
        label="학부모 코드 발급"
        title="학부모 초대코드 발급"
        description="코드는 이 화면에서 한 번만 보입니다."
        confirmLabel="발급"
        pendingLabel="발급 중…"
        pending={pending}
        disabled={students.length === 0}
        size="md"
      />

      <Result state={state} />
    </form>
  );
}

function Result({ state }: { state: InviteFormState }) {
  if (state.error) {
    return (
      <Note tone="error" className="mt-4">
        {state.error}
      </Note>
    );
  }

  if (!state.code) return null;

  return (
    <SecretPanel label="발급된 초대코드" value={state.code} className="mt-4" />
  );
}

/**
 * defaultValue는 발급에 실패한 폼이 되돌려 받는 제출값이다. 비면 빈 칸이다.
 *
 * 학년·반·번호와 같은 이유로 type="number"를 쓰지 않는다 — 포커스된 number 칸은
 * react-dom이 defaultValue 갱신을 건너뛰어(setDefaultValue의 number 예외) 리셋 뒤
 * 되돌려 받은 값이 화면에 안 붙는다. 대신 pattern으로 비숫자를 막고, 범위(1~365)는
 * invite.schema.ts의 expiresInDays가 한글 문구로 막는다.
 */
function ExpiryField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <>
      <Label htmlFor="expiresInDays">유효기간 (일)</Label>
      <Input
        id="expiresInDays"
        name="expiresInDays"
        inputMode="numeric"
        pattern="[0-9]*"
        defaultValue={defaultValue}
        placeholder="비우면 무기한"
        className="mb-6"
      />
    </>
  );
}

function StudentForm() {
  const [state, formAction, pending] = useActionState(
    createStudentInviteAction,
    INVITE_FORM_INITIAL,
  );

  const values = state.values;

  return (
    <form action={formAction}>
      <Label htmlFor="s-name">이름</Label>
      <Input
        id="s-name"
        name="name"
        required
        maxLength={50}
        defaultValue={values?.name ?? ""}
        className="mb-4"
      />

      <Label htmlFor="s-birth">생년월일</Label>
      <Input
        id="s-birth"
        name="birthDate"
        type="date"
        required
        defaultValue={values?.birthDate ?? ""}
        className="mb-4"
      />

      {/*
        세 칸 모두 type="number"가 아니다. react-dom은 포커스된 number 칸의
        defaultValue 갱신을 건너뛰므로(커서 튐 방지), 그 칸에 커서를 둔 채
        Enter로 제출해 실패하면 폼 자동 리셋이 옛 값을 되돌린다.
        잃는 min·max는 createStudentInviteSchema가 한글 문구로 그대로 막는다.
        pattern은 남긴다 — 숫자 아닌 값은 액션의 Number()에서 NaN이 되고
        스키마에 그 경우의 문구가 없어 zod의 영문 기본 문구가 화면에 나간다.
      */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="s-grade">학년</Label>
          <Input
            id="s-grade"
            name="grade"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={values?.grade ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="s-class">반</Label>
          <Input
            id="s-class"
            name="classNo"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={values?.classNo ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="s-no">번호</Label>
          <Input
            id="s-no"
            name="number"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={values?.number ?? ""}
          />
        </div>
      </div>

      <ExpiryField defaultValue={values?.expiresInDays ?? ""} />

      <ConfirmSubmit
        label="학생 코드 발급"
        title="학생 초대코드 발급"
        description="코드는 이 화면에서 한 번만 보입니다."
        confirmLabel="발급"
        pendingLabel="발급 중…"
        pending={pending}
        size="md"
      />

      <Result state={state} />
    </form>
  );
}

function AdminForm() {
  const [state, formAction, pending] = useActionState(
    createAdminInviteAction,
    INVITE_FORM_INITIAL,
  );

  const values = state.values;

  return (
    <form action={formAction}>
      <Label htmlFor="a-name">이름</Label>
      <Input
        id="a-name"
        name="name"
        required
        maxLength={50}
        defaultValue={values?.name ?? ""}
        className="mb-4"
      />

      <ExpiryField defaultValue={values?.expiresInDays ?? ""} />

      <ConfirmSubmit
        label="교사 코드 발급"
        title="교사 초대코드 발급"
        description="받는 사람이 교사 권한으로 가입합니다."
        confirmLabel="발급"
        pendingLabel="발급 중…"
        pending={pending}
        size="md"
      />

      <Result state={state} />
    </form>
  );
}
