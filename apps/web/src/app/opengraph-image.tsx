import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Link preview uses the bundled user-supplied Routelet logo.
// The day card uses fictional sample stops and says so.

export const alt = "Routelet: saved travel links, notes and screenshots become a day-by-day trip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STOPS = [
  { time: "10:00", title: "Sample garden", note: "Hours not checked" },
  { time: "11:20", title: "Sample gallery", note: "Selected place" },
  { time: "19:30", title: "Sample dinner", note: "Fixed booking" },
];

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/images/routelet-mark.jpg"));
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f7faff", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 620 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700, color: "#2854ed" }}><img src={logoSrc} width={64} height={64} alt="" style={{ marginRight: 14, borderRadius: 12 }} />Routelet</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: "#111827", lineHeight: 1.02, letterSpacing: -2 }}>Your saved places.</div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: "#111827", lineHeight: 1.02, letterSpacing: -2 }}>A trip that works.</div>
            <div style={{ display: "flex", marginTop: 28, fontSize: 30, color: "#5f6b7a", lineHeight: 1.35 }}>
              Links, notes and screenshots become places you choose and days you can edit.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#8a94a3" }}>Sample data · fictional venues</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 24, padding: 32, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#111827" }}>Day 1</div>
              <div style={{ display: "flex", fontSize: 18, color: "#2854ed", background: "#edf2ff", padding: "6px 14px", borderRadius: 999 }}>Sample trip</div>
            </div>
            {STOPS.map((stop) => (
              <div key={stop.time} style={{ display: "flex", alignItems: "center", marginTop: 22 }}>
                <div style={{ display: "flex", width: 84, fontSize: 22, color: "#5f6b7a" }}>{stop.time}</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#111827" }}>{stop.title}</div>
                  <div style={{ display: "flex", fontSize: 19, color: stop.note === "Fixed booking" ? "#2854ed" : "#8a94a3" }}>{stop.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
