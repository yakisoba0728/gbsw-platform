"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { SecretPanel } from "@/components/ui/secret-panel";
import { Select } from "@/components/ui/select";
import { INVITE_FORM_INITIAL, type InviteFormState } from "./action-state";
import {
  createAdminInviteAction,
  createParentInviteForAction,
  createStudentInviteAction,
} from "./actions";

export type StudentOption = {
  id: string;
  label: string;
  search: string;
};

type Target = "STUDENT" | "ADMIN" | "PARENT";

export function InviteForm({ students }: { students: StudentOption[] }) {
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
          관리자
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

function ParentForm({ students }: { students: StudentOption[] }) {
  const [state, formAction, pending] = useActionState(
    createParentInviteForAction,
    INVITE_FORM_INITIAL,
  );
  const [query, setQuery] = useState("");

  const matched = students.filter((s) =>
    s.search.includes(query.trim().toLowerCase()),
  );

  return (
    <form action={formAction}>
      <Label htmlFor="p-search">학생 찾기</Label>
      <Input
        id="p-search"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="이름 · 학년 · 반"
        className="mb-2"
      />

      {/* 위 검색칸은 목록을 좁히는 자리라 이 목록의 라벨이 아니다. */}
      <Select
        name="studentId"
        size={6}
        required
        aria-label="학생 선택"
        className="mb-4"
      >
        {matched.length === 0 ? (
          <option disabled>조건에 맞는 학생이 없습니다</option>
        ) : (
          matched.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))
        )}
      </Select>

      <Label htmlFor="p-name">학부모 이름</Label>
      <Input id="p-name" name="name" required maxLength={50} className="mb-4" />

      <ExpiryField />

      <Button type="submit" full disabled={pending || students.length === 0}>
        {pending ? "발급 중…" : "학부모 코드 발급"}
      </Button>

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

function ExpiryField() {
  return (
    <>
      <Label htmlFor="expiresInDays">유효기간 (일)</Label>
      <Input
        id="expiresInDays"
        name="expiresInDays"
        type="number"
        min={1}
        max={365}
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

  return (
    <form action={formAction}>
      <Label htmlFor="s-name">이름</Label>
      <Input id="s-name" name="name" required maxLength={50} className="mb-4" />

      <Label htmlFor="s-birth">생년월일</Label>
      <Input id="s-birth" name="birthDate" type="date" required className="mb-4" />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="s-grade">학년</Label>
          <Input id="s-grade" name="grade" type="number" min={1} max={3} required />
        </div>
        <div>
          <Label htmlFor="s-class">반</Label>
          <Input id="s-class" name="classNo" type="number" min={1} max={20} required />
        </div>
        <div>
          <Label htmlFor="s-no">번호</Label>
          <Input id="s-no" name="number" type="number" min={1} max={50} required />
        </div>
      </div>

      <ExpiryField />

      <Button type="submit" full disabled={pending}>
        {pending ? "발급 중…" : "학생 코드 발급"}
      </Button>

      <Result state={state} />
    </form>
  );
}

function AdminForm() {
  const [state, formAction, pending] = useActionState(
    createAdminInviteAction,
    INVITE_FORM_INITIAL,
  );

  return (
    <form action={formAction}>
      <Label htmlFor="a-name">이름</Label>
      <Input id="a-name" name="name" required maxLength={50} className="mb-4" />

      <ExpiryField />

      <Button type="submit" full disabled={pending}>
        {pending ? "발급 중…" : "관리자 코드 발급"}
      </Button>

      <Result state={state} />
    </form>
  );
}
