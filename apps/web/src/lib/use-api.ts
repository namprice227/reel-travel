"use client";

import type { EndpointId, EndpointRequest, EndpointResponse } from "@reel/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api-client";

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replace data after a mutation returns the new state, without refetching. */
  setData: (data: T) => void;
}

const INVALIDATE_EVENT = "reel:api-invalidate";

/**
 * Ask every mounted useApi to fetch again, e.g. after a dialog saved data that the page behind it shows.
 * Only for changes made outside the component that owns the data; prefer setData when the response is at hand.
 */
export function invalidateApi() {
  window.dispatchEvent(new Event(INVALIDATE_EVENT));
}

/**
 * Load an endpoint when the component mounts and whenever the request changes.
 * Pass `null` as the request to wait (e.g. until an id is known).
 * `pollMs` returns a delay to fetch again (e.g. while imports are processing) or false to stop.
 */
export function useApi<Id extends EndpointId>(
  id: Id,
  request: EndpointRequest<Id> | null,
  options: { pollMs?: (data: EndpointResponse<Id>) => number | false } = {},
): ApiState<EndpointResponse<Id>> {
  const [data, setData] = useState<EndpointResponse<Id>>();
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(request !== null);
  const pollMs = useRef(options.pollMs);
  const key = JSON.stringify([id, request]);

  useEffect(() => {
    pollMs.current = options.pollMs;
  });

  const load = useCallback(async () => {
    if (request === null) return;
    try {
      const call = api as unknown as (id: EndpointId, request: unknown) => Promise<EndpointResponse<Id>>;
      setData(await call(id, request));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL", String(e)));
    } finally {
      setLoading(false);
    }
    // `key` captures id and request by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (request === null) return;
    const reload = () => void load();
    window.addEventListener(INVALIDATE_EVENT, reload);
    return () => window.removeEventListener(INVALIDATE_EVENT, reload);
    // `key` captures the request by value, as in `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (!data || !pollMs.current) return;
    const delay = pollMs.current(data);
    if (delay === false) return;
    const timer = setTimeout(() => void load(), delay);
    return () => clearTimeout(timer);
  }, [data, load]);

  return { data, error, loading, reload: load, setData };
}
