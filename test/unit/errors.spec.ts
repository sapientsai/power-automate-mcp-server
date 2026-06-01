import { describe, expect, it } from "vitest"

import { appErrorToThrowable, authError, configError, flowApiError } from "../../src/errors"

describe("appErrorToThrowable", () => {
  it("renders not_found with a classify keyword and a suggestion", () => {
    const msg = appErrorToThrowable(flowApiError("not_found", "flow abc missing", { status: 404 })).message
    expect(msg).toMatch(/not found/i)
    expect(msg).toContain("HTTP 404")
    expect(msg).toContain("Suggestion:")
  })

  it("renders forbidden so SomaMCP classifies it as auth", () => {
    const msg = appErrorToThrowable(flowApiError("forbidden", "no access")).message
    expect(msg).toMatch(/forbidden/i)
  })

  it("renders rate_limited without a status when absent", () => {
    const msg = appErrorToThrowable(flowApiError("rate_limited", "slow down")).message
    expect(msg).toMatch(/rate limited/i)
    expect(msg).not.toContain("HTTP")
  })

  it("renders auth errors with an auth keyword", () => {
    const msg = appErrorToThrowable(authError("token gone", "expired")).message
    expect(msg).toMatch(/auth error/i)
    expect(msg).toContain("Suggestion:")
  })

  it("renders config errors", () => {
    const msg = appErrorToThrowable(configError("bad env")).message
    expect(msg).toMatch(/configuration error/i)
    expect(msg).toContain("bad env")
  })

  it("flags unsupported_api_drift toward the feedback tool", () => {
    const msg = appErrorToThrowable(flowApiError("unsupported_api_drift", "shape changed")).message
    expect(msg).toMatch(/report_feedback/)
  })
})
