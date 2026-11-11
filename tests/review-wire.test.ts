import { describe, expect, it } from "vitest"
import { kitBuildEnv } from "../src/review-wire"

describe("kitBuildEnv", () => {
  const base = {
    PATH: "/bin",
    HOME: "/h",
    DEEPSEEK_API_KEY: "x",
    TYPESAFE_API_KEY: "x",
    ANTHROPIC_API_KEY: "x",
    CASCADE_API_URL: "x",
    TMPDIR: "old",
  }

  it("removes the four names and keeps PATH and HOME", () => {
    const env = kitBuildEnv(base, {})
    for (const name of ["DEEPSEEK_API_KEY", "TYPESAFE_API_KEY", "ANTHROPIC_API_KEY", "CASCADE_API_URL"]) {
      expect(name in env).toBe(false)
    }
    expect(env.PATH).toBe("/bin")
    expect(env.HOME).toBe("/h")
  })

  it("lets the overrides win and does not mutate the input", () => {
    const copy = { ...base }
    const env = kitBuildEnv(base, { TMPDIR: "new", CARGO_TARGET_DIR: "t", ANDROID_HOME: "a" })
    expect(env.TMPDIR).toBe("new")
    expect(env.CARGO_TARGET_DIR).toBe("t")
    expect(env.ANDROID_HOME).toBe("a")
    expect(base).toEqual(copy)
  })
})
