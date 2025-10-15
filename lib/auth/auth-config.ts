const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AuthConfig {
  secret: string;
  baseUrl: string;
  sessionMaxAge: number;
  isEnabled: boolean;
}

function resolveAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "test") {
    return "test-auth-secret";
  }

  throw new Error(
    "NEXTAUTH_SECRET is not configured. Set it in your environment before enabling authentication."
  );
}

function resolveBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3005"
  );
}

function resolveSessionMaxAge(): number {
  const value = process.env.NEXTAUTH_SESSION_MAX_AGE;
  if (!value) return DEFAULT_SESSION_MAX_AGE_SECONDS;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `Invalid NEXTAUTH_SESSION_MAX_AGE value "${value}", falling back to ${DEFAULT_SESSION_MAX_AGE_SECONDS}`
    );
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }

  return parsed;
}

export function getAuthConfig(): AuthConfig {
  return {
    secret: resolveAuthSecret(),
    baseUrl: resolveBaseUrl(),
    sessionMaxAge: resolveSessionMaxAge(),
    isEnabled: process.env.AUTH_SYSTEM_ENABLED !== "false",
  };
}

export { DEFAULT_SESSION_MAX_AGE_SECONDS };
