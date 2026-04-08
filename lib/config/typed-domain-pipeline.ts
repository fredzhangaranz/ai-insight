export type TypedDomainPipelineMode =
  | "off"
  | "shadow"
  | "authoritative_phase1"
  | "authoritative_phase2";

const DEFAULT_MODE: TypedDomainPipelineMode = "off";

export function getTypedDomainPipelineMode(): TypedDomainPipelineMode {
  const rawMode = String(process.env.TYPED_DOMAIN_PIPELINE_MODE || "")
    .trim()
    .toLowerCase();

  switch (rawMode) {
    case "shadow":
      return "shadow";
    case "authoritative_phase1":
      return "authoritative_phase1";
    case "authoritative_phase2":
      return "authoritative_phase2";
    default:
      return DEFAULT_MODE;
  }
}

export function isTypedDomainPipelineShadowEnabled(): boolean {
  return getTypedDomainPipelineMode() === "shadow";
}

export function isTypedDomainPipelineAuthoritative(): boolean {
  const mode = getTypedDomainPipelineMode();
  return mode === "authoritative_phase1" || mode === "authoritative_phase2";
}

export function isTypedDomainPipelinePhase1Enabled(): boolean {
  const mode = getTypedDomainPipelineMode();
  return mode === "shadow" || mode === "authoritative_phase1" || mode === "authoritative_phase2";
}
