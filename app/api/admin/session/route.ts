import { hasAdminSession } from "@/lib/adminAuth";
import { handleError, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ authenticated: await hasAdminSession() });
  } catch (error) {
    return handleError(error);
  }
}
