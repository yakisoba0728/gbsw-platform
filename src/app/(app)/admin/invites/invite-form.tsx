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
  const keepStudentId = values?.studentId || undefined;

  return (
    <form action={formAction}>
      <Label>학생</Label>
      <div className="mb-4">
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
