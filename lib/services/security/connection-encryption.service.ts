import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const HEX_KEY_LENGTH = 64; // 32 bytes represented in hex

export class ConnectionEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionEncryptionError";
  }
}

function getRawKey(): string {
  const key = process.env.DB_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new ConnectionEncryptionError("DB_ENCRYPTION_KEY is not set");
  }

  if (key.length !== HEX_KEY_LENGTH || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new ConnectionEncryptionError(
      "DB_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters"
    );
  }

  return key;
}

function getKeyBuffer(): Buffer {
  return Buffer.from(getRawKey(), "hex");
}

export function encryptConnectionString(connectionString: string): string {
  if (!connectionString) {
    throw new ConnectionEncryptionError("Connection string is required");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);

  let encrypted = cipher.update(connectionString, "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
}

export function decryptConnectionString(payload: string): string {
  if (!payload) {
    throw new ConnectionEncryptionError("Encrypted payload is required");
  }

  const [ivHex, encrypted] = payload.split(":");
  if (!ivHex || !encrypted) {
    throw new ConnectionEncryptionError(
      "Encrypted payload must be in the format iv:ciphertext"
    );
  }

  try {
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new ConnectionEncryptionError(
      error instanceof Error ? error.message : "Failed to decrypt connection string"
    );
  }
}

export function maskConnectionString(connectionString: string): string {
  if (!connectionString) {
    return "";
  }

  const visible = Math.min(6, connectionString.length);
  return `${connectionString.slice(0, visible)}...`;
}
