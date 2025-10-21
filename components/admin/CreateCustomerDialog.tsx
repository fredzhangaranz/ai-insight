"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Parse connection string and extract non-sensitive information
function parseConnectionString(
  connectionString: string
): { server?: string; database?: string } | null {
  if (!connectionString?.trim()) return null;

  const server = connectionString.match(/Server\s*=\s*([^;]+)/i)?.[1]?.trim();
  const database = connectionString
    .match(/Database\s*=\s*([^;]+)/i)?.[1]
    ?.trim();

  if (!server && !database) return null;

  return { server, database };
}

export type CreateCustomerPayload = {
  name: string;
  code: string;
  silhouetteVersion: string;
  deploymentType?: string | null;
  silhouetteWebUrl?: string | null;
  connectionString: string;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateCustomerPayload) => Promise<void>;
  isSubmitting?: boolean;
  initialData?: CreateCustomerPayload;
  mode?: "create" | "edit";
};

const deploymentOptions = [
  { value: "on_prem", label: "On-Prem" },
  { value: "cloud", label: "Cloud" },
  { value: "other", label: "ARANZ Office Host" },
];

const initialState: CreateCustomerPayload = {
  name: "",
  code: "",
  silhouetteVersion: "",
  deploymentType: "other",
  silhouetteWebUrl: "",
  connectionString: "",
  notes: "",
};

