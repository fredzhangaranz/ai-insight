"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type {
  FieldProfileSet,
  TrajectoryPhaseProfile,
  PhaseFieldDistribution,
  FieldValueBehavior,
} from "@/lib/services/data-gen/trajectory-field-profile.types";
import type { TrajectorySelectionResult } from "@/lib/services/data-gen/trajectory-selector";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";
import { WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY } from "@/lib/services/data-gen/field-classifier.service";
import { getProfileFieldOptions } from "@/lib/services/data-gen/profile-fallback";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface FieldProfilesReviewStepProps {
  profiles: FieldProfileSet;
  formSchema?: FieldSchema[];
  onProceed: (profiles: FieldProfileSet) => void;
  onBack: () => void;
  trajectorySelection?: TrajectorySelectionResult;
}

export function FieldProfilesReviewStep({
  profiles: initialProfiles,
  formSchema,
  onProceed,
  onBack,
  trajectorySelection,
}: FieldProfilesReviewStepProps) {
  const [profiles, setProfiles] = useState<FieldProfileSet>(initialProfiles);
  const [openProfile, setOpenProfile] = useState<string | null>(
    initialProfiles[0]?.trajectoryStyle ?? null
  );
  const schemaFieldMeta = useMemo(() => {
    const meta = new Map<
      string,
      {
        required: boolean;
        order: number;
        hasVisibilityRule: boolean;
      }
    >();
    const profiledFields = (formSchema ?? []).filter(
      (field) => (getProfileFieldOptions(field)?.length ?? 0) > 0
    );
    profiledFields.forEach((field, idx) => {
      const setOrder = field.attributeSetOrderIndex ?? 999;
      const attributeOrder = field.attributeOrderIndex ?? idx;
      meta.set(field.columnName, {
        required: field.isNullable === false,
        order: setOrder * 1000 + attributeOrder,
        hasVisibilityRule: String(field.visibilityExpression ?? "").trim().length > 0,
      });
    });
    return meta;
  }, [formSchema]);
  const schemaRequiredSelectableCount = useMemo(
    () =>
      [...schemaFieldMeta.values()].filter((fieldMeta) => fieldMeta.required).length,
    [schemaFieldMeta]
  );
  const hiddenProfileColumns = useMemo(() => {
    return new Set(
      (formSchema ?? [])
        .filter(
          (field) =>
            String(field.attributeTypeKey ?? "").toUpperCase() ===
            WOUND_STATE_SELECTOR_ATTRIBUTE_TYPE_KEY
        )
        .map((field) => field.columnName)
    );
  }, [formSchema]);
  const hidesTrajectoryControlledFields = hiddenProfileColumns.size > 0;

  const updateWeight = (
    profileIdx: number,
    phaseIdx: number,
    fieldIdx: number,
    optionKey: string,
    value: number
  ) => {
    setProfiles((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FieldProfileSet;
      const dist = next[profileIdx]?.phases?.[phaseIdx]?.fieldDistributions?.[fieldIdx];
      if (!dist || !(optionKey in dist.weights)) return prev;
      const nextValue = Math.max(0, Math.min(1, value));
      dist.weights[optionKey] = nextValue;
      if (dist.behavior === "per_wound") {
        for (const phase of next[profileIdx].phases) {
          const syncedDistribution = phase.fieldDistributions.find(
            (candidate) => candidate.columnName === dist.columnName
          );
          if (!syncedDistribution || !(optionKey in syncedDistribution.weights)) continue;
          syncedDistribution.weights[optionKey] = nextValue;
        }
      }
      return next;
    });
  };

  const updateBehavior = (
    profileIdx: number,
    columnName: string,
    behavior: FieldValueBehavior
  ) => {
    setProfiles((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as FieldProfileSet;
      const profile = next[profileIdx];
      if (!profile) return prev;

      const template = getCanonicalDistribution(profile, columnName);
      const earlyWeights = getCanonicalWeights(profile, columnName);
      if (!template) return prev;

      for (const phase of profile.phases) {
        let distribution = phase.fieldDistributions.find(
          (candidate) => candidate.columnName === columnName
        );
        if (!distribution) {
          distribution = {
            ...template,
            weights: earlyWeights ? { ...earlyWeights } : { ...template.weights },
          };
          phase.fieldDistributions.push(distribution);
        }
        distribution.behavior = behavior;
        if (behavior === "per_wound" && earlyWeights) {
          distribution.weights = { ...earlyWeights };
        }
      }

      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 4: Review Field Profiles</CardTitle>
        <CardDescription>
          Trajectory-aware value distributions. Edit weights to tune generated data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {trajectorySelection && (
          <Alert
            variant={trajectorySelection.isRandomised ? "default" : "default"}
            className={
              trajectorySelection.isRandomised ? "border-blue-200 bg-blue-50" : ""
            }
          >
            <div className="flex gap-3">
              {trajectorySelection.isRandomised ? (
                <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
              )}
              <AlertDescription
                className={
                  trajectorySelection.isRandomised ? "text-blue-900" : "text-slate-700"
                }
              >
                <strong>
                  {trajectorySelection.selectedStyles.length} profile
                  {trajectorySelection.selectedStyles.length !== 1 ? "s" : ""} selected
                </strong>
                : {trajectorySelection.description}
                {trajectorySelection.isRandomised && (
                  <p className="text-xs mt-1 opacity-90">
                    Since trajectories are randomised per wound at generation time, all trajectory
                    types are needed to ensure every possible trajectory can be assigned.
                  </p>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          Each trajectory style has early, mid, and late phases. Field values are sampled from these
          distributions during generation. Option weights are{" "}
          <span className="font-medium text-foreground">relative</span>: they do not need to sum to
          100% — the generator scales them to the same proportions (like normalizing to 100%).
        </p>
        {schemaFieldMeta.size > 0 && (
          <div className="text-xs text-muted-foreground">
            Required profiled fields:{" "}
            <span className="font-medium">
              {schemaRequiredSelectableCount}/{schemaFieldMeta.size}
            </span>
            . Required fields are still generated; profile weights only tune option likelihood.
          </div>
        )}
        {hidesTrajectoryControlledFields && (
          <div className="text-xs text-muted-foreground">
            Wound state is hidden here because it is resolved from trajectory semantics and the
            tenant&apos;s configured open/non-open wound-state lookup rows.
          </div>
        )}

        <div className="space-y-2">
          {profiles.map((profile, profileIdx) => (
            <Collapsible
              key={profile.trajectoryStyle}
              open={openProfile === profile.trajectoryStyle}
              onOpenChange={(open) =>
                setOpenProfile(open ? profile.trajectoryStyle : null)
              }
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 rounded-lg"
                  >
                    {openProfile === profile.trajectoryStyle ? (
                      <ChevronDownIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{profile.trajectoryStyle}</span>
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        —{" "}
                      </span>
                      <span className="text-sm text-muted-foreground break-words">
                        {profile.clinicalSummary}
                      </span>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t px-4 pb-4 pt-2 space-y-4">
                    {profile.phases?.map((phase, phaseIdx) => (
                      <PhaseSection
                        key={phase.phase}
                        phase={phase}
                        profileIdx={profileIdx}
                        phaseIdx={phaseIdx}
                        schemaFieldMeta={schemaFieldMeta}
                        hiddenColumnNames={hiddenProfileColumns}
                        onUpdateWeight={updateWeight}
                        onUpdateBehavior={updateBehavior}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={() => onProceed(profiles)}>Continue to Review Spec</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PhaseSection({
  phase,
  profileIdx,
  phaseIdx,
  schemaFieldMeta,
  hiddenColumnNames,
  onUpdateWeight,
  onUpdateBehavior,
}: {
  phase: TrajectoryPhaseProfile;
  profileIdx: number;
  phaseIdx: number;
  schemaFieldMeta: Map<
    string,
    {
      required: boolean;
      order: number;
      hasVisibilityRule: boolean;
    }
  >;
  hiddenColumnNames: Set<string>;
  onUpdateWeight: (
    profileIdx: number,
    phaseIdx: number,
    fieldIdx: number,
    optionKey: string,
    value: number
  ) => void;
  onUpdateBehavior: (
    profileIdx: number,
    columnName: string,
    behavior: FieldValueBehavior
  ) => void;
}) {
  const [phaseOpen, setPhaseOpen] = useState(true);

  const sortedDistributions = phase.fieldDistributions
    .map((distribution, originalIndex) => ({ distribution, originalIndex }))
    .filter(({ distribution }) => !hiddenColumnNames.has(distribution.columnName))
    .sort((a, b) => {
      const aMeta = schemaFieldMeta.get(a.distribution.columnName);
      const bMeta = schemaFieldMeta.get(b.distribution.columnName);
      const aOrder = aMeta?.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = bMeta?.order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.originalIndex - b.originalIndex;
    });

  return (
    <Collapsible open={phaseOpen} onOpenChange={setPhaseOpen}>
      <div className="space-y-2 rounded-md border bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-2 rounded-t-md px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {phaseOpen ? (
              <ChevronDownIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            )}
            <span className="text-sm font-medium text-muted-foreground">
              <span className="text-foreground capitalize">{phase.phase}</span>
              {" — "}
              {phase.description}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3 border-t px-3 pb-3 pt-2">
            {sortedDistributions.map(({ distribution, originalIndex }) => {
              const meta = schemaFieldMeta.get(distribution.columnName);
              return (
                <FieldDistributionEditor
                  key={`${distribution.columnName}-${phase.phase}`}
                  dist={distribution}
                  profileIdx={profileIdx}
                  phaseIdx={phaseIdx}
                  fieldIdx={originalIndex}
                  required={meta?.required ?? false}
                  hasVisibilityRule={meta?.hasVisibilityRule ?? false}
                  onUpdateWeight={onUpdateWeight}
                  onUpdateBehavior={onUpdateBehavior}
                  phase={phase.phase}
                />
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function FieldDistributionEditor({
  dist,
  profileIdx,
  phaseIdx,
  fieldIdx,
  required,
  hasVisibilityRule,
  onUpdateWeight,
  onUpdateBehavior,
  phase,
}: {
  dist: PhaseFieldDistribution;
  profileIdx: number;
  phaseIdx: number;
  fieldIdx: number;
  required: boolean;
  hasVisibilityRule: boolean;
  onUpdateWeight: (
    profileIdx: number,
    phaseIdx: number,
    fieldIdx: number,
    optionKey: string,
    value: number
  ) => void;
  onUpdateBehavior: (
    profileIdx: number,
    columnName: string,
    behavior: FieldValueBehavior
  ) => void;
  phase: "early" | "mid" | "late";
}) {
  const entries = Object.entries(dist.weights);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  const sumPct = Math.round(sum * 100);
  /** Within ~2 percentage points of 100% — only affects UI hint, not sampling. */
  const sumNearOne = Math.abs(sum - 1) < 0.02;
  const behavior = dist.behavior ?? "per_assessment";
  const showWeights = behavior !== "system" && (behavior !== "per_wound" || phase === "early");
  const showCarryThroughNote = behavior === "per_wound" && phase !== "early";

  const snapWeight = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{dist.fieldName}</span>
            {required && <Badge variant="destructive">Required</Badge>}
            {hasVisibilityRule && <Badge variant="outline">Conditional Visibility</Badge>}
            {behavior === "per_wound" && <Badge variant="secondary">Fixed per wound</Badge>}
            {behavior === "system" && <Badge variant="outline">System-controlled</Badge>}
          </div>
          {behavior !== "system" && (
            <div className="flex flex-wrap gap-2">
              <BehaviorButton
                active={behavior === "per_assessment"}
                onClick={() =>
                  onUpdateBehavior(profileIdx, dist.columnName, "per_assessment")
                }
              >
                Changes over time
              </BehaviorButton>
              <BehaviorButton
                active={behavior === "per_wound"}
                onClick={() => onUpdateBehavior(profileIdx, dist.columnName, "per_wound")}
              >
                Carry through this wound
              </BehaviorButton>
            </div>
          )}
          {dist.behaviorRationale && (
            <p className="text-xs text-muted-foreground">
              Suggested default: {labelForBehavior(dist.recommendedBehavior ?? behavior)}.{" "}
              {dist.behaviorRationale}
            </p>
          )}
        </div>
        {showWeights && (
          <span
            className={cn(
              "text-xs tabular-nums",
              sumNearOne
                ? "text-muted-foreground"
                : "font-semibold text-amber-700 dark:text-amber-500",
            )}
            title={
              sumNearOne
                ? undefined
                : "Weights are relative: generation divides by this total, so proportions stay the same as if the sum were 100%. No need to fix unless you want the percentage display to read 100%."
            }
          >
            Sum: {sumPct}%
            {!sumNearOne && (
              <span className="ml-1 font-normal text-muted-foreground">(relative)</span>
            )}
          </span>
        )}
      </div>
      {behavior === "system" && (
        <p className="text-xs text-muted-foreground">
          This field is driven by system wound-state semantics and is not tuned from generic
          profile weights.
        </p>
      )}
      {showCarryThroughNote && (
        <p className="text-xs text-muted-foreground">
          This field reuses the initial value distribution from the early phase. One value is
          chosen once for the wound and carried through later assessments.
        </p>
      )}
      {showWeights && (
        <div className="space-y-2">
          {behavior === "per_wound" && (
            <p className="text-xs text-muted-foreground">
              Initial value distribution. One value is chosen once for the wound and reused for
              later assessments.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {entries.map(([opt, weight]) => (
              <div key={opt} className="flex min-w-0 flex-col gap-1.5">
                <Label
                  htmlFor={`${dist.columnName}-${opt}`}
                  className="text-xs leading-snug text-foreground break-words"
                >
                  {formatOptionLabel(opt)}
                </Label>
                <Input
                  id={`${dist.columnName}-${opt}`}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={snapWeight(weight)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) {
                      onUpdateWeight(profileIdx, phaseIdx, fieldIdx, opt, snapWeight(v));
                    }
                  }}
                  className="h-9 w-full min-w-[6.5rem] text-sm tabular-nums"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BehaviorButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      className="h-8"
    >
      {children}
    </Button>
  );
}

function labelForBehavior(behavior: FieldValueBehavior): string {
  if (behavior === "per_wound") return "Carry through this wound";
  if (behavior === "system") return "System-controlled";
  return "Changes over time";
}

function formatOptionLabel(option: string): string {
  if (option === "true") return "Yes";
  if (option === "false") return "No";
  return option;
}

function getCanonicalWeights(
  profile: FieldProfileSet[number],
  columnName: string
): Record<string, number> | null {
  const distribution = getCanonicalDistribution(profile, columnName);
  return distribution ? { ...distribution.weights } : null;
}

function getCanonicalDistribution(
  profile: FieldProfileSet[number],
  columnName: string
): PhaseFieldDistribution | null {
  for (const phaseName of ["early", "mid", "late"] as const) {
    const phase = profile.phases.find((candidate) => candidate.phase === phaseName);
    const distribution = phase?.fieldDistributions.find(
      (candidate) => candidate.columnName === columnName
    );
    if (distribution?.weights) {
      return distribution;
    }
  }

  return null;
}
