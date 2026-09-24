# Worker job-ID repair — 24 September 2026

The supervisor polled both trip and account-reel queues, but its child accepted only job_ IDs. Account jobs use reeljob_, so the child rejected them before claiming them. The same oldest account job could repeatedly block other work. Observed 86 failed child attempts and no successful jobs since the previous restart.

Allow both job_ and reeljob_ prefixes while retaining the alphanumeric suffix check. Added an offline subprocess regression that runs the real worker entry and verifies account IDs reach the account claim RPC; existing trip dispatch and supervisor tests remain intact.

Validation: 8 targeted tests and npm run check (778 tests) passed. Restarted the local worker; an account job reached running and subsequent logs showed a successful import with 12 places and completed child attempts. A separate trip job retried because its transcript failed schema validation; successful dispatch does not imply every provider response is valid. The hosted reel_record_account_reel_format RPC remains absent and requires migration 202609240002_account_reel_format.sql for unsupported-country itinerary handling. No jobs manually marked successful and no queue records edited.
