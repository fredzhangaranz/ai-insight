import { describe, it, expect } from "vitest";
import {
  extractUserIdFromSession,
  isValidUserId,
} from "../extract-user-id";

describe("extractUserIdFromSession", () => {
  it("extracts user ID from session object", () => {
    const session = { user: { id: "42" } };
    const userId = extractUserIdFromSession(session);
    expect(userId).toBe(42);
  });

  it("handles numeric user IDs", () => {
    const session = { user: { id: 42 } };
    const userId = extractUserIdFromSession(session);
    expect(userId).toBe(42);
  });

  it("throws when session is null", () => {
    expect(() => extractUserIdFromSession(null)).toThrow(
      "No user ID in session"
    );
  });

  it("throws when user object is missing", () => {
    const session = { other: {} };
    expect(() => extractUserIdFromSession(session)).toThrow(
      "No user ID in session"
    );
  });

  it("throws when user ID is missing", () => {
    const session = { user: {} };
    expect(() => extractUserIdFromSession(session)).toThrow(
      "No user ID in session"
    );
  });

  it("throws when user ID is not a valid number", () => {
    const session = { user: { id: "not-a-number" } };
    expect(() => extractUserIdFromSession(session)).toThrow(
      "Invalid user ID format"
    );
  });

  it("throws when user ID is zero or negative", () => {
    const session = { user: { id: "0" } };
    expect(() => extractUserIdFromSession(session)).toThrow(
      "Invalid user ID format"
    );

    const negativeSession = { user: { id: "-5" } };
    expect(() => extractUserIdFromSession(negativeSession)).toThrow(
      "Invalid user ID format"
    );
  });
});

describe("isValidUserId", () => {
  it("returns true for valid user IDs", () => {
    expect(isValidUserId(1)).toBe(true);
    expect(isValidUserId(42)).toBe(true);
    expect(isValidUserId(9999)).toBe(true);
  });

  it("returns false for invalid IDs", () => {
    expect(isValidUserId(0)).toBe(false);
    expect(isValidUserId(-5)).toBe(false);
    expect(isValidUserId(1.5)).toBe(false);
    expect(isValidUserId("42")).toBe(false);
    expect(isValidUserId(null)).toBe(false);
    expect(isValidUserId(undefined)).toBe(false);
    expect(isValidUserId(NaN)).toBe(false);
  });
});
