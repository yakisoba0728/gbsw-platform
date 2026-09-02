import { notFound, redirect } from "next/navigation";
import { ForbiddenError } from "@/core/authz/errors";
import { CommunityError } from "@/modules/community/community.error";

export async function orDenied<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/forbidden");
    if (error instanceof CommunityError && error.message.endsWith("NOT_FOUND")) {
      notFound();
    }
    throw error;
  }
}
