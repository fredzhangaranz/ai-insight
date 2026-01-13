import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ConnectionEncryptionError,
  decryptConnectionString,
  encryptConnectionString,
  maskConnectionString,
} from "@/lib/services/security/connection-encryption.service";

const ORIGINAL_ENV = process.env;

describe("connection-encryption.service", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DB_ENCRYPTION_KEY = "a".repeat(64);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("encrypts and decrypts connection strings with a valid key", () => {
    const plaintext = "Server=db;Database=demo;User Id=test;Password=secret;";

    const encrypted = encryptConnectionString(plaintext);
    expect(encrypted).toMatch(/^([a-f0-9]{32}):([a-f0-9]+)$/);

    const decrypted = decryptConnectionString(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("throws when encryption key is missing", () => {
    delete process.env.DB_ENCRYPTION_KEY;

    expect(() => encryptConnectionString("Server=db;")).toThrow(ConnectionEncryptionError);
    expect(() => decryptConnectionString("0011:deadbeef")).toThrow(ConnectionEncryptionError);
  });

  it("throws when encryption key has invalid format", () => {
    process.env.DB_ENCRYPTION_KEY = "not-valid";

    expect(() => encryptConnectionString("Server=db;")).toThrow(ConnectionEncryptionError);
  });

  it("throws when encrypted payload is malformed", () => {
    expect(() => decryptConnectionString("badpayload")).toThrow(ConnectionEncryptionError);
    expect(() => decryptConnectionString("gg:zz")).toThrow(ConnectionEncryptionError);
  });

  it("masks connection strings safely", () => {
    expect(maskConnectionString("Server=db;Password=secret")).toBe("Server...");
    expect(maskConnectionString("")).toBe("");
  });
});
