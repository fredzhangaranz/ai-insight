/**
 * Assessment Type Semantic Taxonomy
 *
 * Defines standardized semantic concepts for assessment types (forms)
 * to support assessment-level queries and multi-assessment correlation.
 *
 * Created: 2025-11-19
 * Purpose: Phase 5A - Assessment-Level Semantic Indexing
 * See: docs/design/templating_system/templating_improvement_real_customer_analysis.md
 */

/**
 * Assessment semantic concept
 */
export interface AssessmentTypeConcept {
  /** Standardized concept name (e.g., "clinical_wound_assessment") */
  concept: string;

  /** Broad category */
  category: 'clinical' | 'billing' | 'administrative' | 'treatment';

  /** Optional subcategory */
  subcategory?: 'initial' | 'follow_up' | 'discharge' | 'progress' | 'other';

  /** Description of this concept */
  description: string;

  /** Regex patterns to match assessment type names */
  namePatterns: RegExp[];

  /** Keywords that suggest this concept */
  keywords: string[];

  /** Is this assessment tied to a wound? */
  isWoundSpecific: boolean;

  /** Typical frequency */
  typicalFrequency: 'per_visit' | 'weekly' | 'monthly' | 'one_time' | 'as_needed';

  /** Default confidence for pattern-based detection */
  defaultConfidence: number;
}

/**
 * Assessment Type Semantic Taxonomy
 *
 * IMPORTANT: Use generic terminology that applies across all customers.
 * DO NOT use customer-specific names like "superbill" or "visit details".
 */
