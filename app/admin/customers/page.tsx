"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PlusIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";

import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

import {
  CreateCustomerDialog,
  CreateCustomerPayload,
} from "@/components/admin/CreateCustomerDialog";
type ConnectionSummary = {
  status: string;
  masked?: string;
  lastVerifiedAt: string | null;
  error?: string;
};

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
  stats?: {
    formsDiscovered: number | null;
    fieldsDiscovered: number | null;
    avgConfidence: number | null;
    lastDiscoveryRunAt: string | null;
  };
  connectionSummary?: ConnectionSummary;
};

type CustomersResponse = {
  customers: AdminCustomer[];
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

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

function ConnectionStatusBadge({ summary }: { summary: ConnectionSummary }) {
  const status = summary.status ?? "unknown";
  switch (status) {
    case "ok":
      return (
        <Badge
          variant="secondary"
          className="gap-1 text-green-700 bg-green-50 border-green-200"
        >
          <CheckCircleIcon className="h-4 w-4" />
          Healthy
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <ExclamationTriangleIcon className="h-4 w-4" />
          Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <SignalIcon className="h-4 w-4" />
          Unknown
        </Badge>
      );
  }
}

function CustomersPageContent() {
  const { toast } = useToast();
  const router = useRouter();

  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [testingConnectionCode, setTestingConnectionCode] = useState<
    string | null
  >(null);

  const refreshCustomers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<CustomersResponse>(
        "/api/admin/customers?includeStats=true"
      );
      setCustomers(data.customers);
    } catch (error: any) {
      setLoadError(error?.message || "Unable to load customers");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomers();
  }, [refreshCustomers]);

  const counts = useMemo(() => {
    const total = customers.length;
    const active = customers.filter((customer) => customer.isActive).length;
    const healthy = customers.filter(
      (customer) => customer.connectionStatus === "ok"
    ).length;
    const needsReview = customers.filter(
      (customer) => customer.connectionStatus === "failed"
    ).length;
    return { total, active, healthy, needsReview };
  }, [customers]);

  const handleCreateCustomer = async (payload: CreateCustomerPayload) => {
    setSubmitting(true);
    try {
      await apiRequest("/api/admin/customers", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({
        title: "Customer created",
        description: `${payload.name} is ready for discovery.`,
      });
      setCreateOpen(false);
      await refreshCustomers();
    } catch (error: any) {
      toast({
        title: "Unable to create customer",
        description: error?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCustomer = async (customer: AdminCustomer) => {
    router.push(`/admin/customers/${customer.code}/edit`);
  };

  const handleTestConnection = async (customer: AdminCustomer) => {
    setTestingConnectionCode(customer.code);
    try {
      const result = await apiRequest<{
        status: string;
        silhouetteVersionDetected?: string | null;
        error?: string;
      }>(`/api/admin/customers/${customer.code}/test-connection`, {
        method: "POST",
      });

      if (result.status === "ok") {
        toast({
          title: "Connection healthy",
          description: result.silhouetteVersionDetected
            ? `Detected Silhouette version ${result.silhouetteVersionDetected}`
            : "Connection verified successfully.",
        });
      } else {
        toast({
          title: "Connection failed",
          description:
            result.error ?? "Unable to connect with stored credentials.",
          variant: "destructive",
        });
      }

      await refreshCustomers();
    } catch (error: any) {
      toast({
        title: "Connection test failed",
        description:
          error?.message ?? "Unexpected error running connectivity probe.",
        variant: "destructive",
      });
    } finally {
      setTestingConnectionCode(null);
    }
  };

  const handleDeactivate = async (customer: AdminCustomer) => {
    if (
      !window.confirm(
        `Deactivate ${customer.name}? They will be hidden from consultants.`
      )
    ) {
      return;
    }
    try {
      await apiRequest(`/api/admin/customers/${customer.code}`, {
        method: "DELETE",
      });
      toast({
        title: "Customer deactivated",
        description: `${customer.name} is no longer active.`,
      });
      await refreshCustomers();
    } catch (error: any) {
      toast({
        title: "Unable to deactivate customer",
        description: error?.message ?? "Unexpected error.",
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async (customer: AdminCustomer) => {
    try {
      await apiRequest(`/api/admin/customers/${customer.code}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      toast({
        title: "Customer reactivated",
        description: `${customer.name} is active again.`,
      });
      await refreshCustomers();
    } catch (error: any) {
      toast({
        title: "Unable to reactivate",
        description: error?.message ?? "Unexpected error.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Customer Registry
          </h1>
          <p className="text-muted-foreground">
            Manage Silhouette connections and onboarding steps. Reference{" "}
            <a
              href="/docs/design/semantic_layer/workflows_and_ui"
              className="text-primary underline"
              target="_blank"
            >
              onboarding workflow
            </a>{" "}
            for detailed procedures.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshCustomers}>
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Customers</CardDescription>
            <CardTitle>{counts.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active</CardDescription>
            <CardTitle>{counts.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Healthy Connections</CardDescription>
            <CardTitle>{counts.healthy}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Needs Attention</CardDescription>
            <CardTitle>{counts.needsReview}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <AlertTitle>Unable to load customers</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Customers</CardTitle>
          <CardDescription>
            Connection metadata, discovery status, and actions. Review{" "}
            <a
              href="/docs/design/semantic_layer/semantic_layer_design"
              className="text-primary underline"
            >
              semantic layer design
            </a>{" "}
            for architecture context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No customers yet. Add your first customer to begin onboarding.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Customer</TableHead>
                  <TableHead>Silhouette</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Last Discovery</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className={!customer.isActive ? "opacity-60" : ""}
                  >
                    <TableCell>
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <span>{customer.code}</span>
                        {customer.silhouetteWebUrl ? (
                          <a
                            href={customer.silhouetteWebUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <LinkIcon className="h-3 w-3" />
                            Silhouette
                          </a>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        Version {customer.silhouetteVersion}
                        {customer.deploymentType
                          ? ` · ${customer.deploymentType}`
                          : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Updated {formatDate(customer.updatedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ConnectionStatusBadge
                          summary={
                            customer.connectionSummary ?? {
                              status: customer.connectionStatus,
                              masked: customer.connectionMasked,
                              lastVerifiedAt: customer.connectionLastVerifiedAt,
                              error: customer.connectionError ?? undefined,
                            }
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {customer.connectionLastVerifiedAt
                            ? `Verified ${formatDate(
                                customer.connectionLastVerifiedAt
                              )}`
                            : "Not verified yet"}
                        </span>
                      </div>
                      {customer.connectionError ? (
                        <div className="text-xs text-red-500 mt-1">
                          {customer.connectionError}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {customer.lastDiscoveredAt
                          ? formatDate(customer.lastDiscoveredAt)
                          : "Not run yet"}
                      </div>
                      {customer.stats?.formsDiscovered != null ? (
                        <div className="text-xs text-muted-foreground">
                          {customer.stats.formsDiscovered} forms ·{" "}
                          {customer.stats.fieldsDiscovered ?? 0} fields
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditCustomer(customer)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleTestConnection(customer)}
                          disabled={testingConnectionCode === customer.code}
                        >
                          <ArrowPathIcon className="h-4 w-4 mr-1" />
                          {testingConnectionCode === customer.code
                            ? "Testing..."
                            : "Test Connection"}
                        </Button>
                        {customer.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeactivate(customer)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReactivate(customer)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateCustomerDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateCustomer}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

function CustomersProtectedPage() {
  return (
    <ProtectedRoute requireAdmin>
      <CustomersPageContent />
    </ProtectedRoute>
  );
}

export default CustomersProtectedPage;
