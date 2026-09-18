# Member 4: Render Free worker

User requested Render Free after the earlier local-worker deployment.

## Implementation and local checks

- Free Node web service with a public health-only endpoint; existing isolated Supabase job polling is reused.
- Saves, screenshots, retries and added details trigger a bounded after-response wake. No user data or
  credentials are sent to the health endpoint. Queue persistence is independent of wake success.
- No periodic keep-alive. Idle sleep and interrupted-job recovery limitations are documented.
- `npm run check`: PASS, 287 tests across 23 files; typechecks, generated API reference and planning validation pass.
- Eight new offline checks cover health access, shutdown, delayed dispatch, no-worker mode, unsafe origins,
  timeout and unavailable-host handling.
- Render Blueprint validates against the official JSON schema; AJV ignored URI format validation.

## Deployment

Prepared, not yet verified on Render. Cold wake, live crash recovery and hosted import evidence are pending.
Human review of transcription and place accuracy is not established by automated checks.
