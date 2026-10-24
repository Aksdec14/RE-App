import { z } from "zod";
import {
  assertAdminConfigured,
  checkAdminPassword,
  startAdminSession,
} from "@/lib/adminAuth";
import { AppError } from "@/lib/errors";
import { handleError, ok, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1, "Enter the admin password"),
});

export async function POST(request: Request) {
  try {
    assertAdminConfigured();
    const { password } = schema.parse(await readJson(request));
    if (!checkAdminPassword(password)) {
      throw new AppError("Incorrect admin password", 401);
    }
    await startAdminSession();
    return ok({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
