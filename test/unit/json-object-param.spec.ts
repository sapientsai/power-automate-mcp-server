import { describe, expect, it } from "vitest"

import { jsonObjectParam } from "../../src/tools/shared"

const schema = jsonObjectParam("test param")

describe("jsonObjectParam", () => {
  it("passes an object through unchanged", () => {
    const obj = { $schema: "x", triggers: {}, actions: {} }
    const result = schema.safeParse(obj)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(obj)
  })

  it("parses a JSON string into an object", () => {
    const result = schema.safeParse('{"contentVersion":"1.0.0.0","actions":{}}')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ contentVersion: "1.0.0.0", actions: {} })
  })

  it("accepts single quotes inside JSON string values (Power Automate expressions)", () => {
    // The reported failure was wrongly blamed on single quotes; they are valid JSON.
    const result = schema.safeParse('{"authentication":"@parameters(\'$authentication\')"}')
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ authentication: "@parameters('$authentication')" })
  })

  it("rejects a malformed JSON string with an actionable message", () => {
    const result = schema.safeParse("{not valid json")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/not valid JSON/)
  })

  it("rejects a JSON string that is an array or primitive", () => {
    const arr = schema.safeParse("[1,2,3]")
    expect(arr.success).toBe(false)
    if (!arr.success) expect(arr.error.issues[0]?.message).toMatch(/must be a JSON object/)

    const prim = schema.safeParse('"just a string"')
    expect(prim.success).toBe(false)
  })
})