export const ASSESSMENT_TYPE_TAXONOMY: AssessmentTypeConcept[] = [
  // ============================================================================
  // Clinical Assessment Concepts
  // ============================================================================
  {
    concept: 'clinical_wound_assessment',
    category: 'clinical',
    description: 'Clinical assessment of wound characteristics, measurements, and status',
    namePatterns: [
      /wound\s*assessment/i,
      /wound\s*eval/i,
      /wound\s*measurement/i,
      /wound\s*documentation/i,
      /wound\s*progress/i,
    ],
    keywords: ['wound', 'assessment', 'measurement', 'area', 'depth', 'tissue'],
    isWoundSpecific: true,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.95,
  },

  {
    concept: 'clinical_visit_documentation',
    category: 'clinical',
    description: 'Documentation of clinical visits, encounters, or consultations',
    namePatterns: [
      /visit\s*detail/i,
      /visit\s*note/i,
      /encounter\s*note/i,
      /clinical\s*visit/i,
      /consultation/i,
    ],
    keywords: ['visit', 'encounter', 'consultation', 'clinical', 'note'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.90,
  },

  {
    concept: 'clinical_initial_assessment',
    category: 'clinical',
    subcategory: 'initial',
    description: 'Initial patient assessment or intake evaluation',
    namePatterns: [
      /initial\s*assessment/i,
      /intake\s*assessment/i,
      /admission\s*assessment/i,
      /baseline\s*assessment/i,
    ],
    keywords: ['initial', 'intake', 'admission', 'baseline', 'new patient'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.92,
  },

  {
    concept: 'clinical_follow_up_assessment',
    category: 'clinical',
    subcategory: 'follow_up',
    description: 'Follow-up assessment or progress evaluation',
    namePatterns: [
      /follow[\s-]*up/i,
      /progress\s*note/i,
      /reassessment/i,
      /re-assessment/i,
    ],
    keywords: ['follow-up', 'followup', 'progress', 'reassessment', 'ongoing'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.88,
  },

  {
    concept: 'clinical_discharge_assessment',
    category: 'clinical',
    subcategory: 'discharge',
    description: 'Discharge assessment or summary',
    namePatterns: [
      /discharge/i,
      /final\s*assessment/i,
      /termination/i,
      /closure/i,
    ],
    keywords: ['discharge', 'final', 'termination', 'closure', 'exit'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.93,
  },

  {
    concept: 'clinical_progress_note',
    category: 'clinical',
    subcategory: 'progress',
    description: 'Clinical progress note or status update',
    namePatterns: [
      /progress\s*note/i,
      /soap\s*note/i,
      /status\s*update/i,
      /clinical\s*note/i,
    ],
    keywords: ['progress', 'soap', 'status', 'note', 'update'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.87,
  },

  // ============================================================================
  // Billing Assessment Concepts
  // ============================================================================
  {
    concept: 'billing_documentation',
    category: 'billing',
    description: 'Billing documentation, charge capture, or reimbursement forms',
    namePatterns: [
      /billing/i,
      /charge\s*capture/i,
      /reimbursement/i,
      /invoice/i,
      /claim/i,
      // NOTE: Explicitly exclude customer-specific terms like "superbill"
      // Pattern matching should be generic across all customers
    ],
    keywords: ['billing', 'charge', 'reimbursement', 'invoice', 'claim', 'payment'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.90,
  },

  {
    concept: 'billing_charge_capture',
    category: 'billing',
    description: 'Detailed charge capture or itemized billing',
    namePatterns: [
      /charge\s*capture/i,
      /service\s*code/i,
      /cpt\s*code/i,
      /procedure\s*code/i,
    ],
    keywords: ['charge', 'service code', 'cpt', 'procedure code', 'itemized'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.92,
  },

  {
    concept: 'billing_claim_form',
    category: 'billing',
    description: 'Insurance claim form or submission documentation',
    namePatterns: [
      /claim\s*form/i,
      /insurance\s*claim/i,
      /ub[\s-]*04/i,
      /cms[\s-]*1500/i,
      /hcfa/i,
    ],
    keywords: ['claim', 'insurance', 'ub-04', 'cms-1500', 'hcfa', 'submission'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.95,
  },

  // ============================================================================
  // Administrative Assessment Concepts
  // ============================================================================
  {
    concept: 'administrative_intake',
    category: 'administrative',
    description: 'Administrative intake or registration forms',
    namePatterns: [
      /intake/i,
      /registration/i,
      /enrollment/i,
      /onboarding/i,
    ],
    keywords: ['intake', 'registration', 'enrollment', 'onboarding', 'new patient'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.88,
  },

  {
    concept: 'administrative_consent',
    category: 'administrative',
    description: 'Consent forms or authorization documents',
    namePatterns: [
      /consent/i,
      /authorization/i,
      /permission/i,
      /hipaa/i,
    ],
    keywords: ['consent', 'authorization', 'permission', 'hipaa', 'agreement'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.90,
  },

  {
    concept: 'administrative_demographics',
    category: 'administrative',
    description: 'Patient demographics or contact information',
    namePatterns: [
      /demographic/i,
      /contact\s*info/i,
      /patient\s*info/i,
      /personal\s*info/i,
    ],
    keywords: ['demographics', 'contact', 'address', 'phone', 'emergency contact'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.85,
  },

  {
    concept: 'administrative_discharge',
    category: 'administrative',
    subcategory: 'discharge',
    description: 'Administrative discharge or exit documentation',
    namePatterns: [
      /discharge\s*summary/i,
      /exit\s*interview/i,
      /termination/i,
    ],
    keywords: ['discharge', 'exit', 'termination', 'final', 'administrative'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.87,
  },

  // ============================================================================
  // Treatment Assessment Concepts
  // ============================================================================
  {
    concept: 'treatment_plan',
    category: 'treatment',
    description: 'Treatment plan or care plan documentation',
    namePatterns: [
      /treatment\s*plan/i,
      /care\s*plan/i,
      /plan\s*of\s*care/i,
      /therapeutic\s*plan/i,
    ],
    keywords: ['treatment plan', 'care plan', 'therapeutic', 'interventions'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.90,
  },

  {
    concept: 'treatment_protocol',
    category: 'treatment',
    description: 'Treatment protocol or clinical pathway',
    namePatterns: [
      /protocol/i,
      /clinical\s*pathway/i,
      /treatment\s*guideline/i,
      /care\s*pathway/i,
    ],
    keywords: ['protocol', 'pathway', 'guideline', 'standard of care'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.88,
  },

  {
    concept: 'treatment_order',
    category: 'treatment',
    description: 'Treatment order or physician order',
    namePatterns: [
      /treatment\s*order/i,
      /physician\s*order/i,
      /prescription/i,
      /order\s*set/i,
    ],
    keywords: ['order', 'prescription', 'physician', 'medication', 'treatment'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.92,
  },

  {
    concept: 'treatment_application_record',
    category: 'treatment',
    description: 'Record of treatment application or intervention',
    namePatterns: [
      /treatment\s*application/i,
      /intervention\s*record/i,
      /therapy\s*session/i,
      /treatment\s*log/i,
    ],
    keywords: ['application', 'intervention', 'therapy', 'treatment log'],
    isWoundSpecific: true,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.87,
  },

  {
    concept: 'treatment_procedure',
    category: 'treatment',
    description: 'Clinical procedure documentation (e.g., debridement, dressing change)',
    namePatterns: [
      /debridement/i,
      /dressing\s*change/i,
      /procedure/i,
      /irrigation/i,
    ],
    keywords: ['procedure', 'debridement', 'dressing', 'irrigation', 'intervention'],
    isWoundSpecific: true,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.90,
  },

  {
    concept: 'treatment_management_plan',
    category: 'treatment',
    description: 'Comprehensive wound or care management plan',
    namePatterns: [
      /management\s*plan/i,
      /wound\s*care\s*plan/i,
      /wound\s*management/i,
      /care\s*management/i,
    ],
    keywords: ['management', 'care plan', 'wound care', 'comprehensive'],
    isWoundSpecific: true,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.90,
  },

  // ============================================================================
  // Clinical History & Assessment Concepts
  // ============================================================================
  {
    concept: 'clinical_medical_history',
    category: 'clinical',
    subcategory: 'history',
    description: 'Medical history, past medical history, or health background',
    namePatterns: [
      /medical\s*history/i,
      /health\s*history/i,
      /past\s*medical/i,
      /pmh/i,
    ],
    keywords: ['medical history', 'health history', 'past medical', 'pmh', 'background'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.90,
  },

  {
    concept: 'clinical_medication_record',
    category: 'clinical',
    subcategory: 'medication',
    description: 'Medication list, prescription record, or drug administration',
    namePatterns: [
      /medication/i,
      /prescription/i,
      /drug\s*list/i,
      /med\s*list/i,
    ],
    keywords: ['medication', 'prescription', 'drug', 'pharmaceutical', 'med list'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.92,
  },

  {
    concept: 'clinical_risk_assessment',
    category: 'clinical',
    subcategory: 'risk',
    description: 'Risk assessment or screening tool',
    namePatterns: [
      /risk\s*assessment/i,
      /risk\s*screening/i,
      /fall\s*risk/i,
      /pressure\s*risk/i,
    ],
    keywords: ['risk', 'assessment', 'screening', 'fall', 'pressure'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.88,
  },

  {
    concept: 'clinical_investigation',
    category: 'clinical',
    subcategory: 'investigation',
    description: 'Investigation history, diagnostic tests, or lab results',
    namePatterns: [
      /investigation/i,
      /diagnostic/i,
      /lab\s*result/i,
      /test\s*result/i,
    ],
    keywords: ['investigation', 'diagnostic', 'lab', 'test', 'result'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.85,
  },

  {
    concept: 'clinical_limb_assessment',
    category: 'clinical',
    subcategory: 'limb',
    description: 'Lower or upper limb assessment (circulation, sensation, mobility)',
    namePatterns: [
      /limb\s*assessment/i,
      /lower\s*limb/i,
      /upper\s*limb/i,
      /extremity\s*assessment/i,
    ],
    keywords: ['limb', 'extremity', 'circulation', 'sensation', 'mobility'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.87,
  },

  {
    concept: 'clinical_wound_state',
    category: 'clinical',
    description: 'Wound state or status tracking',
    namePatterns: [
      /wound\s*state/i,
      /wound\s*status/i,
    ],
    keywords: ['wound state', 'wound status', 'healing', 'condition'],
    isWoundSpecific: true,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.90,
  },

  // ============================================================================
  // Administrative & Other Concepts
  // ============================================================================
  {
    concept: 'administrative_patient_details',
    category: 'administrative',
    description: 'General patient details or information form',
    namePatterns: [
      /^details$/i,
      /patient\s*details/i,
      /patient\s*information/i,
    ],
    keywords: ['details', 'information', 'patient', 'profile'],
    isWoundSpecific: false,
    typicalFrequency: 'one_time',
    defaultConfidence: 0.80,
  },

  {
    concept: 'administrative_encounter',
    category: 'administrative',
    description: 'Clinical encounter or visit registration',
    namePatterns: [
      /^encounter$/i,
      /visit\s*registration/i,
      /encounter\s*form/i,
    ],
    keywords: ['encounter', 'visit', 'registration', 'check-in'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.85,
  },

  {
    concept: 'administrative_insurance',
    category: 'administrative',
    description: 'Insurance information or coverage details',
    namePatterns: [
      /^insurance$/i,
      /insurance\s*info/i,
      /coverage/i,
      /payor\s*info/i,
    ],
    keywords: ['insurance', 'coverage', 'payor', 'benefits', 'eligibility'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.90,
  },

  {
    concept: 'administrative_order',
    category: 'administrative',
    description: 'General order or request form',
    namePatterns: [
      /^order$/i,
      /order\s*form/i,
    ],
    keywords: ['order', 'request', 'requisition'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.75,
  },

  {
    concept: 'administrative_external_message',
    category: 'administrative',
    description: 'External message or communication record',
    namePatterns: [
      /external\s*message/i,
      /message\s*log/i,
      /communication/i,
    ],
    keywords: ['external', 'message', 'communication', 'correspondence'],
    isWoundSpecific: false,
    typicalFrequency: 'as_needed',
    defaultConfidence: 0.80,
  },

  {
    concept: 'clinical_mobile_assessment',
    category: 'clinical',
    description: 'Mobile or lite assessment tool (e.g., SilhouetteLite)',
    namePatterns: [
      /silhouettelite/i,
      /mobile\s*assessment/i,
      /lite\s*assessment/i,
    ],
    keywords: ['mobile', 'lite', 'silhouette', 'portable', 'quick'],
    isWoundSpecific: false,
    typicalFrequency: 'per_visit',
    defaultConfidence: 0.85,
  },
];

/**
 * Find matching assessment type concepts by name
 */
export function findMatchingConcepts(
  assessmentName: string
): Array<{ concept: AssessmentTypeConcept; confidence: number }> {
  const matches: Array<{ concept: AssessmentTypeConcept; confidence: number }> = [];

  for (const concept of ASSESSMENT_TYPE_TAXONOMY) {
    // Check name patterns
    for (const pattern of concept.namePatterns) {
      if (pattern.test(assessmentName)) {
        matches.push({
          concept,
          confidence: concept.defaultConfidence,
        });
        break; // Only match once per concept
      }
    }

    // Check keywords (lower confidence)
    if (matches.find((m) => m.concept === concept)) {
      continue; // Already matched by pattern
    }

    const nameLower = assessmentName.toLowerCase();
    const matchedKeywords = concept.keywords.filter((keyword) =>
      nameLower.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length >= 2) {
      // At least 2 keywords matched
      matches.push({
        concept,
        confidence: concept.defaultConfidence * 0.7, // Lower confidence for keyword matching
      });
    }
  }

  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get assessment concept by name
 */
export function getConceptByName(conceptName: string): AssessmentTypeConcept | undefined {
  return ASSESSMENT_TYPE_TAXONOMY.find((c) => c.concept === conceptName);
}

/**
 * Get all concepts in a category
 */
export function getConceptsByCategory(
  category: 'clinical' | 'billing' | 'administrative' | 'treatment'
): AssessmentTypeConcept[] {
  return ASSESSMENT_TYPE_TAXONOMY.filter((c) => c.category === category);
}
