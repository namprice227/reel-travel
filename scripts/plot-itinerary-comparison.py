"""Render the measured comparison; requires matplotlib. No manual result values."""
import json
import sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

folder = Path(sys.argv[1])
summary = json.loads((folder / "summary.json").read_text())["summary"]
keys = ["openai", "openai_small", "gemini", "ollama", "baseline"]
labels = ["GPT-4.1 mini", "GPT-4o mini", "Gemini 3.6 Flash", "Qwen3 4B / Ollama", "Greedy baseline"]
x = np.arange(len(keys))
fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), gridspec_kw={"width_ratios": [1.5, 1]})
for offset, field, label, color in [(-.2, "finalAccepted", "Accepted schedule", "#3658a4"), (.2, "usefulRuns", "Useful-plan proxy", "#27a58b")]:
    values = [summary[k][field] / summary[k]["feasibleRuns"] * 100 for k in keys]
    bars = axes[0].bar(x + offset, values, .38, label=label, color=color)
    for bar, k in zip(bars, keys):
        axes[0].text(bar.get_x() + bar.get_width()/2, bar.get_height()+2,
                     f'{summary[k][field]}/{summary[k]["feasibleRuns"]}', ha="center", fontsize=8)
axes[0].set_ylim(0, 118)
axes[0].set_ylabel("Feasible scenarios (%)")
axes[0].set_xticks(x, labels, rotation=25, ha="right")
axes[0].legend(loc="upper left", fontsize=8)
axes[0].set_title("Delivery and usefulness")
latencies = [summary[k]["successfulLatencyMedianMs"] for k in keys]
for i, value in enumerate(latencies):
    if value is None:
        axes[1].text(.5, i, "No accepted feasible plan", va="center", fontsize=8)
    else:
        axes[1].barh(i, value/1000, color="#3658a4")
        axes[1].text(value/1000+.5, i, ("<0.001s" if value < 1 else f"{value/1000:.2f}s"), va="center", fontsize=8)
axes[1].set_yticks(x, labels)
axes[1].invert_yaxis()
axes[1].set_xlim(0, max([v/1000 for v in latencies if v is not None]+[1])*1.3)
axes[1].set_xlabel("Seconds; accepted feasible runs only")
axes[1].set_title("Median time to an accepted plan")
for ax in axes:
    ax.spines[["top", "right"]].set_visible(False)
fig.suptitle("Reel Travel · itinerary v5 model comparison", fontsize=15, fontweight="bold")
fig.text(.02, .015, "One run per synthetic case; 90s/call, 150s total. Not production SLA. Proxy ≠ human-rated quality. Errors excluded only from latency panel.", fontsize=8)
fig.tight_layout(rect=(0, .065, 1, .94))
fig.savefig(folder / "comparison.svg", bbox_inches="tight")
fig.savefig(folder / "comparison.png", dpi=160, bbox_inches="tight")
