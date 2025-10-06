const TEMPLATE_FEATURE_ENV_KEY = "AI_TEMPLATES_ENABLED" as const;

export function isTemplateSystemEnabled(): boolean {
  return process.env[TEMPLATE_FEATURE_ENV_KEY] === "true";
}

export function getTemplateFeatureEnvKey(): string {
  return TEMPLATE_FEATURE_ENV_KEY;
}
