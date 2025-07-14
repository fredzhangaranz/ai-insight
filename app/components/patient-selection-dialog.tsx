"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LoadingDots } from "./loading-dots";

// Type for a single patient record from our API
type Patient = {
  patientId: string;
  firstName: string;
  lastName: string;
  patientName: string;
};

interface PatientSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentFormId: string;
  onPatientSelect: (patientId: string) => void;
  question: string;
}

export function PatientSelectionDialog({
  isOpen,
  onClose,
  assessmentFormId,
  onPatientSelect,
  question,
}: PatientSelectionDialogProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchPatients = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch(
            `/api/assessment-forms/${assessmentFormId}/patients`
          );
          if (!response.ok) {
            throw new Error("Failed to fetch patients.");
          }
          const data: Patient[] = await response.json();
          setPatients(data);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setIsLoading(false);
        }
      };
      fetchPatients();
    }
  }, [isOpen, assessmentFormId]);

  const handleSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsComboboxOpen(false);
  };

  const handleGenerate = () => {
    if (selectedPatient) {
      onPatientSelect(selectedPatient.patientId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select a Patient</DialogTitle>
          <DialogDescription>{question}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <LoadingDots />
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isComboboxOpen}
                  className="w-full justify-between"
                >
                  {selectedPatient
                    ? selectedPatient.patientName
                    : "Select patient..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search patient..." />
                  <CommandEmpty>No patient found.</CommandEmpty>
                  <CommandList className="max-h-[200px] overflow-y-auto">
                    <CommandGroup>
                      {patients.map((patient) => (
                        <CommandItem
                          key={patient.patientId}
                          value={patient.patientName}
                          onSelect={() => handleSelect(patient)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPatient?.patientId === patient.patientId
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          {patient.patientName}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleGenerate} disabled={!selectedPatient}>
            Fetch Data & Generate Chart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
