import { endAdminSession } from "@/lib/adminAuth";
import { handleError, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await endAdminSession();
    return ok({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
