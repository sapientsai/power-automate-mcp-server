import { describe, expect, it } from "vitest"

import { confirmWrite, ensureWriteEnabled } from "../../src/tools/shared"

describe("ensureWriteEnabled", () => {
  it("throws an actionable error when write ops are disabled", () => {
    expect(() => ensureWriteEnabled(false, "enable_flow")).toThrow(/ENABLE_WRITE_OPS=true/)
    expect(() => ensureWriteEnabled(false, "enable_flow")).toThrow(/no changes were made/)
  })

  it("is a no-op when write ops are enabled", () => {
    expect(() => ensureWriteEnabled(true, "enable_flow")).not.toThrow()
  })
})

describe("confirmWrite", () => {
  it("produces an ok confirmation with operation + details", () => {
    const parsed = JSON.parse(confirmWrite("disable_flow", { environment: "env1", flow: "f1" }))
    expect(parsed).toEqual({ ok: true, operation: "disable_flow", environment: "env1", flow: "f1" })
  })
})
