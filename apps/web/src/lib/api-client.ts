import { trackApiAction } from "./ga4";
import {
  buildPath,
  endpoints,
  type ApiErrorBody,
  type EndpointDefinition,
  type EndpointId,
  type EndpointRequest,
  type EndpointResponse,
  type ErrorCode,
} from "@reel/contracts";

/** Every failed call throws this. `code` comes from the contract's ErrorCode list. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "NETWORK";
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode | "NETWORK", message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Endpoints without params/body take no second argument. */
type Args<Id extends EndpointId> = {} extends EndpointRequest<Id>
  ? [request?: EndpointRequest<Id>]
  : [request: EndpointRequest<Id>];

export interface ApiClientOptions {
  /** "" in the browser (same origin); e.g. http://localhost:3000 in scripts. */
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

/**
 * Typed client generated from packages/contracts. The endpoint id decides the URL, method,
 * request shape and response type, so the UI can't drift from the server.
 *
 *   const { trip } = await api("trips.get", { params: { tripId } });
 */
export function createApiClient(options: ApiClientOptions = {}) {
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  return async function call<Id extends EndpointId>(id: Id, ...args: Args<Id>): Promise<EndpointResponse<Id>> {
    const def: EndpointDefinition = endpoints[id];
    const request = (args[0] ?? {}) as { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };

    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== null) search.set(key, String(value));
    }
    const url = `${options.baseUrl ?? ""}${buildPath(def.path, request.params)}${search.size ? `?${search}` : ""}`;

    const headers: Record<string, string> = { ...options.headers };
    const init: RequestInit = { method: def.method, headers, credentials: "same-origin" };
    if (def.body) {
      if (def.bodyKind === "form-data") {
        const form = new FormData();
        for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
          if (value !== undefined) form.append(key, value instanceof Blob ? value : String(value));
        }
        init.body = form;
      } else {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(request.body ?? {});
      }
    }

    trackApiAction(id, "start", request.body);
    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      trackApiAction(id, "failure", request.body, undefined, 0);
      throw new ApiError(0, "NETWORK", "Could not reach the server.", cause);
    }

    if (!response.ok) {
      trackApiAction(id, "failure", request.body, undefined, response.status);
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      throw new ApiError(
        response.status,
        body?.error.code ?? "INTERNAL",
        body?.error.message ?? `Request failed (${response.status}).`,
        body?.error.details,
      );
    }
    if (def.responseKind === "binary") return (await response.blob()) as EndpointResponse<Id>;
    const result = (await response.json()) as EndpointResponse<Id>;
    trackApiAction(id, "success", request.body, result);
    return result;
  };
}

export const api = createApiClient();

/** Owner-only screenshot URL for <img src>. */
export const uploadUrl = (assetId: string) => buildPath(endpoints["uploads.get"].path, { assetId });
