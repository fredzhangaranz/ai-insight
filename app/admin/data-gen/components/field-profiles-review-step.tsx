"use client";

import { useMemo, useState } from "react";
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
} from "@/lib/services/data-gen/trajectory-field-profile.types";
import type { TrajectorySelectionResult } from "@/lib/services/data-gen/trajectory-selector";
import type { FieldSchema } from "@/lib/services/data-gen/generation-spec.types";
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
    const selectableFields = (formSchema ?? []).filter(
      (field) =>
        (field.dataType === "SingleSelectList" || field.dataType === "MultiSelectList") &&
        (field.options?.length ?? 0) > 0
    );
    selectableFields.forEach((field, idx) => {
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
      dist.weights[optionKey] = Math.max(0, Math.min(1, value));
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
            Required selectable fields:{" "}
            <span className="font-medium">
              {schemaRequiredSelectableCount}/{schemaFieldMeta.size}
            </span>
            . Required fields are still generated; profile weights only tune option likelihood.
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
                        onUpdateWeight={updateWeight}
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
  onUpdateWeight,
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
  onUpdateWeight: (
    profileIdx: number,
    phaseIdx: number,
    fieldIdx: number,
    optionKey: string,
    value: number
  ) => void;
}) {
  const [phaseOpen, setPhaseOpen] = useState(true);

  const sortedDistributions = phase.fieldDistributions
    .map((distribution, originalIndex) => ({ distribution, originalIndex }))
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
}) {
  const entries = Object.entries(dist.weights);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  const sumPct = Math.round(sum * 100);
  /** Within ~2 percentage points of 100% — only affects UI hint, not sampling. */
  const sumNearOne = Math.abs(sum - 1) < 0.02;

  const snapWeight = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{dist.fieldName}</span>
          {required && <Badge variant="destructive">Required</Badge>}
          {hasVisibilityRule && <Badge variant="outline">Conditional Visibility</Badge>}
        </div>
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
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {entries.map(([opt, weight]) => (
          <div key={opt} className="flex min-w-0 flex-col gap-1.5">
            <Label
              htmlFor={`${dist.columnName}-${opt}`}
              className="text-xs leading-snug text-foreground break-words"
            >
              {opt}
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
  );
}
