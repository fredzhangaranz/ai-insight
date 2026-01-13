// Discovery stage selection types
export type DiscoveryStageOptions = {
  formDiscovery: boolean;
  nonFormSchema: boolean;
  nonFormValues: boolean;
  relationships: boolean;
  assessmentTypes: boolean; // Phase 5A: Assessment-level semantic indexing
  discoveryLogging: boolean;
};

export type DiscoveryRunOptions = {
  customerCode: string;
  stages?: DiscoveryStageOptions;
};

// Default stages: all enabled except non-form values (performance intensive)
export const DEFAULT_DISCOVERY_STAGES: DiscoveryStageOptions = {
  formDiscovery: true,
  nonFormSchema: true,
  nonFormValues: false,
  relationships: true,
  assessmentTypes: true, // Phase 5A: Enabled by default
  discoveryLogging: true,
};

// Helper function to merge user stages with defaults
export function getDiscoveryStages(
  userStages?: Partial<DiscoveryStageOptions>
): DiscoveryStageOptions {
  return {
    ...DEFAULT_DISCOVERY_STAGES,
    ...userStages,
  };
}
