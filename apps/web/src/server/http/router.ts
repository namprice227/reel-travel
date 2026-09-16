import { timingSafeEqual } from "node:crypto";
import {
  endpoints,
  errorHttpStatus,
  type EndpointDefinition,
  type EndpointId,
  type ValidationIssue,
} from "@reel/contracts";
import { after } from "next/server";
import type { z } from "zod";
import { requireUser } from "../auth/session";
import { config } from "../config";
import { AppError } from "../errors";
import { handlers } from "../handlers";

/**
 * The only API entry point. For each request it:
 * 1. matches method + path against packages/contracts `endpoints`
 * 2. checks access (session / worker secret)
 * 3. validates params, query and body with the endpoint's schemas
 * 4. calls the handler registered under the same endpoint id
 * 5. validates the handler's result against the response schema (unknown fields are stripped)
 * 6. converts thrown AppErrors to the ApiErrorBody envelope
 */
export async function dispatch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const { id, def, rawParams } = match(request.method, url.pathname);
    // Cookie-authenticated mutations are same-origin. Non-browser worker/CLI calls have no Origin.
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin && origin !== url.origin) {
      throw new AppError("FORBIDDEN", "Cross-origin requests are not allowed.");
    }

    const user = def.access === "user" ? await requireUser() : null;
    if (def.access === "worker") assertWorker(request);

    const params = parse(def.params, rawParams, "params") ?? {};
    const query = parse(def.query, Object.fromEntries(url.searchParams), "query") ?? {};
    const body = def.body ? parse(def.body, await readBody(request, def), "body") : undefined;

    const handler = handlers[id] as unknown as (ctx: unknown) => Promise<unknown>;
    const result = await handler({
      request,
      params,
      query,
      body,
      user,
      runAfterResponse: (task: () => Promise<unknown>) => after(task),
    });

    if (def.responseKind === "binary") return result as Response;

    const checked = def.response.safeParse(result);
    if (!checked.success) {
      console.error(`[contract] ${id} returned data that does not match its response schema`, checked.error.issues);
      throw new AppError(
        "CONTRACT_VIOLATION",
        config.isProduction ? "The server produced an invalid response." : `${id} response does not match the contract.`,
        config.isProduction ? undefined : { issues: toIssues(checked.error) },
      );
    }
    return Response.json(checked.data, { status: def.successStatus ?? 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

const routes = (Object.entries(endpoints) as Array<[EndpointId, EndpointDefinition]>)
  .map(([id, def]) => {
    const segments = def.path.split("/").filter(Boolean);
    return { id, def, segments, staticSegments: segments.filter((s) => !s.startsWith(":")).length };
  })
  .sort((a, b) => b.staticSegments - a.staticSegments);

function match(method: string, pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  let pathExists = false;
  for (const route of routes) {
    if (route.segments.length !== parts.length) continue;
    const rawParams: Record<string, string> = {};
    const same = route.segments.every((segment, i) => {
      if (!segment.startsWith(":")) return segment === parts[i];
      rawParams[segment.slice(1)] = safeDecode(parts[i]!);
      return true;
    });
    if (!same) continue;
    pathExists = true;
    if (route.def.method === method) return { id: route.id, def: route.def, rawParams };
  }
  throw new AppError(
    "NOT_FOUND",
    pathExists ? `${method} is not supported for ${pathname}.` : `No API endpoint at ${pathname}.`,
  );
}

function parse(schema: z.ZodType | undefined, value: unknown, where: "params" | "query" | "body"): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  if (result.error.issues.some((issue) => issue.code === "too_big" && issue.origin === "file")) {
    throw new AppError("PAYLOAD_TOO_LARGE", "The upload is too large.");
  }
  throw new AppError("VALIDATION_FAILED", `Invalid ${where}.`, { issues: toIssues(result.error, where) });
}

async function readBody(request: Request, def: EndpointDefinition): Promise<unknown> {
  if (def.bodyKind === "form-data") {
    try {
      return Object.fromEntries((await request.formData()).entries());
    } catch {
      throw new AppError("VALIDATION_FAILED", "Expected a multipart/form-data body.", { issues: [] });
    }
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_FAILED", "The request body is not valid JSON.", { issues: [] });
  }
}

function assertWorker(request: Request) {
  const expected = config.workerSecret;
  const given = request.headers.get("x-worker-secret") ?? "";
  const received = Buffer.from(given);
  const configured = Buffer.from(expected ?? "");
  const ok = expected !== null && received.length === configured.length && timingSafeEqual(received, configured);
  if (!ok) throw new AppError("FORBIDDEN", "Missing or wrong worker secret.");
}

function errorResponse(error: unknown): Response {
  const appError = isAppError(error)
    ? error
    : new AppError(
        "INTERNAL",
        config.isProduction ? "Something went wrong." : error instanceof Error ? error.message : String(error),
      );
  if (!isAppError(error)) console.error("[api] unexpected error", error);
  const { code, message, details } = appError;
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (code === "RATE_LIMITED" && details && typeof details === "object" && "retryAfterSeconds" in details
    && typeof details.retryAfterSeconds === "number" && Number.isFinite(details.retryAfterSeconds)) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(details.retryAfterSeconds))));
  }
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: errorHttpStatus[code], headers },
  );
}

// Duck-typed so errors from a hot-reloaded module copy are still recognised.
const isAppError = (error: unknown): error is AppError =>
  error instanceof Error && error.name === "AppError" && "code" in error;

const toIssues = (error: z.ZodError, prefix?: string): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
