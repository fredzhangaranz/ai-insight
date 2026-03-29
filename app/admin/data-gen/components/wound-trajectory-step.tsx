"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RangeSlider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  SingleTrajectoryType,
  TrajectoryDistribution,
} from "@/lib/services/data-gen/generation-spec.types";

const SINGLE_TRAJECTORY_OPTIONS: {
  value: SingleTrajectoryType;
  label: string;
  description: string;
}[] = [
  { value: "healing", label: "Fast healing", description: "Healed within ~4 weeks" },
  { value: "stable", label: "Slow healing", description: "Gradual improvement over time" },
  { value: "deteriorating", label: "Non-healing", description: "Chronic / no improvement" },
  { value: "treatmentChange", label: "Treatment change", description: "Starts flat, switches treatment" },
];

const PERIOD_PRESETS = [
  { label: "2 weeks", days: 14 },
  { label: "4 weeks", days: 28 },
  { label: "6 weeks", days: 42 },
  { label: "8 weeks", days: 56 },
  { label: "12 weeks", days: 84 },
] as const;

export interface TrajectoryConfig {
  trajectoryDistribution: TrajectoryDistribution;
  woundsPerPatient: number | [number, number];
  assessmentsPerWound: [number, number];
  woundBaselineAreaRange: [number, number];
  assessmentIntervalDays: number;
  assessmentTimingWobbleDays: number;
  missedAppointmentRate: number;
  assessmentPeriodDays?: number;
  assessmentStartDate?: string;
  /** Explicit trajectory per wound slot (Tier 1). When present, overrides trajectoryDistribution. */
  trajectoryAssignments?: SingleTrajectoryType[];
  /** When true, each wound gets a random trajectory (Tier 2). */
  trajectoryRandomisePerPatient?: boolean;
}

