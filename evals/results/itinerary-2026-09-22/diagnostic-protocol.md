# Exploratory Gemini request compatibility check

Planned during the main run, after its first five Gemini calls produced no usable output. This is troubleshooting, not a preregistered model ranking or replacement of failed main trials. Run only after the main calls finish to avoid concurrency confounding.

Two additional full-day calls, temperature 0.2, minimal thinking, 8,000 tokens, 90-second deadline, no repair:

1. Native schema normalized by changing const to enum and omitting schema declaration, string patterns and length bounds. Keep application validation against the original strict schema.
2. JSON MIME mode without native responseJsonSchema, with the original schema included in the input text.

Preserve both responses/errors and original strict scoring. Neither result may replace or be pooled with the native-schema main sample. A generic HTTP 400 cannot by itself identify the unsupported keyword; even success would only justify a subsequent controlled adapter study. Quota/service failures remain unresolved external constraints.
