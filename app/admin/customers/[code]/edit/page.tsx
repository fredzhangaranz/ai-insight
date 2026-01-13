"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, FormEvent } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useToast } from "@/components/ui/use-toast";

type AdminCustomer = {
  id: string;
  name: string;
  code: string;
  deploymentType: string | null;
  silhouetteVersion: string;
  silhouetteWebUrl: string | null;
  connectionMasked: string;
  connectionStatus: string;
  connectionLastVerifiedAt: string | null;
  connectionError?: string | null;
  lastDiscoveredAt: string | null;
  discoveryNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  code: string;
  silhouetteVersion: string;
  deploymentType: string | null;
  silhouetteWebUrl: string | null;
  connectionString: string;
  notes: string | null;
};

async function apiRequest<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Parse connection string and extract non-sensitive information
function parseConnectionString(connectionString: string): {
  server?: string;
  database?: string;
} | null {
  if (!connectionString?.trim()) return null;

  const server = connectionString.match(/Server\s*=\s*([^;]+)/i)?.[1]?.trim();
  const database = connectionString
    .match(/Database\s*=\s*([^;]+)/i)?.[1]
    ?.trim();

  if (!server && !database) return null;

  return { server, database };
}

const deploymentOptions = [
  { value: "on_prem", label: "On-Prem" },
  { value: "cloud", label: "Cloud" },
  { value: "other", label: "ARANZ Office Host" },
];

