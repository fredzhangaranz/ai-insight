# Insight Demo Wound Assessment v2

## Attribute Set 1: Wound State

1. Wound State
   - Type: SingleSelectList
   - Visibility: Always visible
   - Options: New, Improving, Declining, Stable, Reclassified, Stalled, Re-Opened, Resolved
2. Wound Occurrence
   - Type: SingleSelectList
   - Visibility: Always visible
   - Options: Acute, Chronic, Acute on Chronic, Recurrent
3. Onset Date
   - Type: Date
   - Visibility: Always visible
   - Options: N/A
4. Resolution Comments
   - Type: Text
   - Visibility: `IsNull(wound_state, '') == 'Resolved'`
   - Options: N/A

## Attribute Set 2: Assessment Summary

1. Was This Wound Present on Admission?
   - Type: Boolean
   - Visibility: Always visible
   - Options: N/A
2. Wound Classification
   - Type: SingleSelectList
   - Visibility: Always visible
   - Options: Pressure Injury, Leg Ulcer, Diabetic Foot Ulcer, Burn, Skin Tear, Traumatic Wound, Other
3. Pressure Injury Stage
   - Type: SingleSelectList
   - Visibility: `IsNull(demo_wc,'')=='Pressure Injury'`
   - Options: Stage 1, Stage 2, Stage 3, Stage 4, Unstageable, Suspected Deep Tissue Injury
4. Leg Ulcer Type
   - Type: SingleSelectList
   - Visibility: `IsNull(demo_wc,'')=='Leg Ulcer'`
   - Options: Venous, Arterial, Mixed (Venous and Arterial), Unknown
5. Diabetic Foot Ulcer Type
   - Type: SingleSelectList
   - Visibility: `IsNull(demo_wc,'')=='Diabetic Foot Ulcer'`
   - Options: Neuropathic, Ischemic, Neuro-Ischemic
6. SilhouetteStar Image
   - Type: ImageCapture
   - Visibility: Always visible
   - Options: N/A

## Attribute Set 3: Wound Details

1. Tissue Types
   - Type: MultiSelectList
   - Visibility: Always visible
   - Options: Granulation, Slough, Necrosis, Epithelium, Hypergranulation, Callous, Tendon, Bone, Other
2. Moisture Level
   - Type: SingleSelectList
   - Visibility: Always visible
   - Options: Dry, Moist, Moderate, High, Copious
3. Exudate Type
   - Type: MultiSelectList
   - Visibility: `IsNull(demo_ex_amt,'')!='Dry' && IsNull(demo_ex_amt,'')!=''`
   - Options: Serous, Haemoserous, Sanguinous, Purulent
4. Periwound
   - Type: MultiSelectList
   - Visibility: Always visible
   - Options: Healthy, Erythema, Maceration, Dryness, Oedema, Induration, Inflammation, Hyperkeratosis
5. Pain Present?
   - Type: Boolean
   - Visibility: Always visible
   - Options: N/A
6. Pain Severity
   - Type: Integer (0-10)
   - Visibility: `IsNull(demo_pain_present,false)==true`
   - Options: N/A
7. Infection Status
   - Type: SingleSelectList
   - Visibility: Always visible
   - Options: No signs of infection, Local infection suspected, Systemic infection suspected
8. Signs of Infection
   - Type: MultiSelectList
   - Visibility: `IsNull(demo_infection_status,'No signs of infection')!='No signs of infection'`
   - Options: Erythema, Heat, Swelling, Increased Exudate, Increased Pain, Malodour, Purulent Exudate, Stalled Healing, Fever

## Attribute Set 4: Plan of Care

1. Treatment(s) Provided
   - Type: MultiSelectList
   - Visibility: Always visible
   - Options: Dressing Change, Wound Cleansing, Debridement, Infection Management, Compression Therapy, Foot Offloading, Pressure Redistribution, Patient Education, Referral
2. Treatment Review Date
   - Type: Date
   - Visibility: Always visible
   - Options: N/A
3. Referral Made
   - Type: MultiSelectList
   - Visibility: `ListContains(demo_tx,'Referral')`
   - Options: Occupational Therapist, Physiotherapist, Dietician, Clinical Nurse Specialist, Diabetes Team, Podiatrist, District Nurse, Other
4. Overall Impressions
   - Type: Text
   - Visibility: Always visible
   - Options: N/A
