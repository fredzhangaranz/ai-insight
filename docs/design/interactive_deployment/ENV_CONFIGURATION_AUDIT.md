# Environment Configuration Audit

## Executive Summary

Analyzed all 8 environment variables from your `.env.local`:

- **5 are actively used** and should be included in setup wizard
- **3 are optional/debug** flags (can be auto-generated or skipped in initial setup)

---

## Configuration Variables Analysis

### ✅ REQUIRED - Must be in Setup Wizard

#### 1. `NEXTAUTH_SECRET`

**Status:** ✅ **ACTIVELY USED**

- **Location:** `lib/auth/auth-config.ts:11`
- **Purpose:** NextAuth.js session encryption secret
- **Requirements:** Must be a strong random string (≥32 bytes recommended)
- **Impact:** If missing, auth system throws error
- **Setup Action:** Auto-generate 32-byte hex string during setup
- **Format:** Hex string (64 characters = 32 bytes)

#### 2. `NEXTAUTH_URL`

**Status:** ✅ **ACTIVELY USED** (with fallback)

- **Location:** `lib/auth/auth-config.ts:25-27`
- **Purpose:** Public URL for NextAuth callbacks
- **Requirements:** Must match where app is deployed
- **Fallback:** Uses `NEXT_PUBLIC_APP_URL` or defaults to `http://localhost:3005`
- **Impact:** Critical for production, optional for beta
- **Setup Action:**
  - Beta: Auto-set to `http://localhost:3005`
  - Production: Ask user for their deployment URL

#### 3. `DB_ENCRYPTION_KEY`

**Status:** ✅ **ACTIVELY USED**

- **Location:** `lib/services/security/connection-encryption.service.ts:15-26`
- **Purpose:** Encrypts Silhouette database connection strings stored in app
- **Requirements:** Exactly 64 hex characters (32 bytes in hex format)
- **Validation:** Strict format checking in `connection-encryption.service.ts`
- **Impact:** Without this, cannot decrypt stored Silhouette connections
- **Setup Action:** Auto-generate 32-byte random hex string
- **Format:** Hex string (64 characters = 32 bytes)
- **Algorithm:** AES-256-CBC

#### 4. `ENTITY_HASH_SALT`

**Status:** ✅ **ACTIVELY USED**

- **Location:** `lib/services/__tests__/phi-protection.test.ts` (multiple uses)
- **Purpose:** Salt for hashing PII/entity identifiers (PHI protection)
- **Requirements:** String value used as hash salt
- **Validation:** No strict format, any string works but should be random
- **Impact:** Used for consistent hashing of sensitive data
- **Setup Action:** Auto-generate 32-character random string
- **Security Note:** Changing this invalidates all existing hashes (cannot re-use old hash values)

#### 5. `AUTH_SYSTEM_ENABLED`

**Status:** ✅ **ACTIVELY USED**

- **Location:** `lib/auth/auth-config.ts:51`
- **Purpose:** Toggle authentication on/off
- **Requirements:** String value ("true" or "false")
- **Default:** "true" (enabled by default, only disable if ="false")
- **Impact:** Controls whether app requires login
- **Setup Action:** Ask user if they want auth enabled
- **Recommended:**
  - Beta: Optional (can run without auth for testing)
  - Production: Should be enabled ("true")

---

### ⚠️ OPTIONAL - Auto-enable/Configure, Not Required in Setup

#### 6. `LOG_LLM_PROMPTS`

**Status:** ⚠️ **OPTIONAL DEBUG FLAG**

- **Location:** 5 files (base-provider, gemini-provider, claude-provider, sql-composer)
- **Purpose:** Enable verbose logging of LLM prompts (for debugging AI outputs)
- **Requirements:** String value ("true" to enable)
- **Impact:** Only affects console logging, no functional impact
- **Setup Action:**
  - Beta: Ask user if they want to enable logging
  - Production: Set to "false" by default
  - Can be changed post-setup in `.env.local`

#### 7. `DEBUG_COMPOSITION`

**Status:** ⚠️ **OPTIONAL DEBUG FLAG**

- **Location:** 10+ places (api routes, gemini-provider)
- **Purpose:** Enable verbose debugging of SQL composition logic
- **Requirements:** String value ("true" to enable)
- **Impact:** Only affects console output, no functional impact
- **Setup Action:**
  - Beta: Ask user if they want debug output
  - Production: Set to "false" by default
  - Can be changed post-setup in `.env.local`

---

### ℹ️ SUPPLEMENTARY - Already Handled or Auto-Derived

#### 8. `NEXTAUTH_SESSION_MAX_AGE`

**Status:** ℹ️ **OPTIONAL WITH DEFAULT**

- **Location:** `lib/auth/auth-config.ts:31-43`
- **Purpose:** Session timeout in seconds
- **Default:** 604800 (7 days) if not specified
- **Requirements:** Integer seconds
- **Setup Action:** **Skip in wizard** (default is good for most cases)
- **Can be overridden:** Post-setup in `.env.local` if needed
- **Your value:** "604800" matches the default, no need to prompt

---

## Summary Table

