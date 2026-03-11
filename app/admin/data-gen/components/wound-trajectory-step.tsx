"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { TrajectoryDistribution } from "@/lib/services/data-gen/generation-spec.types";

export interface TrajectoryConfig {
  trajectoryDistribution: TrajectoryDistribution;
  woundsPerPatient: number | [number, number];
  assessmentsPerWound: [number, number];
  woundBaselineAreaRange: [number, number];
  assessmentIntervalDays: number;
  assessmentTimingWobbleDays: number;
  missedAppointmentRate: number;
}

const DEFAULT_CONFIG: TrajectoryConfig = {
  trajectoryDistribution: {
    healing: 0.25,
    stable: 0.35,
    deteriorating: 0.3,
    treatmentChange: 0.1,
  },
  woundsPerPatient: 1,
  assessmentsPerWound: [8, 16],
  woundBaselineAreaRange: [5, 50],
  assessmentIntervalDays: 7,
  assessmentTimingWobbleDays: 2,
  missedAppointmentRate: 0.15,
};

interface WoundTrajectoryStepProps {
  patientCount: number;
  onConfigure: (config: TrajectoryConfig) => void;
  onBack: () => void;
}

export function WoundTrajectoryStep({
  patientCount,
  onConfigure,
  onBack,
}: WoundTrajectoryStepProps) {
  const [healing, setHealing] = useState(DEFAULT_CONFIG.trajectoryDistribution.healing * 100);
  const [stable, setStable] = useState(DEFAULT_CONFIG.trajectoryDistribution.stable * 100);
  const [deteriorating, setDeteriorating] = useState(
    DEFAULT_CONFIG.trajectoryDistribution.deteriorating * 100
  );
  const [treatmentChange, setTreatmentChange] = useState(
    DEFAULT_CONFIG.trajectoryDistribution.treatmentChange * 100
  );
  const [woundsPerPatient, setWoundsPerPatient] = useState(1);
  const [assessmentsMin, setAssessmentsMin] = useState(8);
  const [assessmentsMax, setAssessmentsMax] = useState(16);
  const [areaMin, setAreaMin] = useState(5);
  const [areaMax, setAreaMax] = useState(50);
  const [intervalDays, setIntervalDays] = useState(7);
  const [wobbleDays, setWobbleDays] = useState(2);
  const [missedRate, setMissedRate] = useState(15);

  const trajectorySum = healing + stable + deteriorating + treatmentChange;
  const trajectoryValid = Math.abs(trajectorySum - 100) < 0.5;

  const handleProceed = () => {
    onConfigure({
      trajectoryDistribution: {
        healing: healing / 100,
        stable: stable / 100,
        deteriorating: deteriorating / 100,
        treatmentChange: treatmentChange / 100,
      },
      woundsPerPatient,
      assessmentsPerWound: [assessmentsMin, assessmentsMax],
      woundBaselineAreaRange: [areaMin, areaMax],
      assessmentIntervalDays: intervalDays,
      assessmentTimingWobbleDays: wobbleDays,
      missedAppointmentRate: missedRate / 100,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 2: Wound & Trajectory Config</CardTitle>
        <CardDescription>
          Configure healing trajectory and wound count for {patientCount} selected patient
          {patientCount !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h4 className="font-medium">Wound Setup</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="woundsPerPatient">Wounds per patient</Label>
              <Input
                id="woundsPerPatient"
                type="number"
                min={1}
                max={5}
                value={woundsPerPatient}
                onChange={(e) => setWoundsPerPatient(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
            <div className="space-y-2">
              <Label>Assessments per wound (min – max)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={assessmentsMin}
                  onChange={(e) =>
                    setAssessmentsMin(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
                <span className="self-center">–</span>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={assessmentsMax}
                  onChange={(e) =>
                    setAssessmentsMax(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium">Healing Trajectory (must sum to 100%)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="healing">Fast healing (%)</Label>
              <Input
                id="healing"
                type="number"
                min={0}
                max={100}
                value={healing}
                onChange={(e) => setHealing(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground mt-1">Healed within ~4 weeks</p>
            </div>
            <div>
              <Label htmlFor="stable">Slow healing (%)</Label>
              <Input
                id="stable"
                type="number"
                min={0}
                max={100}
                value={stable}
                onChange={(e) => setStable(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground mt-1">Gradual improvement</p>
            </div>
            <div>
              <Label htmlFor="deteriorating">Non-healing (%)</Label>
              <Input
                id="deteriorating"
                type="number"
                min={0}
                max={100}
                value={deteriorating}
                onChange={(e) => setDeteriorating(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground mt-1">Chronic / no improvement</p>
            </div>
            <div>
              <Label htmlFor="treatmentChange">Treatment change (%)</Label>
              <Input
                id="treatmentChange"
                type="number"
                min={0}
                max={100}
                value={treatmentChange}
                onChange={(e) => setTreatmentChange(Math.max(0, parseFloat(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground mt-1">Starts flat, switches treatment</p>
            </div>
          </div>
          {!trajectoryValid && (
            <Alert variant="destructive">
              <AlertDescription>
                Trajectory percentages must sum to 100%. Current sum: {trajectorySum.toFixed(1)}%
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-4">
          <h4 className="font-medium">Assessment Timeline</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="intervalDays">Interval (days)</Label>
              <Input
                id="intervalDays"
                type="number"
                min={1}
                max={30}
                value={intervalDays}
                onChange={(e) =>
                  setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
            <div>
              <Label htmlFor="wobbleDays">Timing wobble (±days)</Label>
              <Input
                id="wobbleDays"
                type="number"
                min={0}
                max={7}
                value={wobbleDays}
                onChange={(e) =>
                  setWobbleDays(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
            </div>
            <div>
              <Label htmlFor="missedRate">Missed appointment rate (%)</Label>
              <Input
                id="missedRate"
                type="number"
                min={0}
                max={50}
                value={missedRate}
                onChange={(e) => setMissedRate(Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium">Wound Baseline Area (cm²)</h4>
          <div className="flex gap-4">
            <div>
              <Label htmlFor="areaMin">Min</Label>
              <Input
                id="areaMin"
                type="number"
                min={0.1}
                step={0.5}
                value={areaMin}
                onChange={(e) => setAreaMin(Math.max(0.1, parseFloat(e.target.value) || 0))}
              />
            </div>
            <div>
              <Label htmlFor="areaMax">Max</Label>
              <Input
                id="areaMax"
                type="number"
                min={1}
                step={1}
                value={areaMax}
                onChange={(e) => setAreaMax(Math.max(1, parseFloat(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleProceed} disabled={!trajectoryValid}>
            Continue to Describe Field Values
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