export function CreateCustomerDialog({
  open,
  onOpenChange,
  onCreate,
  isSubmitting,
  initialData,
  mode = "create",
}: Props) {
  const [formState, setFormState] = useState<CreateCustomerPayload>(
    initialData || initialState
  );
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isDetectingVersion, setIsDetectingVersion] = useState(false);
  const [connectionValid, setConnectionValid] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      // When dialog opens, populate with initialData if provided
      if (initialData) {
        setFormState(initialData);
      } else {
        // Fresh create - reset to initial state
        setFormState(initialState);
      }
    } else {
      // When dialog closes, reset form state
      setFormState(initialData || initialState);
      setConnectionValid(false);
      setConnectionTested(false);
    }
  }, [open, initialData]);

  const handleTestConnection = async () => {
    if (!formState.connectionString.trim()) {
      toast({
        title: "Connection string required",
        description: "Please enter a connection string first.",
        variant: "destructive",
      });
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = await fetch("/api/admin/customers/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionString: formState.connectionString,
        }),
      });

      const result = await response.json();

      if (result.status === "ok") {
        setConnectionValid(true);
        setConnectionTested(true);
        toast({
          title: "Connection successful",
          description: `Found ${result.details.dboTablesDetected} dbo tables and ${result.details.rptTablesDetected} rpt tables.`,
        });

        // Auto-detect version if available
        if (result.silhouetteVersionDetected) {
          setFormState((state) => ({
            ...state,
            silhouetteVersion: result.silhouetteVersionDetected,
          }));
          toast({
            title: "Version auto-detected",
            description: `Silhouette version ${result.silhouetteVersionDetected} detected (Schema version ${result.schemaVersionDetected}).`,
          });
        } else if (result.schemaVersionDetected) {
          toast({
            title: "Unknown schema version",
            description: `Schema version ${result.schemaVersionDetected} is not mapped to a Silhouette version. Please enter the version manually.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Version not detected",
            description:
              "Could not detect Silhouette version from database. The dbo.Version table may not exist.",
            variant: "destructive",
          });
        }
      } else {
        setConnectionValid(false);
        setConnectionTested(true);
        toast({
          title: "Connection failed",
          description: result.error || "Unable to connect to database.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setConnectionValid(false);
      setConnectionTested(true);
      toast({
        title: "Test failed",
        description: "An error occurred while testing the connection.",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDetectVersion = async () => {
    if (!formState.connectionString.trim()) {
      toast({
        title: "Connection string required",
        description: "Please enter a connection string first.",
        variant: "destructive",
      });
      return;
    }

    if (!connectionValid) {
      toast({
        title: "Test connection first",
        description: "Please test the connection before detecting version.",
        variant: "destructive",
      });
      return;
    }

    setIsDetectingVersion(true);
    try {
      const response = await fetch("/api/admin/customers/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionString: formState.connectionString,
        }),
      });

      const result = await response.json();

      if (result.status === "ok") {
        if (result.silhouetteVersionDetected) {
          setFormState((state) => ({
            ...state,
            silhouetteVersion: result.silhouetteVersionDetected,
          }));
          toast({
            title: "Version detected",
            description: `Silhouette version ${result.silhouetteVersionDetected} detected (Schema version ${result.schemaVersionDetected}).`,
          });
        } else if (result.schemaVersionDetected) {
          toast({
            title: "Unknown schema version",
            description: `Schema version ${result.schemaVersionDetected} is not mapped to a Silhouette version. Please enter the version manually.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Version not detected",
            description:
              "Could not detect Silhouette version from database. The dbo.Version table may not exist.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Connection failed",
          description: result.error || "Unable to connect to database.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Detection failed",
        description: "An error occurred while detecting the version.",
        variant: "destructive",
      });
    } finally {
      setIsDetectingVersion(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onCreate({
      ...formState,
      code: formState.code.toUpperCase(),
      silhouetteWebUrl: formState.silhouetteWebUrl?.trim() || null,
      notes: formState.notes?.trim() || null,
      deploymentType: formState.deploymentType || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit Customer" : "Add Customer"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update customer information and connection settings."
              : "Register a customer's Silhouette demo database connection. See "}
            {mode === "create" && (
              <>
                <a
                  href="/docs/design/semantic_layer/workflows_and_ui"
                  className="text-primary underline"
                >
                  onboarding workflow
                </a>{" "}
                for detailed steps.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">
                Customer name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customer-name"
                autoFocus
                required
                value={formState.name}
                onChange={(event) =>
                  setFormState((state) => ({
                    ...state,
                    name: event.target.value,
                  }))
                }
                placeholder="St. Mary's Hospital"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-code">
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="customer-code"
                required
                maxLength={10}
                value={formState.code}
                onChange={(event) =>
                  setFormState((state) => ({
                    ...state,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="STMARYS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="silhouette-version">
                Silhouette version <span className="text-red-500">*</span>
                <span className="ml-1 text-xs text-muted-foreground">
                  (auto-detected)
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="silhouette-version"
                  required
                  readOnly
                  value={formState.silhouetteVersion}
                  placeholder="Click 'Detect Version' →"
                  className="bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDetectVersion}
                  disabled={isDetectingVersion || !connectionValid}
                >
                  {isDetectingVersion ? "Detecting..." : "Detect Version"}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deployment-type">Deployment</Label>
              <Select
                value={formState.deploymentType ?? "other"}
                onValueChange={(value) =>
                  setFormState((state) => ({
                    ...state,
                    deploymentType: value,
                  }))
                }
              >
                <SelectTrigger id="deployment-type">
                  <SelectValue placeholder="Select deployment" />
                </SelectTrigger>
                <SelectContent>
                  {deploymentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="silhouette-url">
              Silhouette admin URL (optional)
            </Label>
            <Input
              id="silhouette-url"
              value={formState.silhouetteWebUrl ?? ""}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  silhouetteWebUrl: event.target.value,
                }))
              }
              placeholder="https://silhouette.stmarys.local"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="connection-string">
              Connection string <span className="text-red-500">*</span>
            </Label>
            {mode === "edit" && (
              <div className="space-y-2">
                {(() => {
                  const parsed = parseConnectionString(
                    formState.connectionString
                  );
                  return parsed ? (
                    <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                      <div className="font-medium mb-1">
                        Current connection:
                      </div>
                      {parsed.server && (
                        <div>
                          • Server:{" "}
                          <code className="bg-white px-1 rounded">
                            {parsed.server}
                          </code>
                        </div>
                      )}
                      {parsed.database && (
                        <div>
                          • Database:{" "}
                          <code className="bg-white px-1 rounded">
                            {parsed.database}
                          </code>
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-blue-200 text-xs">
                        To update, enter a new connection string below.
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                      No connection string on file. Enter one to establish the
                      connection.
                    </div>
                  );
                })()}
              </div>
            )}
            <Textarea
              id="connection-string"
              required={mode === "create"}
              rows={4}
              value={formState.connectionString}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  connectionString: event.target.value,
                }))
              }
              placeholder="Server=demo-sql;Database=SilhouetteDemo;User Id=insightgen_service;Password=***;Encrypt=true;"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={
                  isTestingConnection || !formState.connectionString.trim()
                }
              >
                {isTestingConnection ? "Testing..." : "Test Connection"}
              </Button>
              {connectionTested && (
                <span
                  className={`text-xs font-medium ${
                    connectionValid ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {connectionValid ? "✓ Connection OK" : "✗ Connection Failed"}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal notes (optional)</Label>
            <Textarea
              id="notes"
              rows={3}
              value={formState.notes ?? ""}
              onChange={(event) =>
                setFormState((state) => ({
                  ...state,
                  notes: event.target.value,
                }))
              }
              placeholder="VPN instructions, support contact, etc."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (mode === "create" && !connectionValid) ||
                (mode === "create" && !connectionTested) ||
                !formState.name.trim() ||
                !formState.code.trim() ||
                !formState.silhouetteVersion.trim()
              }
            >
              {isSubmitting
                ? "Saving..."
                : mode === "edit"
                ? "Update customer"
                : "Create customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
