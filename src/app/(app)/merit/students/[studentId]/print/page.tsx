import { permanentRedirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

/** 옛 확인서 주소. 학생 상세를 옮기면서 함께 옮겼다 (상위 page.tsx의 주석 참고). */
export default async function MeritPrintRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { studentId } = await params;
  const raw = (await searchParams) as SearchParamsInput;
  permanentRedirect(hrefWith(`/students/${studentId}/print`, raw));
}