function defaultStartDate(periodDays: number): string {
  return format(subDays(new Date(), periodDays), "yyyy-MM-dd");
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
  assessmentPeriodDays: 28,
  assessmentStartDate: defaultStartDate(28),
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
  const [singleTrajectoryType, setSingleTrajectoryType] =
    useState<SingleTrajectoryType>("healing");
  const [perWoundAssignments, setPerWoundAssignments] = useState<SingleTrajectoryType[]>([]);
  const [randomisePerPatient, setRandomisePerPatient] = useState(false);
  const [woundsPerPatient, setWoundsPerPatient] = useState(1);
  const [assessmentsMin, setAssessmentsMin] = useState(8);
  const [assessmentsMax, setAssessmentsMax] = useState(16);
  const [areaMin, setAreaMin] = useState(5);
  const [areaMax, setAreaMax] = useState(50);
  const [intervalDays, setIntervalDays] = useState(7);
  const [wobbleDays, setWobbleDays] = useState(2);
  const [missedRate, setMissedRate] = useState(15);
  const [periodDays, setPeriodDays] = useState(28);
  const [periodCustom, setPeriodCustom] = useState(false);
  const [startDate, setStartDate] = useState<Date>(
    () => subDays(new Date(), 28)
  );

  const isSingleWound = woundsPerPatient === 1;
  const trajectoryValid = true;

  const getPerWoundAssignmentsForCount = (n: number): SingleTrajectoryType[] => {
    const current = perWoundAssignments;
    if (current.length === n) return current;
    if (current.length < n) {
      return [...current, ...Array(n - current.length).fill("healing")] as SingleTrajectoryType[];
    }
    return current.slice(0, n);
  };

  const assignments = getPerWoundAssignmentsForCount(woundsPerPatient);

  const setAssignmentForWound = (index: number, value: SingleTrajectoryType) => {
    setPerWoundAssignments((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push("healing");
      next[index] = value;
      return next;
    });
  };

  const buildTrajectoryDistribution = (): TrajectoryDistribution => {
    if (isSingleWound) {
      return {
        healing: singleTrajectoryType === "healing" ? 1 : 0,
        stable: singleTrajectoryType === "stable" ? 1 : 0,
        deteriorating: singleTrajectoryType === "deteriorating" ? 1 : 0,
        treatmentChange: singleTrajectoryType === "treatmentChange" ? 1 : 0,
      };
    }
    return {
      healing: 0.25,
      stable: 0.25,
      deteriorating: 0.25,
      treatmentChange: 0.25,
    };
  };

  const handleWoundsPerPatientChange = (value: number) => {
    const prev = woundsPerPatient;
    setWoundsPerPatient(value);
    if (prev === 1 && value > 1) {
      setPerWoundAssignments(Array(value).fill("healing") as SingleTrajectoryType[]);
    } else if (prev > 1 && value === 1) {
      setSingleTrajectoryType(assignments[0] ?? "healing");
    } else if (prev > 1 && value > 1) {
      setPerWoundAssignments(getPerWoundAssignmentsForCount(value));
    }
  };

  const handleProceed = () => {
    const config: TrajectoryConfig = {
      trajectoryDistribution: buildTrajectoryDistribution(),
      woundsPerPatient,
      assessmentsPerWound: [assessmentsMin, assessmentsMax],
      woundBaselineAreaRange: [areaMin, areaMax],
      assessmentIntervalDays: intervalDays,
      assessmentTimingWobbleDays: wobbleDays,
      missedAppointmentRate: missedRate / 100,
      assessmentPeriodDays: periodDays,
      assessmentStartDate: format(startDate, "yyyy-MM-dd"),
    };
    if (isSingleWound) {
      config.trajectoryAssignments = [singleTrajectoryType];
    } else if (randomisePerPatient) {
      config.trajectoryRandomisePerPatient = true;
    } else {
      config.trajectoryAssignments = assignments;
    }
    onConfigure(config);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Wound & Trajectory Config</CardTitle>
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
                onChange={(e) =>
                  handleWoundsPerPatientChange(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Assessments per wound (min – max)</Label>
              <div className="flex items-center gap-4">
                <RangeSlider
                  className="flex-1"
                  min={1}
                  max={52}
                  step={1}
                  value={[assessmentsMin, assessmentsMax]}
                  onValueChange={([min, max]) => {
                    setAssessmentsMin(min);
                    setAssessmentsMax(max);
                  }}
                />
                <div className="flex gap-2 w-40 shrink-0">
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    className="w-16"
                    value={assessmentsMin}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setAssessmentsMin(v);
                      if (v >= assessmentsMax) setAssessmentsMax(v + 1);
                    }}
                  />
                  <span className="self-center">–</span>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    className="w-16"
                    value={assessmentsMax}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setAssessmentsMax(v);
                      if (v <= assessmentsMin) setAssessmentsMin(v - 1);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium">Assessment Period</h4>
          <p className="text-sm text-muted-foreground">
            Only assessments within this date range will be generated. Wounds with no assessments in
            the window are skipped.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Period</Label>
              <div className="flex flex-wrap gap-2">
                {PERIOD_PRESETS.map((p) => (
                  <Button
                    key={p.days}
                    type="button"
                    variant={!periodCustom && periodDays === p.days ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPeriodCustom(false);
                      setPeriodDays(p.days);
                      setStartDate(subDays(new Date(), p.days));
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={periodCustom ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriodCustom(true)}
                >
                  Custom
                </Button>
              </div>
              {periodCustom && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={periodDays}
                    onChange={(e) =>
                      setPeriodDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 1)))
                    }
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto min-w-[288px] p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                End: {format(new Date(startDate.getTime() + periodDays * 86400000), "PPP")}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-medium">
            {isSingleWound ? "Healing Trajectory" : "Healing Trajectory"}
          </h4>
          {isSingleWound ? (
            <>
              <p className="text-sm text-muted-foreground">
                Choose one trajectory type for this wound. The assessments will follow a realistic
                healing pattern over the selected period.
              </p>
              <RadioGroup
                value={singleTrajectoryType}
                onValueChange={(v) => setSingleTrajectoryType(v as SingleTrajectoryType)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {SINGLE_TRAJECTORY_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className={cn(
                      "flex items-start space-x-3 rounded-lg border p-4",
                      singleTrajectoryType === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:bg-muted/50"
                    )}
                  >
                    <RadioGroupItem value={opt.value} id={`traj-${opt.value}`} />
                    <Label
                      htmlFor={`traj-${opt.value}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      <span className="font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="randomise-per-patient" className="font-medium">
                    Randomise trajectory per patient
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Each wound will be randomly assigned a trajectory type. Creates variety across{" "}
                    {patientCount} patient{patientCount !== 1 ? "s" : ""}.
                  </p>
                </div>
                <Switch
                  id="randomise-per-patient"
                  checked={randomisePerPatient}
                  onCheckedChange={setRandomisePerPatient}
                />
              </div>
              {!randomisePerPatient && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Assign a trajectory type to each wound. This pattern applies to all{" "}
                    {patientCount} patient{patientCount !== 1 ? "s" : ""}.
                  </p>
                  <div className="space-y-4">
                    {Array.from({ length: woundsPerPatient }, (_, i) => (
                      <div key={i} className="space-y-2">
                        <Label className="font-medium">Wound {i + 1}</Label>
                        <RadioGroup
                          value={assignments[i] ?? "healing"}
                          onValueChange={(v) => setAssignmentForWound(i, v as SingleTrajectoryType)}
                          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                        >
                          {SINGLE_TRAJECTORY_OPTIONS.map((opt) => (
                            <div
                              key={opt.value}
                              className={cn(
                                "flex items-center space-x-2 rounded-md border px-3 py-2",
                                (assignments[i] ?? "healing") === opt.value
                                  ? "border-primary bg-primary/5"
                                  : "border-muted hover:bg-muted/50"
                              )}
                            >
                              <RadioGroupItem
                                value={opt.value}
                                id={`wound-${i}-${opt.value}`}
                              />
                              <Label
                                htmlFor={`wound-${i}-${opt.value}`}
                                className="cursor-pointer font-normal text-sm"
                              >
                                {opt.label}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
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
          <div className="flex items-center gap-4">
            <RangeSlider
              className="flex-1"
              min={0.1}
              max={200}
              step={0.5}
              value={[areaMin, areaMax]}
              onValueChange={([min, max]) => {
                setAreaMin(min);
                setAreaMax(max);
              }}
            />
            <div className="flex gap-2 w-40 shrink-0">
              <Input
                id="areaMin"
                type="number"
                min={0.1}
                step={0.5}
                className="w-16"
                value={areaMin}
                onChange={(e) => {
                  const v = Math.max(0.1, parseFloat(e.target.value) || 0);
                  setAreaMin(v);
                  if (v >= areaMax) setAreaMax(v + 0.5);
                }}
              />
              <span className="self-center">–</span>
              <Input
                id="areaMax"
                type="number"
                min={0.1}
                step={1}
                className="w-16"
                value={areaMax}
                onChange={(e) => {
                  const v = Math.max(1, parseFloat(e.target.value) || 0);
                  setAreaMax(v);
                  if (v <= areaMin) setAreaMin(Math.max(0.1, v - 0.5));
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleProceed} disabled={!trajectoryValid}>
            Continue to Review Field Profiles
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
