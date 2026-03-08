/**
 * Silhouette hard-coded mapping: AttributeType.attributeTypeKey → dbo.Patient column.
 * Mapped attributes are stored in dbo.Patient; unmapped in PatientAttribute.
 * See docs/design/data_generation/BROWSE_PATIENT_SQL.md
 */

export const ATTRIBUTE_TYPE_KEY_TO_PATIENT_COLUMN: Record<string, string> = {
  "0A2C24C3-2D4B-412E-AB9A-60428E6F8FFF": "domainId",
  "7996E6FC-CB07-4472-999D-A02979EC3BE2": "unitFk",
  "0B532097-80AC-4918-BDAB-B40F51B16188": "firstName",
  "3D0AEF97-E856-47C4-A733-BA88E4DCDDAB": "lastName",
  "5EEB1366-52A0-41A6-9BFB-555D560D9844": "middleName",
  "1A5CD84F-DAB5-48C9-88C7-10C5C505CA2D": "homePhone",
  "D4DD281F-6875-4EE7-81BA-B4B0F764CF38": "mobilePhone",
  "ECFB8100-63B5-4507-86A9-031506619CFC": "workPhone",
  "602CD327-38B9-4B37-BC67-10D2AC8046EA": "dateOfBirth",
  "EFF5DF6F-E469-4F6C-AE6E-566217C850DE": "addressState",
  "5B12B58F-3FAE-4A86-99A9-7E380850C155": "addressStreet",
  "20B81185-B21C-4131-B511-C864404B1F7B": "addressCity",
  "AF4CF6EA-4FFF-4B23-9B8D-D453EC66397B": "addressCountry",
  "3BF96B00-3DED-4280-976E-F055863DCF61": "addressSuburb",
  "71DB4E37-9A55-48C8-A465-F8F8B745300A": "addressPostcode",
};

export function getPatientColumnForAttributeTypeKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const normalized = String(key).trim().toUpperCase();
  for (const [k, v] of Object.entries(ATTRIBUTE_TYPE_KEY_TO_PATIENT_COLUMN)) {
    if (k.toUpperCase() === normalized) return v;
  }
  return null;
}

export function isMappedToPatientTable(attributeTypeKey: string | null | undefined): boolean {
  return getPatientColumnForAttributeTypeKey(attributeTypeKey) !== null;
}
