import { expect, test } from "bun:test"
import { Secret } from "@opencode/core/util/secret"

test("encrypts and decrypts credential data", () => {
  const plain = JSON.stringify({ access: "mars_at_test", refresh: "mars_rt_test" })
  const encrypted = Secret.encrypt(plain)
  expect(encrypted).not.toContain("mars_at_test")
  expect(Secret.encrypted(encrypted)).toBe(true)
  expect(Secret.decrypt(encrypted)).toBe(plain)
})
