"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
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
    <section className="rounded-card border border-line bg-surface p-5 lg:p-6">
      <h2 className="text-base font-extrabold text-ink">가입코드 발급</h2>
      <p className="mt-1 text-[13px] text-mut">
        학부모 코드는 학생 본인도 만들 수 있습니다.
      </p>

      <div className="mt-4 mb-5 flex gap-1.5">
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
    </section>
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

      {/* 위 "학생 찾기"는 목록을 좁히는 칸이라 이 목록의 라벨이 아니다 —
          접근성 이름을 따로 준다. */}
      <Select
        name="studentId"
        size={6}
        required
        aria-label="학생 선택"
        className="mb-[15px]"
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

      <Label htmlFor="p-name">학부모님 이름</Label>
      <Input id="p-name" name="name" required maxLength={50} className="mb-[15px]" />

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
    <div className="mt-4 rounded-btn bg-pri-soft px-4 py-3">
      <p className="text-[12px] font-semibold text-pri">발급된 가입코드</p>
      <p className="mt-1 text-xl font-extrabold text-ink">
        {state.code}
      </p>
    </div>
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
        className="mb-[22px]"
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
      <Input id="s-name" name="name" required maxLength={50} className="mb-[15px]" />

      <Label htmlFor="s-birth">생년월일</Label>
      <Input id="s-birth" name="birthDate" type="date" required className="mb-[15px]" />

      <div className="mb-[15px] grid grid-cols-3 gap-2">
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
      <Input id="a-name" name="name" required maxLength={50} className="mb-[15px]" />

      <ExpiryField />

      <Button type="submit" full disabled={pending}>
        {pending ? "발급 중…" : "관리자 코드 발급"}
      </Button>

      <Result state={state} />
    </form>
  );
}
