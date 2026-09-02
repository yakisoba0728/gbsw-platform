import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { honorificName } from "@/core/authz/roles";
import { getMyStudentQr } from "@/modules/pass/request.service";
import { StudentQr } from "./student-qr";

export const metadata: Metadata = { title: "학생증" };

export default async function StudentQrPage() {
  const actor = await requireAuth();

  let initial: Awaited<ReturnType<typeof getMyStudentQr>>;
  try {
    initial = await getMyStudentQr(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/pass">출입증</BackLink>

      <section className={cardClass("page", "mt-3 text-center")}>
        <h2 className="text-title font-semibold text-ink">
          {honorificName(actor.name, "STUDENT")}
        </h2>
        <p className="mt-1 text-caption text-mut">학생증</p>

        <div className="mt-6">
          <StudentQr initial={initial} />
        </div>
      </section>
    </div>
  );
}
