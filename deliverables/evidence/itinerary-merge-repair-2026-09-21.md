# Merge repair, 21 September 2026

Pulled merged main at `c2011b5` and reproduced `npm run check` failing in TypeScript. The merge combined
multi-stay preferences with itinerary repair incompletely: it dropped the `ProposalError` import, left two
benchmark fixture references to the removed single accommodation property, and selected the older strict
prompt and pace field instead of the practical planning prompt.

Restored the repair error import and migrated live benchmark fixtures to the accommodations array. Added
itinerary-v4, preserving v3 practical planning and explaining the per-date accommodation travel node. The
existing dated-stay travel calculations remain intact. Removed unused legacy pace counters. Updated regression
assertions to check practical planning and multi-stay context together. Frozen benchmark evidence is unchanged;
its v3 measurements do not measure v4. Changed the validation script invocation to python3 so the complete
check command works on this Mac and CI.

Validation: `npm run check` passes, including all workspace typechecks, 466 tests across 38 files, generated API
document consistency, and planning/link validation. No model/network benchmark rerun or database mutation.
