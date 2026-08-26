import { permanentRedirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

/**
 * 옛 주소. 상벌점과 출입증이 한 학생을 두 화면에 흩어 놓고 있어
 * `/students/<id>?tab=`으로 모으면서 자리를 옮겼다.
 *
 * 남겨 두는 이유는 셋이다 — 교사가 북마크한 주소, 이미 나간 링크, 그리고
 * `revalidatePath("/merit/students/<id>")`를 부르는 액션. 지우면 조용히 404가 된다.
 * 트랙·학년도 같은 조건은 그대로 들고 넘어간다.
 *
 * 308이다(307이 아니라) — 이 주소가 돌아올 계획이 없다.
 */
export default async function StudentMeritRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { studentId } = await params;
  const raw = (await searchParams) as SearchParamsInput;
  permanentRedirect(hrefWith(`/students/${studentId}`, raw, { tab: "merit" }));
}
