import type { ErrorCode, ValidationIssue } from "@reel/contracts";

/** Throw from services; the router turns it into the ApiErrorBody envelope with the mapped HTTP status. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found.`);

export const invalidState = (message: string) => new AppError("INVALID_STATE", message);

export const validationFailed = (message: string, issues: ValidationIssue[] = []) =>
  new AppError("VALIDATION_FAILED", message, { issues });
