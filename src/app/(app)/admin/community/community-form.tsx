"use client";

import { useActionState } from "react";
import { CheckboxField } from "@/components/ui/checkbox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { ROLE_LABELS, ROLES, type Role } from "@/core/authz/roles";
import { EMPTY_COMMUNITY_FORM_STATE } from "./action-state";
import { createCommunityAction, updateCommunityAction } from "./actions";

/**
 * 역할 체크박스에 세울 역할. **ADMIN은 없다** — 교사는 늘 통과하므로 배열에
 * 자리가 없고, 체크칸을 두면 "ADMIN을 뺐으니 교사는 못 본다"는 오해가 생긴다.
 * `community.schema.ts`가 같은 이유로 ADMIN을 거부한다.
 */
const ASSIGNABLE: readonly Role[] = ROLES.filter((role) => role !== "ADMIN");

export type CommunityFormBoard = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  readRoles: string[];
  writeRoles: string[];
  anonymous: boolean;
  allowAttachments: boolean;
  sortOrder: number;
  /** ISO 문자열. 낙관적 잠금에 실어 보낸다. */
  updatedAt: string;
};

/**
 * 게시판 추가·수정 폼. 한 컴포넌트가 둘을 겸한다 — 받는 값이 같고, 나뉘면
 * 권한 칸 두 벌이 조용히 갈라진다.
 */
