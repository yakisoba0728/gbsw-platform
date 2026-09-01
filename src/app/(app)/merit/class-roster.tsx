"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/truncated-text";
import {
  signedNet,
  type DemeritThresholds,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { RulePicker, type RuleOption } from "@/components/merit/rule-picker";
import {
  AwardSuccessDialog,
  type AwardSuccess,
} from "@/components/merit/award-success-dialog";
import { AwardConfirmDialog } from "@/components/merit/award-confirm-dialog";
import { DemeritCell } from "@/components/merit/demerit-level";
import { formatSeat } from "@/lib/student-number";
import { EMPTY_MERIT_STATE } from "./action-state";
import { bulkAwardAction } from "./actions";
import { ExportButton } from "./export-button";
import { honorificName } from "@/core/authz/roles";

export type RosterRow = {
  studentProfileId: string;
  studentCode: string;
  name: string;
  /** 반이 없는 학생도 명단에 남는다 — 그래서 null이 온다. */
  grade: number | null;
  classNo: number | null;
  number: number | null;
  merit: number;
  demerit: number;
  offset: number;
  net: number;
};

export type { RuleOption };

type SortKey = "number" | "net";

/**
 * 명단 + 일괄 부여. 정렬은 번호순이 기본이고, 순점수 헤더를 누르면 순점수순으로 바뀐다.
 *
 * 범위(학년·반)는 선택이다 — 안 고르면 전교가 온다. 그때는 번호만으로 누가 누군지
 * 알 수 없어 학급 열이 함께 선다.
 */
export function ClassRoster({
  rows,
  grade,
  classNo,
  track,
  thresholds,
  year,
  viewingPast,
  rules,
}: {
  rows: RosterRow[];
  /** 좁힌 범위. 없으면 전교(또는 그 학년 전체)다. */
  grade?: number;
  classNo?: number;
  track: MeritTrack;
  /** 벌점 강조 기준. 교사가 설정에서 정한 값을 서버가 내려준다. */
  thresholds: DemeritThresholds;
  year?: number;
  /** 지난 학년도를 보고 있는가. true면 부여 폼을 감춘다. */
  viewingPast: boolean;
  rules: RuleOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [state, formAction, pending] = useActionState(bulkAwardAction, EMPTY_MERIT_STATE);
  // 고른 항목은 hidden input이 싣고 가지만, 제출 버튼을 잠그려면 화면도 알아야 한다.
  const [rule, setRule] = useState<RuleOption | null>(null);
  // 좁은 화면에서는 명단과 부여 칸이 한 단으로 길게 이어진다. 학생을 고른 뒤
  // 다시 수십 줄을 내려가지 않고 부여 칸으로 이동할 수 있게 실제 목적지를 잡는다.
  const awardPanelRef = useRef<HTMLDivElement>(null);

  // 부여 직전 확인. 메모는 확인창에 다시 세울 때만 필요해서 상태로 들지 않고
  // 열리는 순간 칸에서 읽는다 — 제어 입력으로 바꾸면 액션이 끝난 뒤의 자동 reset이
  // defaultValue를 따라가면서 화면과 상태가 어긋난다.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");
  // 확인창이 열려 있는 동안 온 오류만 담는다. `state.error`를 그대로 보여주면
  // 닫았다 다시 열었을 때 아직 누르지도 않은 부여가 실패한 것처럼 보인다.
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  // 성공 알림에 쓸 값. 제출한 순간을 찍어 둔다 — 성공하면 선택과 항목이 비워져
  // 그때 가서 읽으면 이미 없다.
  const [submitted, setSubmitted] = useState<AwardSuccess | null>(null);
  const [success, setSuccess] = useState<AwardSuccess | null>(null);

  /**
   * 체크박스를 새로 마운트시키는 열쇠. 액션이 끝나면 React가 폼을 reset하는데,
   * reset은 `defaultChecked`를 따르고 `checked`만 준 제어 체크박스는 그 값이
   * 갱신되지 않는다 — 화면만 풀리고 `selected`와 「N명 선택됨」은 그대로여서
   * 둘이 어긋난다. 새로 마운트하면 checked가 defaultChecked로 함께 심겨
   * reset이 아무것도 바꾸지 않는다. `checked`와 `defaultChecked`를 둘 다 주는
   * 해법은 쓰지 않는다 — React가 개발 콘솔에 경고를 낸다.
   *
   * 성공·실패를 가리지 않고 올린다. 실패한 뒤 남은 체크박스는 defaultChecked가
   * true로 심겨 있어, 그다음 성공에서 선택을 비워도 reset이 도로 켜 버린다.
   */
  const [checkboxKey, setCheckboxKey] = useState(0);

  // 일괄 부여가 성공하면 선택을 비운다. 렌더 중 비교로 처리한다 — effect 안에서
  // 곧바로 setState하면 리렌더가 한 번 더 발생한다.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setCheckboxKey((n) => n + 1);
    if (state.ok) {
      setSelected(new Set());
      setConfirmOpen(false);
      setConfirmError(null);
      if (submitted) setSuccess({ ...submitted, count: state.count });
    } else {
      // 실패하면 확인창을 열어 둔다 — 오류가 그 안에 있고, 고른 학생이 그대로
      // 남아 고쳐서 다시 누를 수 있다. 이미 열려 있으면 아무 일도 없다.
      //
      // **다시 여는 것이 핵심이다.** 부여는 명단 반영과 잠금을 다투면 몇 초씩
      // 걸리고, 그 사이 Esc나 「닫기」로 창을 닫을 수 있다. 그때 오류가 오면
      // 실패가 앉을 자리가 어디에도 없어 조용히 사라진다.
      setConfirmOpen(true);
      setConfirmError(state.error);
    }
  }

  // 번호순은 서버가 이미 세운 순서다 — 학년·반·번호 3단이라 전교를 훑어도 반이
  // 이어진다. 여기서 번호만으로 다시 세우면 「모든 반의 1번 → 모든 반의 2번」이
  // 되고, 번호 없는 미배정 학생이 맨 뒤가 아니라 맨 앞으로 올라온다.
  const sorted = useMemo(
    () => (sortKey === "net" ? [...rows].sort((a, b) => b.net - a.net) : rows),
    [rows, sortKey],
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.studentProfileId)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 범위를 좁히지 않았으면 번호만으로는 누구인지 모른다 — 학급을 함께 낸다.
  const showClass = classNo === undefined;
  const scopeLabel =
    grade === undefined
      ? "전교"
      : classNo === undefined
        ? `${grade}학년`
        : `${grade}학년 ${classNo}반`;

  if (rows.length === 0) {
    // 비어도 카드 제목을 남긴다 — 제목까지 사라지면 어느 범위가 비었는지 모른다.
    // 부여 폼은 내지 않는다: 고를 학생이 없다.
    return (
      <SectionCard flush title={scopeLabel} hint="0명">
        <EmptyState variant="inside">{scopeLabel}에 학생이 없습니다.</EmptyState>
      </SectionCard>
    );
  }

  const columns: Column<RosterRow>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          key={checkboxKey}
          checked={allSelected}
          onChange={toggleAll}
          label="전체 선택"
        />
      ),
      width: "w-[44px]",
      // 카드에서는 이름 오른쪽에 선다 — 여러 칸을 title로 쌓으면 이름 위에 얹힌다.
      card: "trailing",
      cell: (row) => (
        <Checkbox
          key={checkboxKey}
          checked={selected.has(row.studentProfileId)}
          onChange={() => toggleOne(row.studentProfileId)}
          label={`${honorificName(row.name, "STUDENT")} 선택`}
        />
      ),
    },
    {
      key: "number",
      header: (
        <SortButton
          label="번호"
          hint="번호 낮은 순"
          active={sortKey === "number"}
          onClick={() => setSortKey("number")}
        />
      ),
      // 정렬 상태는 <th>의 속성이라 위 <button>으로 내려보낼 수 없다.
      // 정렬 중이 아닌 쪽도 "none"을 적는다 — 없으면 정렬 가능한 열임이 안 전달된다.
      sort: sortKey === "number" ? "ascending" : "none",
      width: "w-[64px]",
      card: "meta",
      cell: (row) => <span className="tabular-nums text-mut">{row.number ?? "—"}</span>,
    },
    ...(showClass
      ? [
          {
            key: "class",
            header: "학급",
            width: "w-[92px]",
            card: "meta" as const,
            // 반이 없는 학생도 명단에 남는다 — 그 자리를 빈칸이 아니라 말로 채운다.
            cell: (row: RosterRow) => (
              <span className="text-mut">
                {row.grade === null || row.classNo === null
                  ? "미배정"
                  : `${row.grade}-${row.classNo}`}
              </span>
            ),
          } satisfies Column<RosterRow>,
        ]
      : []),
    {
      key: "name",
      header: "이름",
      card: "title",
      cell: (row) => (
        <Link
          href={`/students/${row.studentProfileId}?track=${track}`}
          className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink lg:min-h-0"
        >
          {honorificName(row.name, "STUDENT")}
        </Link>
      ),
    },
    {
      key: "merit",
      header: "상점",
      width: "w-[70px]",
      cell: (row) => <span className="font-medium text-blue">{row.merit}</span>,
    },
    {
      key: "demerit",
      header: "벌점",
      // 기준을 넘긴 칸은 테두리가 붙어 18px 넓어진다 — 세 자리 수가 상쇄 열을
      // 밀지 않게 상점 열보다 넓게 잡는다.
      width: "w-[84px]",
      card: "meta",
      cell: (row) => <DemeritCell thresholds={thresholds} demerit={row.demerit} />,
    },
    {
      // 상쇄 열은 0이어도 항상 낸다 — 상점 − 벌점이 순점수와 안 맞아 보이면 표를 의심하게 된다.
      key: "offset",
      header: "상쇄",
      width: "w-[74px]",
      cell: (row) => (
        <span
          className={`font-medium ${row.offset === 0 ? "text-mut2" : "text-green"}`}
        >
          {row.offset}
        </span>
      ),
    },
    {
      key: "net",
      header: (
        <SortButton
          label="순점수"
          hint="순점수 높은 순"
          active={sortKey === "net"}
          onClick={() => setSortKey("net")}
        />
      ),
      sort: sortKey === "net" ? "descending" : "none",
      width: "w-[96px]",
      card: "meta",
      cell: (row) => (
        <span
          className={`font-medium ${row.net >= 0 ? "text-green" : "text-rose"}`}
        >
          {signedNet(row.net)}
        </span>
      ),
    },
  ];

  const chosen = rows.filter((row) => selected.has(row.studentProfileId));
  // 아무도 안 골랐으면 부여 칸은 눌러 봐야 아무 일도 없다. 흐리게 덮고 무엇을
  // 먼저 해야 하는지 적는다 — 잠긴 버튼만으로는 「왜 안 눌리지」가 된다.
  const noneChosen = selected.size === 0;

  return (
    /*
      `display: contents` — 이 폼은 자기 상자를 그리지 않고 두 칸을 바깥 격자에
      곧장 넘긴다. 고른 학생 상태를 명단과 부여 칸이 나눠 쓰므로 한 컴포넌트가
      소유해야 하는데, 격자 칸은 따로 서야 해서다. 폼 소유 관계는 DOM 관계라
      배치와 무관하게 그대로 산다.
    */
    <form action={formAction} className="contents">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="studentProfileIds" value={id} />
      ))}

      {/* 왼쪽 — 명단. 반 고르기 아래에 선다. */}
      <div className="order-2 @4xl:col-start-1 @4xl:row-start-2">
        <SectionCard
          flush
          title={scopeLabel}
          hint={`${rows.length}명`}
          aside={
            // 파일 이름이 「1학년3반」이라 한 반을 고른 때만 낼 수 있다.
            grade !== undefined && classNo !== undefined ? (
              <ExportButton grade={grade} classNo={classNo} track={track} year={year} />
            ) : undefined
          }
        >
          <DataTable
            minWidth={548}
            narrow="cards"
            rows={sorted}
            rowKey={(row) => row.studentProfileId}
            columns={columns}
          />
        </SectionCard>

        {/* 한 단으로 접힌 화면의 바로가기. 명단 안에서는 아래에 있는 부여 칸이
            보이지 않으므로 선택이 생긴 동안만 화면 아래에 붙잡아 둔다. 넓은 화면은
            오른쪽 sticky 패널이 이미 같은 역할을 하므로 그리지 않는다. */}
        {!viewingPast && selected.size > 0 && (
          <div className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-card border border-pri-line bg-surface px-4 py-3 shadow-float lg:bottom-4 @4xl:hidden">
            <p className="text-caption font-medium text-ink" role="status">
              {selected.size}명 선택됨
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                awardPanelRef.current?.scrollIntoView({ block: "start" });
                awardPanelRef.current?.focus({ preventScroll: true });
              }}
            >
              부여 설정으로
            </Button>
          </div>
        )}
      </div>

      {/*
        오른쪽 — 부여. 넓은 화면에서는 스크롤을 따라온다(명단이 길어도 화면에 남는다).
        **좁은 화면에서는 맨 아래다.** 한 단으로 접히면 순서가 곧 할 일의 차례인데,
        고를 학생도 없는 상태에서 부여 칸이 먼저 나오면 첫 화면이 흐리게 덮인
        「대상 학생을 먼저 추가하세요」로 시작한다.
      */}
      <div
        ref={awardPanelRef}
        tabIndex={-1}
        className="order-3 scroll-mt-4 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink @4xl:col-start-2 @4xl:row-start-1 @4xl:row-span-2 @4xl:sticky @4xl:top-4"
      >
        {viewingPast ? (
          <SectionCard variant="panel" title="상벌점 부여" headingLevel={3}>
            {/* 지난 학년도를 보고 있으면 폼을 감춘다 — 부여는 현재 학년도로만 들어간다. */}
            <Note tone="warn">부여는 현재 학년도에만 할 수 있습니다.</Note>
          </SectionCard>
        ) : (
          <SectionCard
            variant="panel"
            title="상벌점 부여"
            headingLevel={3}
            aside={
              <span className="text-xs font-medium text-mut">
                {selected.size}명 선택됨
              </span>
            }
          >
            <div className="relative">
              <div
                className={
                  noneChosen
                    ? "space-y-2.5 blur-[2px] select-none"
                    : "space-y-2.5"
                }
                // 흐린 동안은 탭으로도 닿지 않는다. pointer-events만 막으면
                // 키보드로는 그대로 들어가 보이지 않는 칸에 글자를 넣게 된다.
                inert={noneChosen}
              >
                {/* 카드 목록에는 표 머리글이 없다 — 전체 선택을 여기 다시 낸다. */}
                <CheckboxField
                  key={checkboxKey}
                  label="전체 선택"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="@4xl:hidden"
                />

                <RulePicker rules={rules} onChange={setRule} />

                {/* 실패 상태가 실어 온 제출값을 defaultValue로 내려보낸다 —
                    자동 reset이 메모를 지우는 대신 그 값으로 되돌린다. */}
                <Input
                  ref={noteRef}
                  name="note"
                  placeholder="메모 (선택)"
                  aria-label="메모"
                  defaultValue={state.note ?? ""}
                />

                {/* 제출하지 않는다 — 확인창을 연다. 이름은 확인창의 버튼과 같다. */}
                <Button
                  type="button"
                  full
                  disabled={pending || noneChosen || !rule}
                  onClick={() => {
                    setConfirmNote(noteRef.current?.value.trim() ?? "");
                    setConfirmError(null);
                    setConfirmOpen(true);
                  }}
                >
                  부여
                </Button>

                {/* 고른 사람을 여기서도 보여준다 — 확인창을 열기 전에 잘못 고른
                    것이 눈에 띄어야 한다. 명단은 옆에 있고 체크는 흩어져 있다. */}
                {chosen.length > 0 && (
                  <ChosenList students={chosen} showClass={showClass} />
                )}
              </div>

              {noneChosen && (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-caption font-medium text-mut">
                  대상 학생을 먼저 추가하세요
                </p>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {state.error && (
        <Note tone="error" className="order-4 @4xl:col-span-2">
          {state.error}
        </Note>
      )}

      {/* 폼 안에 둔다 — 확인 버튼이 이 폼을 제출한다. */}
      {rule && (
        <AwardConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          rule={rule}
          note={confirmNote}
          students={chosen}
          showClass={showClass}
          scopeLabel={scopeLabel}
          pending={pending}
          error={confirmError}
          onConfirm={() => setSubmitted({ ...rule, count: selected.size })}
        />
      )}

      <AwardSuccessDialog result={success} onClose={() => setSuccess(null)} />
    </form>
  );
}

/**
 * 고른 학생 목록. 명단에서 체크한 것이 부여 칸에도 보여야 한다 — 명단이 길면
 * 체크가 화면 밖으로 흩어져 몇 명인지만으로는 확인이 안 된다.
 *
 * 비었을 때는 그리지 않는다 — 아무도 안 골랐으면 부여 칸 전체가 덮여 있다.
 *
 * 길어지면 스크롤한다. 부여 칸 전체가 늘어나면 스크롤을 따라오는 의미가 없다.
 */
function ChosenList({
  students,
  showClass,
}: {
  students: RosterRow[];
  showClass: boolean;
}) {
  return (
    <ul className="max-h-52 divide-y divide-line2 overflow-y-auto rounded-card border border-line">
      {students.map((student) => (
        <li
          key={student.studentProfileId}
          className="flex items-center gap-2.5 px-4 py-2 text-caption"
        >
          <span className="flex shrink-0 items-baseline gap-2 text-xs text-mut2">
            {/* 학년을 가로지르는 목록에서는 학번이 그대로 신원이다. 반이 이미
                고정된 목록에서는 번호만으로 갈리므로 학번까지 적지 않는다. */}
            {showClass ? (
              <span className="w-10 tabular-nums">
                {formatSeat(student) ?? "미배정"}
              </span>
            ) : (
              <span className="w-5 text-right tabular-nums">
                {student.number ?? "—"}
              </span>
            )}
          </span>
          <TruncatedText
            full={honorificName(student.name, "STUDENT")}
            className="font-medium text-ink"
          >
            {honorificName(student.name, "STUDENT")}
          </TruncatedText>
        </li>
      ))}
    </ul>
  );
}

/**
 * 정렬 가능한 머리글. 조작 대상이 <button>이라야 탭 이동과 Enter·Space가 통한다.
 * 정렬 상태 자체는 바깥 <th>의 aria-sort가 알린다.
 */
function SortButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  /** 눌렀을 때 어떤 순서가 되는지. 화면에는 안 보이고 이름에만 붙는다. */
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — ${hint}으로 정렬`}
      className={`-mx-2 -my-1 rounded-btn px-2 py-2.5 font-medium transition-colors hover:text-ink ${
        active ? "text-ink underline decoration-line-strong underline-offset-2" : ""
      }`}
    >
      {label}
    </button>
  );
}