| Variable                   | Used   | Type           | Required?   | Setup Action                          | Auto-Generate?       |
| -------------------------- | ------ | -------------- | ----------- | ------------------------------------- | -------------------- |
| `NEXTAUTH_SECRET`          | ✅ Yes | string         | ✅ YES      | Prompt for or auto-generate           | ✅ YES (recommended) |
| `NEXTAUTH_URL`             | ✅ Yes | URL            | ✅ YES      | Auto-set beta, ask production         | ✅ YES (conditional) |
| `DB_ENCRYPTION_KEY`        | ✅ Yes | hex (64 chars) | ✅ YES      | Auto-generate                         | ✅ YES (mandatory)   |
| `ENTITY_HASH_SALT`         | ✅ Yes | string         | ✅ YES      | Auto-generate                         | ✅ YES (mandatory)   |
| `AUTH_SYSTEM_ENABLED`      | ✅ Yes | boolean        | ⚠️ OPTIONAL | Ask user, default "true"              | ❌ NO (ask)          |
| `LOG_LLM_PROMPTS`          | ✅ Yes | boolean        | ❌ NO       | Ask user (beta only), default "false" | ❌ NO (ask)          |
| `DEBUG_COMPOSITION`        | ✅ Yes | boolean        | ❌ NO       | Ask user (beta only), default "false" | ❌ NO (ask)          |
| `NEXTAUTH_SESSION_MAX_AGE` | ✅ Yes | integer        | ❌ NO       | Skip (use default)                    | ❌ NO (skip)         |

---

## Security Recommendations

### Key Generation Requirements

**For `NEXTAUTH_SECRET` and `DB_ENCRYPTION_KEY`:**

```bash
# Generate secure 32-byte hex string (64 characters)
openssl rand -hex 32
# Example output: a1b2c3d4e5f6... (64 chars)
```

**For `ENTITY_HASH_SALT`:**

```bash
# Generate random string for salt
openssl rand -base64 32
# Or use hex:
openssl rand -hex 32
```

### Implementation in Wizard

Recommend adding helper function:

```typescript
function generateSecureHex(bytes: number): string {
  return require("crypto").randomBytes(bytes).toString("hex");
}

// During setup:
NEXTAUTH_SECRET = generateSecureHex(32); // 64-char hex
DB_ENCRYPTION_KEY = generateSecureHex(32); // 64-char hex
ENTITY_HASH_SALT = generateSecureHex(16); // 32-char hex (less strict)
```

### Rotation Policy

| Key                 | Rotation Impact                   | Strategy                           |
| ------------------- | --------------------------------- | ---------------------------------- |
| `NEXTAUTH_SECRET`   | Logs out all users                | Acceptable if rare                 |
| `DB_ENCRYPTION_KEY` | Cannot decrypt stored connections | ❌ DON'T ROTATE without migration  |
| `ENTITY_HASH_SALT`  | Invalidates PII hashes            | ❌ DON'T ROTATE without re-hashing |

---

## Wizard Flow Recommendation

### Beta Setup (`pnpm setup:beta`)

```
1. Database Configuration
   └─ Auto-detect or start Docker

2. AI Providers Configuration
   └─ Ask for API keys

3. Admin User Setup
   └─ Username, email, password

4. Security Configuration (NEW)
   ├─ 🔐 NEXTAUTH_SECRET (auto-generate with option to provide own)
   ├─ 🔐 DB_ENCRYPTION_KEY (auto-generate with option to provide own)
   ├─ 🔐 ENTITY_HASH_SALT (auto-generate with option to provide own)
   ├─ Enable auth? (default: yes)
   └─ Debug options? (optional)
       ├─ Log LLM prompts? (y/n)
       └─ Debug composition? (y/n)

5. Running Setup
   └─ Migrate, seed, etc.
```

### Production Setup (`pnpm setup:production`)

```
1. Database Configuration
   └─ Manual entry required

2. AI Providers Configuration
   └─ Ask for API keys

3. Admin User Setup
   └─ Username, email, password

4. Security Configuration (NEW)
   ├─ 🔐 NEXTAUTH_SECRET (ask for custom or auto-generate)
   ├─ NEXTAUTH_URL (ask for public URL)
   ├─ 🔐 DB_ENCRYPTION_KEY (ask for custom or auto-generate)
   ├─ 🔐 ENTITY_HASH_SALT (ask for custom or auto-generate)
   ├─ Enable auth? (recommend: yes)
   └─ Debug options? (disable by default)

5. Running Setup
   └─ Migrate, seed, etc.
```

---

## Testing Checklist

After implementing, verify:

- [ ] `NEXTAUTH_SECRET` generated is 64 hex characters
- [ ] `DB_ENCRYPTION_KEY` generated is 64 hex characters
- [ ] `ENTITY_HASH_SALT` generated is at least 16 characters
- [ ] Keys work with their respective encryption/hashing functions
- [ ] Auth system works with generated `NEXTAUTH_SECRET`
- [ ] `.env.local` can be committed to repo without secrets (use .example)
- [ ] Setup can be re-run without errors (idempotent)

---

## Files to Update

1. **`scripts/setup.ts`**
   - Add `setupSecurityConfig()` method
   - Call before `runAutomation()`
   - Add key generation utility function

2. **`lib/config/validation.ts`**
   - Already has all these fields in `EnvFileSchema`
   - May need to add validation helpers for key formats

3. **`lib/config/deployment-config.ts`**
   - Add `generateSecureKey()` utility method

4. **Tests**
   - Ensure generated keys pass validation
   - Test encryption with generated `DB_ENCRYPTION_KEY`
   - Test hashing with generated `ENTITY_HASH_SALT`