export function CommunityForm({ board }: { board?: CommunityFormBoard }) {
  const editing = board !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateCommunityAction : createCommunityAction,
    EMPTY_COMMUNITY_FORM_STATE,
  );

  /*
   * React 19는 액션이 끝나면 성공·실패를 가리지 않고 폼을 reset()한다.
   * 실패가 실어 온 제출값을 defaultValue로 내려 두면 리셋이 그 값으로 되돌아가고,
   * 성공하면 values가 없어 원래 값(수정) 또는 빈 칸(추가)으로 돌아간다.
   */
  const v = state.values;
  const readRoles = v?.readRoles ?? board?.readRoles ?? [];
  const writeRoles = v?.writeRoles ?? board?.writeRoles ?? [];
  const anonymous = v ? v.anonymous : (board?.anonymous ?? false);
  /** 이미 켜진 게시판인가. 켜진 뒤에는 끌 수 없다. */
  const lockedAnonymous = board?.anonymous ?? false;
  const allowAttachments = v ? v.allowAttachments : (board?.allowAttachments ?? true);

  return (
    <SectionCard
      variant="panel"
      title={editing ? "게시판 설정" : "게시판 추가"}
      className="@container"
    >
      <form action={formAction} className="space-y-4">
        {editing && (
          <>
            <input type="hidden" name="communityId" value={board.id} />
            <input type="hidden" name="updatedAt" value={board.updatedAt} />
          </>
        )}

        <div className="grid gap-2.5 @xl:grid-cols-2">
          <div>
            <Label htmlFor="cf-name">게시판 이름</Label>
            <Input
              id="cf-name"
              name="name"
              required
              maxLength={50}
              defaultValue={v?.name ?? board?.name ?? ""}
              placeholder="예: 공지사항"
            />
          </div>

          <div>
            <Label htmlFor="cf-slug">주소</Label>
            <Input
              id="cf-slug"
              name="slug"
              required={!editing}
              readOnly={editing}
              maxLength={32}
              defaultValue={v?.slug ?? board?.slug ?? ""}
              placeholder="notice"
              aria-describedby="cf-slug-hint"
            />
            <p id="cf-slug-hint" className="mt-1 text-caption text-mut">
              {editing
                ? "주소는 만든 뒤에 바꿀 수 없습니다. 바꾸면 그동안 붙은 링크가 모두 끊깁니다."
                : "소문자 영문·숫자·하이픈만 씁니다. /community/주소 로 열립니다."}
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="cf-description">설명</Label>
          <Input
            id="cf-description"
            name="description"
            maxLength={200}
            defaultValue={v?.description ?? board?.description ?? ""}
            placeholder="게시판 목록에 한 줄로 나옵니다"
          />
        </div>

        <fieldset className="rounded-card border border-line p-4">
          <legend className="px-1 text-caption font-medium text-mut">권한</legend>

          <div className="grid gap-3 @xl:grid-cols-2">
            <RoleGroup
              title="읽기"
              name="readRoles"
              selected={readRoles}
              idPrefix="cf-read"
            />
            <RoleGroup
              title="글쓰기"
              name="writeRoles"
              selected={writeRoles}
              idPrefix="cf-write"
            />
          </div>

          <p className="mt-3 text-caption text-mut">
            교사는 목록과 무관하게 모든 게시판을 읽고 씁니다. 글쓰기를 준 역할은 읽기에도
            들어 있어야 합니다.
          </p>
        </fieldset>

        <div className="grid gap-2.5 @xl:grid-cols-2">
          <div className="space-y-2">
            <CheckboxField
              label="익명 게시판"
              name="anonymous"
              defaultChecked={anonymous}
              // **켜진 뒤에는 끌 수 없다.** 끄면 이미 쌓인 글의 작성자가 전부
              // 드러나기 때문이다 — 서비스도 같은 이유로 거부한다. 체크는 계속
              // 보내야 하므로 disabled가 아니라 readOnly처럼 막는다.
              onClick={lockedAnonymous ? (e) => e.preventDefault() : undefined}
              aria-readonly={lockedAnonymous || undefined}
            />
            <p className="text-caption text-mut">
              {lockedAnonymous
                ? "이미 익명 게시판입니다. 끄면 그동안 쌓인 글의 작성자가 모두 드러나므로 되돌릴 수 없습니다."
                : "켜면 이 게시판의 글과 댓글에서 작성자가 아무에게도 보이지 않습니다. 교사도 마찬가지이고, 한 번 켜면 되돌릴 수 없습니다."}
            </p>
          </div>

          <div className="space-y-2">
            <CheckboxField
              label="첨부파일 허용"
              name="allowAttachments"
              defaultChecked={allowAttachments}
            />
            <div>
              <Label htmlFor="cf-sort">목록 순서</Label>
              <Input
                id="cf-sort"
                name="sortOrder"
                inputMode="numeric"
                size="sm"
                defaultValue={v?.sortOrder ?? String(board?.sortOrder ?? 0)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {state.error && <Note tone="error">{state.error}</Note>}

        <ConfirmSubmit
          label={editing ? "저장" : "게시판 만들기"}
          title={editing ? "게시판을 저장합니다" : "게시판을 만듭니다"}
          description={
            // 저장 뒤의 상태가 아니라 **이번 저장이 무엇을 바꾸는지**를 말한다.
            // 예전에는 값만 보고 문구를 골라, 익명을 끄며 저장할 때 「작성자가
            // 보이지 않습니다」라고 정반대로 안내했다.
            anonymous && !lockedAnonymous
              ? "익명 게시판으로 만듭니다. 글과 댓글의 작성자가 화면에서 아무에게도 보이지 않고, 되돌릴 수 없습니다."
              : "권한 설정이 바로 반영됩니다."
          }
          confirmLabel={editing ? "저장" : "만들기"}
          pendingLabel={editing ? "저장하는 중…" : "만드는 중…"}
          pending={pending}
          variant="primary"
          full={false}
        />
      </form>
    </SectionCard>
  );
}

/** 역할 체크칸 한 묶음. 읽기와 쓰기가 같은 모양이라 한 번만 그린다. */
function RoleGroup({
  title,
  name,
  selected,
  idPrefix,
}: {
  title: string;
  name: string;
  selected: string[];
  idPrefix: string;
}) {
  return (
    <div>
      <p className="text-caption font-medium text-ink">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {ASSIGNABLE.map((role) => (
          <CheckboxField
            key={role}
            id={`${idPrefix}-${role}`}
            label={ROLE_LABELS[role]}
            name={name}
            value={role}
            defaultChecked={selected.includes(role)}
          />
        ))}
      </div>
    </div>
  );
}
