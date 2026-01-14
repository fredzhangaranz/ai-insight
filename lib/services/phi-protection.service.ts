import crypto from "crypto";
import type { ResultSummary } from "@/lib/types/conversation";

export class PHIProtectionService {
  /**
   * Hash an entity ID (patient ID, wound ID, etc.) for storage.
   * One-way hash - cannot be reversed.
   */
  hashEntityId(entityId: string | number): string {
    const salt = process.env.ENTITY_HASH_SALT;

    if (!salt || salt === "default-salt-change-in-prod") {
      throw new Error(
        "ENTITY_HASH_SALT must be set in environment. " +
          "This is required for HIPAA/GDPR compliance. " +
          "Generate a secure salt: openssl rand -base64 32"
      );
    }

    const hash = crypto
      .createHash("sha256")
      .update(`${entityId}${salt}`)
      .digest("hex");
    return hash.substring(0, 16);
  }

  /**
   * Hash multiple entity IDs.
   */
  hashEntityIds(entityIds: (string | number)[]): string[] {
    return entityIds.map((id) => this.hashEntityId(id));
  }

  /**
   * Create safe result summary (NO PHI).
   */
  createSafeResultSummary(rows: any[], columns: string[]): ResultSummary {
    const entityIds: (string | number)[] = [];

    for (const row of rows) {
      if (row.patientId) entityIds.push(row.patientId);
      if (row.patient_id) entityIds.push(row.patient_id);
      if (row.woundId) entityIds.push(row.woundId);
      if (row.wound_id) entityIds.push(row.wound_id);
    }

    return {
      rowCount: rows.length,
      columns,
      entityHashes:
        entityIds.length > 0
          ? this.hashEntityIds(Array.from(new Set(entityIds)))
          : undefined,
    };
  }

  /**
   * Validate that metadata contains NO PHI.
   * Throws error if PHI detected.
   */
  validateNoPHI(metadata: any): void {
    // Use regex patterns for more comprehensive PHI detection
    const phiPatterns = [
      /patient.*name/i,
      /first.*name/i,
      /last.*name/i,
      /full.*name/i,
      /(date|day).*birth/i,
      /birth.*(date|day)/i,
      /\bd\.?o\.?b\b/i, // d.o.b, dob
      /\bssn\b/i, // Social Security Number
      /\bmrn\b/i, // Medical Record Number
      /phone/i,
      /mobile/i,
      /email/i,
      /address/i,
      /street/i,
      /postal|zip/i,
      /patient.*id\b/i, // patientId, patient_id
      /\bpii\b/i, // Personal Identifiable Information
      /drivers?.*licen[cs]e/i,
      /passport/i,
    ];

    const detectPHI = (obj: any, path = ""): string[] => {
      const found: string[] = [];

      for (const [key, value] of Object.entries(obj ?? {})) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check if key matches ANY PHI pattern
        if (phiPatterns.some((pattern) => pattern.test(key))) {
          found.push(currentPath);
        }

        // Recursively check nested objects
        if (value && typeof value === "object" && !Array.isArray(value)) {
          found.push(...detectPHI(value, currentPath));
        }
      }

      return found;
    };

    const phiFound = detectPHI(metadata);

    if (phiFound.length > 0) {
      throw new Error(
        `PHI detected in metadata at: ${phiFound.join(", ")}. ` +
          "HIPAA violation prevented. Remove PHI before storing."
      );
    }
  }
}
