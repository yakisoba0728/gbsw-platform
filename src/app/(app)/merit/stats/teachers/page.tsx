import { redirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

export default async function TeachersRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams) as SearchParamsInput;
  redirect(hrefWith("/merit/stats", raw, { view: "teachers" }));
}
