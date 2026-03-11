-- Patients with no wounds and no assessments (clean for data generation testing)
-- Use these patients when testing wound/assessment generation so existing data doesn't mix in.

-- List active patients that have zero wounds and zero series (assessments)
SELECT
  p.id,
  p.firstName,
  p.lastName,
  p.domainId,
  p.unitFk,
  p.dateOfBirth
FROM dbo.Patient p
WHERE p.isDeleted = 0
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.Wound w
    WHERE w.patientFk = p.id
      AND w.isDeleted = 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM dbo.Series s
    WHERE s.patientFk = p.id
      AND s.isDeleted = 0
  )
ORDER BY p.lastName, p.firstName;

-- Count only (quick check)
-- SELECT COUNT(*) AS cleanPatientCount
-- FROM dbo.Patient p
-- WHERE p.isDeleted = 0
--   AND NOT EXISTS (SELECT 1 FROM dbo.Wound w WHERE w.patientFk = p.id AND w.isDeleted = 0)
--   AND NOT EXISTS (SELECT 1 FROM dbo.Series s WHERE s.patientFk = p.id AND s.isDeleted = 0);