function EditCustomerContent() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;
  const { toast } = useToast();

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    code: "",
    silhouetteVersion: "",
    deploymentType: "other",
    silhouetteWebUrl: "",
    connectionString: "",
    notes: null,
  });
  const [originalFormState, setOriginalFormState] = useState<FormState>({
    name: "",
    code: "",
    silhouetteVersion: "",
    deploymentType: "other",
    silhouetteWebUrl: "",
    connectionString: "",
    notes: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionValid, setConnectionValid] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);

  useEffect(() => {
    const loadCustomer = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const customerData = await apiRequest<{ customer: AdminCustomer }>(
          `/api/admin/customers/${code}`
        );
        setCustomer(customerData.customer);

        const connData = await apiRequest<{ connectionString: string }>(
          `/api/admin/customers/${code}/connection-string`
        );

        const newFormState: FormState = {
          name: customerData.customer.name,
          code: customerData.customer.code,
          silhouetteVersion: customerData.customer.silhouetteVersion,
          deploymentType: customerData.customer.deploymentType ?? "other",
          silhouetteWebUrl: customerData.customer.silhouetteWebUrl ?? "",
          connectionString: connData.connectionString,
          notes: customerData.customer.discoveryNote ?? null,
        };

        setFormState(newFormState);
        setOriginalFormState(newFormState);
        setConnectionTested(false);
        setConnectionValid(false);
      } catch (error: any) {
        setLoadError(error?.message || "Unable to load customer");
        console.error("Error loading customer:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (code) {
      loadCustomer();
    }
  }, [code]);

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
      const response = await apiRequest<{
        status: string;
        silhouetteVersionDetected?: string | null;
        schemaVersionDetected?: string | null;
        details?: { dboTablesDetected: number; rptTablesDetected: number };
        error?: string;
      }>("/api/admin/customers/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectionString: formState.connectionString,
        }),
      });

      if (response.status === "ok") {
        setConnectionValid(true);
        setConnectionTested(true);
        toast({
          title: "Connection successful",
          description: response.details
            ? `Found ${response.details.dboTablesDetected} dbo tables and ${response.details.rptTablesDetected} rpt tables.`
            : "Connection verified successfully.",
        });

        // Auto-detect version if available
        if (response.silhouetteVersionDetected) {
          setFormState((state) => ({
            ...state,
            silhouetteVersion: response.silhouetteVersionDetected || "",
          }));
          toast({
            title: "Version auto-detected",
            description: `Silhouette version ${response.silhouetteVersionDetected} detected (Schema version ${response.schemaVersionDetected}).`,
          });
        } else if (response.schemaVersionDetected) {
          toast({
            title: "Unknown schema version",
            description: `Schema version ${response.schemaVersionDetected} is not mapped to a Silhouette version. Please enter the version manually.`,
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
          description: response.error || "Unable to connect to database.",
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

  // Detect if any fields have changed
  const hasChanges =
    formState.name !== originalFormState.name ||
    formState.deploymentType !== originalFormState.deploymentType ||
    formState.silhouetteWebUrl !== originalFormState.silhouetteWebUrl ||
    formState.connectionString !== originalFormState.connectionString ||
    formState.notes !== originalFormState.notes;

  // Connection string has been modified
  const connectionStringModified =
    formState.connectionString !== originalFormState.connectionString;

  // Determine if update button should be disabled and why
  const getUpdateButtonState = () => {
    if (isSubmitting) {
      return {
        disabled: true,
        reason: "Saving...",
      };
    }

    if (!hasChanges) {
      return {
        disabled: true,
        reason: "No changes made",
      };
    }

    if (connectionStringModified) {
      if (!connectionTested) {
        return {
          disabled: true,
          reason: "Connection string changed - test required",
        };
      }

      if (!connectionValid) {
        return {
          disabled: true,
          reason: "Connection test failed - fix and retest",
        };
      }
    }

    return {
      disabled: false,
      reason: "",
    };
  };

  const buttonState = getUpdateButtonState();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await apiRequest(`/api/admin/customers/${code}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: formState.name,
          silhouetteVersion: formState.silhouetteVersion,
          deploymentType: formState.deploymentType,
          silhouetteWebUrl: formState.silhouetteWebUrl?.trim() || null,
          connectionString: formState.connectionString || undefined,
          discoveryNote: formState.notes?.trim() || null,
        }),
      });

      toast({
        title: "Customer updated",
        description: `${formState.name} has been updated successfully.`,
      });

      router.push("/admin/customers");
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message ?? "Unable to update customer.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/admin/customers")}
          className="gap-2"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Customers
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">Loading customer...</div>
            </div>
          </CardContent>
        </Card>
      ) : customer ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Customer: {customer.name}</CardTitle>
            <CardDescription>
              Update customer information and connection settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-name">
                    Customer name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customer-name"
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
                    disabled
                    value={formState.code}
                    placeholder="STMARYS"
                  />
                  <p className="text-xs text-muted-foreground">
                    Customer code cannot be changed
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="silhouette-version">
                    Silhouette version <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="silhouette-version"
                    required
                    readOnly
                    value={formState.silhouetteVersion}
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    To change version, test a new connection
                  </p>
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
                <div className="space-y-2">
                  {(() => {
                    const parsed = parseConnectionString(
                      formState.connectionString
                    );
                    return parsed ? (
                      <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-3">
                        <div className="font-medium mb-2">
                          Current connection:
                        </div>
                        {parsed.server && (
                          <div className="mb-1">
                            • Server:{" "}
                            <code className="bg-white px-2 py-1 rounded text-blue-900 font-mono">
                              {parsed.server}
                            </code>
                          </div>
                        )}
                        {parsed.database && (
                          <div>
                            • Database:{" "}
                            <code className="bg-white px-2 py-1 rounded text-blue-900 font-mono">
                              {parsed.database}
                            </code>
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-700">
                          To update the connection, enter a new connection
                          string below. Leave empty to keep the existing
                          connection.
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-3">
                        No connection string on file. Enter one to establish the
                        connection.
                      </div>
                    );
                  })()}
                </div>
                <Textarea
                  id="connection-string"
                  rows={5}
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
                      {connectionValid
                        ? "✓ Connection OK"
                        : "✗ Connection Failed"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Connection strings contain sensitive credentials. They are
                  encrypted at rest and never displayed in full.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Internal notes (optional)</Label>
                <Textarea
                  id="notes"
                  rows={4}
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

              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/admin/customers")}
                >
                  Cancel
                </Button>
                <div className="flex flex-col items-end gap-2">
                  <Button type="submit" disabled={buttonState.disabled}>
                    {isSubmitting ? "Saving..." : "Update customer"}
                  </Button>
                  {buttonState.reason && (
                    <p className="text-xs text-muted-foreground">
                      {buttonState.reason}
                    </p>
                  )}
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EditCustomerPage() {
  return (
    <ProtectedRoute requireAdmin>
      <EditCustomerContent />
    </ProtectedRoute>
  );
}

export default EditCustomerPage;
