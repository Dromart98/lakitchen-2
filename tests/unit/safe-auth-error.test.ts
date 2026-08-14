import { describe, expect, it } from "vitest";

import {
  GENERIC_AUTH_ERROR_MESSAGE,
  getSafeAuthErrorMessage,
  RATE_LIMIT_AUTH_ERROR_MESSAGE,
} from "@/modules/auth/safe-auth-error";

describe("getSafeAuthErrorMessage", () => {
  it("maps an Auth 429 to the safe wait message", () => {
    const providerError = {
      status: 429,
      message: "Provider detail that must remain private",
    };

    expect(getSafeAuthErrorMessage(providerError)).toBe(
      RATE_LIMIT_AUTH_ERROR_MESSAGE,
    );
    expect(getSafeAuthErrorMessage(providerError)).not.toContain(
      providerError.message,
    );
  });

  it.each([
    { status: 400, message: "Account-specific provider detail" },
    new Error("Technical provider detail"),
    null,
  ])("maps any non-429 error to the safe generic message", (providerError) => {
    expect(getSafeAuthErrorMessage(providerError)).toBe(
      GENERIC_AUTH_ERROR_MESSAGE,
    );
  });
});
