"use client";

import { useState } from "react";
import { ApiError } from "./api-client";

/** busy/error/done state for a button or form that calls one or more endpoints. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await action();
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL", e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, done, run };
}
