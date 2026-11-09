import { describe, expect, it } from "vitest"
import { nodeJevProvider } from "../src/jev-wire"
import { generatePacket } from "../src/pipeline"
import { deepseekProvider } from "../src/provider"

const describeLive = process.env.CASCADE_LIVE_PROBE === "1" ? describe : describe.skip

describeLive("v4 live provider probe", () => {
  it("reaches gate-clean on the Wayland GTK4 preset", async () => {
    const idea = [
      "Harbor Sort helps people organize downloads into named folders.",
      "Users preview a file before moving it, undo the last move, and search by filename.",
      "The app should stay responsive, keep actions local, and recover cleanly after restart.",
    ].join(" ")
    const result = await generatePacket({
      requestId: `live-v4-${crypto.randomUUID()}`,
      idea,
      presetId: "linux-wayland-gtk4-desktop",
      model: "deepseek-flash",
      apiUrl: process.env.CASCADE_API_URL || "https://api.deepseek.com/responses",
      apiKey: process.env.DEEPSEEK_API_KEY!,
      jevApiKey: process.env.TYPESAFE_API_KEY,
      atomicAuditor: Boolean(process.env.TYPESAFE_API_KEY),
    }, deepseekProvider, undefined, process.env.TYPESAFE_API_KEY ? nodeJevProvider : undefined)

    if (result.status !== "gate-clean" || result.repairedIssues) {
      console.log(JSON.stringify({
        status: result.status,
        failure: result.failure,
        issues: result.issues,
        repairedIssues: result.repairedIssues,
      }, null, 2))
    }
    expect(result.status).toBe("gate-clean")
    expect(result.exportable).toBe(true)
    expect(result.packet?.documents["PRD.md"].length).toBeGreaterThan(200)
  }, 660_000)
})
