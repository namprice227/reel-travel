import { NextResponse } from "next/server";

// Old clients must refresh metadata through the owner-scoped places.photo contract.
// Never spend provider quota on caller-supplied, potentially expired photo handles.
export async function GET() {
  return NextResponse.json({ error: "PHOTO_ENDPOINT_RETIRED" }, {
    status: 410, headers: { "Cache-Control": "no-store" },
  });
}
