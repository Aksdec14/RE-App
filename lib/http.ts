import { ZodError } from "zod";
import { AppError } from "./errors";

export function ok<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
) {
  return Response.json(data, { status, headers });
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof AppError) {
    return fail(error.message, error.status);
  }
  if (error instanceof ZodError) {
    return fail(error.issues[0]?.message ?? "Invalid request", 400);
  }
  console.error("[cloud-api]", error);
  return fail("Something went wrong on the server", 500);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("Request body must be valid JSON");
  }
}
