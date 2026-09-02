"use client";

import { useActionState, useState } from "react";
import { CheckboxField } from "@/components/ui/checkbox";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input, Label } from "@/components/ui/input";
import {
  NativeFieldError,
  NativeFormErrorSummary,
  useNativeFormErrors,
} from "@/components/ui/native-form-errors";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { ROLE_LABELS, type Role } from "@/core/authz/roles";
import { EMPTY_COMMUNITY_FORM_STATE } from "./action-state";
import { createCommunityAction, updateCommunityAction } from "./actions";
import {
  COMMUNITY_ASSIGNABLE_ROLES,
  communityRolePermissions,
  toggleCommunityRolePermission,
} from "./role-permissions";

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
  updatedAt: string;
};

export function CommunityForm({ board }: { board?: CommunityFormBoard }) {
  const editing = board !== undefined;
  const [state, formAction, pending] = useActionState(
    editing ? updateCommunityAction : createCommunityAction,
    EMPTY_COMMUNITY_FORM_STATE,
  );

  const v = state.values;
  const readRoles = v?.readRoles ?? board?.readRoles ?? [];
  const writeRoles = v?.writeRoles ?? board?.writeRoles ?? [];
  const lockedAnonymous = board?.anonymous ?? false;
  const initialAnonymous = lockedAnonymous || (v ? v.anonymous : false);
  const allowAttachments = v ? v.allowAttachments : (board?.allowAttachments ?? true);
  const [permissions, setPermissions] = useState(() =>
    communityRolePermissions(readRoles, writeRoles),
  );
  const [anonymous, setAnonymous] = useState(initialAnonymous);
  const [handledState, setHandledState] = useState(state);
  const [handledBoardRevision, setHandledBoardRevision] = useState(board?.updatedAt);
  const {
    formRef,
    issues,
    issueFor,
    focusIssue,
    onInvalidCapture,
    onInputCapture,
    onResetCapture,
  } = useNativeFormErrors();

  const nameIssue = issueFor("name");
  const slugIssue = issueFor("slug");
  const descriptionIssue = issueFor("description");
  const sortIssue = issueFor("sortOrder");

  if (state !== handledState || board?.updatedAt !== handledBoardRevision) {
    setHandledState(state);
    setHandledBoardRevision(board?.updatedAt);
    setPermissions(communityRolePermissions(readRoles, writeRoles));
    setAnonymous(initialAnonymous);
  }

  return (
    <SectionCard
      variant="panel"
      title={editing ? "게시판 설정" : "게시판 추가"}
      className="@container"
    >
      <form
        ref={formRef}
        action={formAction}
        className="space-y-4"
        onInvalidCapture={onInvalidCapture}
        onInputCapture={onInputCapture}
        onResetCapture={onResetCapture}
      >
        {editing && (
          <>
            <input type="hidden" name="communityId" value={board.id} />
            <input type="hidden" name="updatedAt" value={board.updatedAt} />
          </>
        )}

        <NativeFormErrorSummary
          issues={issues}
          onSelect={focusIssue}
        />

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
              aria-invalid={nameIssue ? true : undefined}
              aria-describedby={nameIssue ? "cf-name-error" : undefined}
            />
            <NativeFieldError id="cf-name-error" issue={nameIssue} />
          </div>

          <div>
            <Label htmlFor="cf-slug">주소</Label>
            <Input
              id="cf-slug"
              name="slug"
              required={!editing}
              readOnly={editing}
              minLength={2}
              maxLength={32}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="소문자 영문·숫자·하이픈으로 2~32자 입력해 주세요."
              autoCapitalize="none"
              spellCheck={false}
              defaultValue={v?.slug ?? board?.slug ?? ""}
              placeholder="notice"
              aria-invalid={slugIssue ? true : undefined}
              aria-describedby={
                slugIssue ? "cf-slug-hint cf-slug-error" : "cf-slug-hint"
              }
            />
            <p id="cf-slug-hint" className="mt-1 text-caption text-mut">
              {editing
                ? "주소는 만든 뒤에 바꿀 수 없습니다. 바꾸면 그동안 붙은 링크가 모두 끊깁니다."
                : "소문자 영문·숫자·하이픈으로 2~32자 입력합니다. /community/주소 로 열립니다."}
            </p>
            <NativeFieldError id="cf-slug-error" issue={slugIssue} />
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
            aria-invalid={descriptionIssue ? true : undefined}
            aria-describedby={descriptionIssue ? "cf-description-error" : undefined}
          />
          <NativeFieldError id="cf-description-error" issue={descriptionIssue} />
        </div>

        <fieldset className="rounded-card border border-line p-4">
          <legend className="px-1 text-caption font-medium text-mut">권한</legend>

          <div className="grid gap-3 @xl:grid-cols-2">
            <RoleGroup
              title="읽기"
              name="readRoles"
              selected={permissions.readRoles}
              idPrefix="cf-read"
              onChange={(role, checked) =>
                setPermissions((current) =>
                  toggleCommunityRolePermission(current, "read", role, checked),
                )
              }
            />
            <RoleGroup
              title="글쓰기"
              name="writeRoles"
              selected={permissions.writeRoles}
              idPrefix="cf-write"
              onChange={(role, checked) =>
                setPermissions((current) =>
                  toggleCommunityRolePermission(current, "write", role, checked),
                )
              }
            />
          </div>

          <p className="mt-3 text-caption text-mut">
            교사는 목록과 무관하게 모든 게시판을 읽고 씁니다. 글쓰기를 준 역할은 읽기에도
            들어 있어야 합니다.
          </p>
        </fieldset>

        <div className="grid gap-2.5 @xl:grid-cols-2">
          <div className="space-y-2">
            {lockedAnonymous && <input type="hidden" name="anonymous" value="on" />}
            <CheckboxField
              id="cf-anonymous"
              label={lockedAnonymous ? "익명 게시판 (잠김)" : "익명 게시판"}
              name={lockedAnonymous ? undefined : "anonymous"}
              checked={anonymous}
              disabled={lockedAnonymous}
              aria-describedby="cf-anonymous-hint"
              onChange={
                lockedAnonymous
                  ? undefined
                  : (event) => setAnonymous(event.currentTarget.checked)
              }
              className={lockedAnonymous ? "opacity-60" : undefined}
            />
            <p id="cf-anonymous-hint" className="text-caption text-mut">
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
                type="number"
                min={-999}
                max={999}
                step={1}
                size="sm"
                defaultValue={v?.sortOrder ?? String(board?.sortOrder ?? 0)}
                placeholder="0"
                aria-invalid={sortIssue ? true : undefined}
                aria-describedby={sortIssue ? "cf-sort-error" : undefined}
              />
              <NativeFieldError id="cf-sort-error" issue={sortIssue} />
            </div>
          </div>
        </div>

        {state.error && <Note tone="error">{state.error}</Note>}

        <ConfirmSubmit
          label={editing ? "저장" : "게시판 만들기"}
          title={editing ? "게시판을 저장합니다" : "게시판을 만듭니다"}
          description={
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

function RoleGroup({
  title,
  name,
  selected,
  idPrefix,
  onChange,
}: {
  title: string;
  name: string;
  selected: readonly Role[];
  idPrefix: string;
  onChange: (role: Role, checked: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="text-caption font-medium text-ink">{title} 권한</legend>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {COMMUNITY_ASSIGNABLE_ROLES.map((role) => (
          <CheckboxField
            key={role}
            id={`${idPrefix}-${role}`}
            label={ROLE_LABELS[role]}
            aria-label={`${title} 권한: ${ROLE_LABELS[role]}`}
            name={name}
            value={role}
            checked={selected.includes(role)}
            onChange={(event) => onChange(role, event.currentTarget.checked)}
          />
        ))}
      </div>
    </fieldset>
  );
}
