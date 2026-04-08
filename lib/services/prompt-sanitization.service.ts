export interface PromptSanitizationInput {
  question: string;
  patientMentions?: Array<{
    matchedText: string;
    opaqueRef: string;
  }>;
}

export interface PromptSanitizationResult {
  sanitizedQuestion: string;
  replacements: Array<{
    original: string;
    placeholder: string;
  }>;
  trustedContextLines: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class PromptSanitizationService {
  sanitize(input: PromptSanitizationInput): PromptSanitizationResult {
    const replacements: PromptSanitizationResult["replacements"] = [];
    let sanitizedQuestion = input.question;

    for (const [index, mention] of (input.patientMentions || []).entries()) {
      if (!mention.matchedText?.trim()) continue;
      const placeholder = `PATIENT_REF_${index + 1}`;
      const regex = new RegExp(escapeRegExp(mention.matchedText), "gi");
      sanitizedQuestion = sanitizedQuestion.replace(regex, placeholder);
      replacements.push({
        original: mention.matchedText,
        placeholder,
      });
    }

    const trustedContextLines = (input.patientMentions || []).map(
      (mention, index) =>
        `Resolved patient placeholder PATIENT_REF_${index + 1}. This placeholder is NOT a database value and MUST NEVER appear in SQL. Use only bind parameter @patientId${index + 1}, and compare it only to patient primary key columns (rpt.Patient.id) or patient foreign keys (*.patientFk). Never use domainId for secure patient binding.`
    );

    return {
      sanitizedQuestion,
      replacements,
      trustedContextLines,
    };
  }
}
