import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAppBuildLabel } from "../app-build-label";

describe("getAppBuildLabel", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_DATE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns v-prefixed version and sha when both set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.2.0");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "1f90803");
    expect(getAppBuildLabel()).toBe("v0.2.0 (1f90803)");
  });

  it("includes commit date after sha when set", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.2.0");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "1f90803");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_DATE", "25-Mar-2026");
    expect(getAppBuildLabel()).toBe("v0.2.0 (1f90803, 25-Mar-2026)");
  });

  it("does not double-prefix v", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v1.0.0");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "abc");
    expect(getAppBuildLabel()).toBe("v1.0.0 (abc)");
  });

  it("returns only version when sha missing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.0");
    expect(getAppBuildLabel()).toBe("v0.1.0");
  });

  it("returns only sha when version missing", () => {
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "deadbeef");
    expect(getAppBuildLabel()).toBe("deadbeef");
  });

  it("returns sha and date without version when version missing", () => {
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "abc");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_DATE", "1-Jan-2026");
    expect(getAppBuildLabel()).toBe("abc, 1-Jan-2026");
  });

  it("returns empty when neither set", () => {
    expect(getAppBuildLabel()).toBe("");
  });

  it("trims whitespace", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "  1.0.0  ");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_SHA", "  x1  ");
    vi.stubEnv("NEXT_PUBLIC_GIT_COMMIT_DATE", "  2-Feb-2026  ");
    expect(getAppBuildLabel()).toBe("v1.0.0 (x1, 2-Feb-2026)");
  });
});
