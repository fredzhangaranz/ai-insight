"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { DiscoveryTab } from "@/app/admin/discovery-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

function DiscoveryPageContent() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadCustomer = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const customerData = await apiRequest<{ customer: AdminCustomer }>(
          `/api/admin/customers/${code}`
        );
        setCustomer(customerData.customer);
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
        <DiscoveryTab
          customerCode={customer.code}
          customerName={customer.name}
        />
      ) : null}
    </div>
  );
}

function DiscoveryPage() {
  return (
    <ProtectedRoute requireAdmin>
      <DiscoveryPageContent />
    </ProtectedRoute>
  );
}

export default DiscoveryPage;
