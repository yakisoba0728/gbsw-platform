import { redirect } from "next/navigation";
import { hrefWith, type SearchParamsInput } from "@/lib/search-params";

export default async function RulesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams) as SearchParamsInput;
  redirect(hrefWith("/merit/stats", raw, { view: "rules" }));
}
