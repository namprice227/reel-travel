import { dispatch } from "@/server/http/router";

// All /api/* requests go through the contract router. Add endpoints in packages/contracts, not here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
