"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type {
  FieldProfileSet,
  TrajectoryFieldProfile,
  TrajectoryPhaseProfile,
  PhaseFieldDistribution,
} from "@/lib/services/data-gen/trajectory-field-profile.types";
import type { TrajectorySelectionResult } from "@/lib/services/data-gen/trajectory-selector";
import { AlertCircle, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FieldProfilesReviewStepProps {
  profiles: FieldProfileSet;
  onProceed: (profiles: FieldProfileSet) => void;
  onBack: () => void;
  trajectorySelection?: TrajectorySelectionResult;
}

export function FieldProfilesReviewStep({
  profiles: initialProfiles,
  onProceed,
  onBack,
  trajectorySelection,
}: FieldProfilesReviewStepProps) {
  const [profiles, setProfiles] = useState<FieldProfileSet>(initialProfiles);
  const [openProfile, setOpenProfile] = useState<string | null>(
    initialProfiles[0]?.trajectoryStyle ?? null
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
          distributions during generation.
        </p>

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
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 rounded-lg"
                  >
                    {openProfile === profile.trajectoryStyle ? (
                      <ChevronDownIcon className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4 shrink-0" />
                    )}
                    <span className="font-medium">{profile.trajectoryStyle}</span>
                    <span className="text-sm text-muted-foreground truncate">
                      — {profile.clinicalSummary}
                    </span>
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
  onUpdateWeight,
}: {
  phase: TrajectoryPhaseProfile;
  profileIdx: number;
  phaseIdx: number;
  onUpdateWeight: (
    profileIdx: number,
    phaseIdx: number,
    fieldIdx: number,
    optionKey: string,
    value: number
  ) => void;
}) {
  return (
    <div className="space-y-2">
      <h5 className="text-sm font-medium text-muted-foreground">
        {phase.phase} — {phase.description}
      </h5>
      <div className="space-y-3 pl-4">
        {phase.fieldDistributions?.map((dist, fieldIdx) => (
          <FieldDistributionEditor
            key={`${dist.columnName}-${phase.phase}`}
            dist={dist}
            profileIdx={profileIdx}
            phaseIdx={phaseIdx}
            fieldIdx={fieldIdx}
            onUpdateWeight={onUpdateWeight}
          />
        ))}
      </div>
    </div>
  );
}

function FieldDistributionEditor({
  dist,
  profileIdx,
  phaseIdx,
  fieldIdx,
  onUpdateWeight,
}: {
  dist: PhaseFieldDistribution;
  profileIdx: number;
  phaseIdx: number;
  fieldIdx: number;
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

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{dist.fieldName}</span>
        <span className="text-xs text-muted-foreground">
          Sum: {(sum * 100).toFixed(0)}%
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {entries.map(([opt, weight]) => (
          <div key={opt} className="flex items-center gap-2">
            <Label htmlFor={`${dist.columnName}-${opt}`} className="text-xs truncate min-w-0">
              {opt}
            </Label>
            <Input
              id={`${dist.columnName}-${opt}`}
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={weight}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) {
                  onUpdateWeight(profileIdx, phaseIdx, fieldIdx, opt, v);
                }
              }}
              className="h-8 w-16 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
