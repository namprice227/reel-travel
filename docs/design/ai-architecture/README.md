# Proposed AI architecture diagrams

These diagrams export the AI design discussed on 17 September 2026. They describe proposed behavior, including library classification and suggested trip assignment; they do not certify implemented AI providers or trip-independent saving.

- [Inspiration pipeline PNG](ai-inspiration-pipeline.png) and [editable Mermaid source](ai-inspiration-pipeline.mmd).
- [Trip assignment PNG](ai-trip-assignment.png) and [editable Mermaid source](ai-trip-assignment.mmd).

Renderer: [official Mermaid CLI](https://github.com/mermaid-js/mermaid-cli), locally installed in `.local/mermaid-tools`. It uses an existing headless Chromium browser; it starts no application server. The browser executable is configured in `.local/mermaid-tools/puppeteer-config.json`; update its path on another machine.

Verified with Mermaid CLI 11.17.0: both render commands completed successfully and both PNGs were visually inspected. Pipeline: 2326×6146 pixels; trip assignment: 1834×3414 pixels. The initial sandboxed browser launches timed out; the exports succeeded with approved Chromium access. Human architecture review is pending.

To export either diagram again, run from the repository root:

```powershell
node .local/mermaid-tools/node_modules/@mermaid-js/mermaid-cli/src/cli.js -i docs/design/ai-architecture/ai-inspiration-pipeline.mmd -o docs/design/ai-architecture/ai-inspiration-pipeline.png -c docs/design/ai-architecture/mermaid-config.json -p .local/mermaid-tools/puppeteer-config.json -b white -s 2 -w 1800
```

For the other diagram, replace both occurrences of `ai-inspiration-pipeline` with `ai-trip-assignment`. PNGs are exported at twice the rendering resolution for readable labels.
