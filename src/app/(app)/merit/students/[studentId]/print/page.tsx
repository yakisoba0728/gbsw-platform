import { permanentRedirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

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
