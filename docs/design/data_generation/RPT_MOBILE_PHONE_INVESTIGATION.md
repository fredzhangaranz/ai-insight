# Why updated patient data (e.g. mobile phone) may not appear in reporting (rpt)

When you update a patient (e.g. mobile phone) via data generation, values are written to **dbo** only. A separate step runs the stored procedure **sp_clonePatients** to copy data into the **rpt** schema. If you don’t see the updated value in reporting, use this checklist.

---

## 1. Check whether the clone step ran successfully

After running **Execute**:

1. Scroll to **Execution Timeline** on the same page.
2. Find the step **clone_to_rpt**.
3. If it shows **✗ failed**, the clone did not run. The **error message** is shown in red under the step — use it to fix permissions or SP issues, then re-run.
4. If it shows **✓ complete**, the clone ran; the issue is likely in what the stored procedure copies (see below).

---

## 2. Confirm the value is in dbo

Data generation updates **dbo.Patient** (e.g. `mobilePhone`). Confirm the row has the new value:

```sql
-- Replace with your patient id if different
SELECT id, firstName, lastName, mobilePhone, homePhone, serverChangeDate
FROM dbo.Patient
WHERE id = '60263C74-770B-4D66-9AEE-C35884FCECE4'
  AND isDeleted = 0;
```

If **mobilePhone** is correct here but missing or wrong in reporting, the problem is between dbo and rpt (clone step or SP).

---

## 3. Check what reporting has

Check whether **rpt** has a mobile phone column and what value it has for that patient:

```sql
-- If rpt.patient has mobilePhone (or similarly named) column
SELECT id, firstName, lastName, mobilePhone, homePhone
FROM rpt.patient
WHERE id = '60263C74-770B-4D66-9AEE-C35884FCECE4'
  AND isDeleted = 0;
```

- If **rpt.patient** has no **mobilePhone** (or equivalent) column, the reporting schema does not expose it; schema or ETL changes are needed.
- If the column exists but is NULL or old, **sp_clonePatients** may not be copying that column from dbo to rpt. The procedure is maintained in the database (not in this repo); a DBA or backend owner needs to ensure it copies **dbo.Patient.mobilePhone** into **rpt.patient** (or the correct rpt column name).

---

## 4. Summary

| dbo.Patient.mobilePhone | rpt.patient (mobile phone) | Action |
|-------------------------|----------------------------|--------|
| Correct                 | Correct                    | No issue. |
| Correct                 | Missing / wrong            | Clone step may have failed (check Execution Timeline) or **sp_clonePatients** / rpt schema does not sync this column. Fix in DB/SP. |
| Wrong / NULL            | —                          | Generation or update did not write the value; check spec (field enabled, columnName `mobilePhone`) and run again. |

Our code writes **mobilePhone** to **dbo.Patient** (see `patient-storage-mapping.ts` and `patient.generator.ts`). We then call **sp_clonePatients** once per run. We do not control the definition of **sp_clonePatients** or the **rpt.patient** table; those are owned by the Silhouette database/backend team.
