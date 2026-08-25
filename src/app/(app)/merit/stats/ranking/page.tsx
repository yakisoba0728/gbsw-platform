import { redirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

/**
 * 옛 주소. 통계 네 갈래를 `/merit/stats?view=`로 모으면서 자리를 옮겼다.
 * 남겨 두는 이유는 즐겨찾기와 이미 나간 링크다 — 지우면 조용히 404가 된다.
 * 트랙·학년도 같은 조건은 그대로 들고 넘어간다.
 */
export default async function RankingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams) as SearchParamsInput;
  redirect(hrefWith("/merit/stats", raw, { view: "ranking" }));
}
