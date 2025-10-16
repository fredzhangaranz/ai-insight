"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingDots } from "@/app/components/loading-dots";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";
import {
  Cog6ToothIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { Component, ReactNode } from "react";

// Error Boundary Component
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class AdminErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Admin dashboard error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 p-6">
          <div className="max-w-4xl mx-auto">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <ExclamationTriangleIcon className="w-5 h-5 mr-2" />
                  Something went wrong
                </CardTitle>
                <CardDescription>
                  The admin dashboard encountered an unexpected error.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Alert variant="destructive">
                    <AlertDescription>
                      {this.state.error?.message ||
                        "An unexpected error occurred"}
                    </AlertDescription>
                  </Alert>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => window.location.reload()}
                      variant="outline"
                    >
                      <ArrowPathIcon className="w-4 h-4 mr-2" />
                      Reload Page
                    </Button>
                    <Button
                      onClick={() => this.setState({ hasError: false })}
                      variant="default"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AdminDashboard() {
  const {
    providers,
    enabledProviders,
    defaultProvider,
    isLoading,
    error,
    validateProvider,
  } = useLLMConfig();

  const [validatingProvider, setValidatingProvider] = useState<string | null>(
    null
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleValidateProvider = async (
    providerType: string,
    providerName: string
  ) => {
    setValidatingProvider(`${providerType}-${providerName}`);
    setValidationError(null);
    try {
      const success = await validateProvider(providerType, providerName);
      if (!success) {
        setValidationError(
          "Validation failed. Please check your configuration."
        );
      }
    } catch (error) {
      console.error(
        `Error validating provider ${providerType}:${providerName}:`,
        error
      );
      setValidationError("Validation error occurred. Please try again.");
    } finally {
      setValidatingProvider(null);
    }
  };

  const handleRetryAllFailed = async () => {
    const failedProviders = enabledProviders.filter(
      (p) => p.status === "error"
    );

    // Retry all failed providers in parallel
    const retryPromises = failedProviders.map((provider) =>
      validateProvider(
        provider.config.providerType,
        provider.config.providerName
      )
    );

    try {
      await Promise.allSettled(retryPromises);
    } catch (error) {
      console.error("Error retrying failed validations:", error);
    }
  };

  const getValidationBadge = (provider: any) => {
    if (provider.status === "valid") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircleIcon className="w-3 h-3 mr-1" />
          Valid
        </Badge>
      );
    } else if (provider.status === "invalid") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <XCircleIcon className="w-3 h-3 mr-1" />
          Invalid
        </Badge>
      );
    } else if (provider.status === "error") {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Error
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
    }
  };

  const getProviderIcon = (providerType: string) => {
    switch (providerType) {
      case "anthropic":
        return "🤖";
      case "google":
        return "🌐";
      case "openwebui":
        return "🏠";
      default:
        return "⚙️";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">Loading admin dashboard...</p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">
                If this takes too long, there might be a connection issue.
              </p>
              <p className="text-red-600 text-xs mt-1">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AdminErrorBoundary>
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                  AI Provider Administration
                </h1>
                <p className="text-slate-600">
                  Manage and monitor your AI provider configurations
                </p>
              </div>
              <Link href="/admin/ai-config">
                <Button>
                  <Cog6ToothIcon className="w-4 h-4 mr-2" />
                  Configure Providers
                </Button>
              </Link>
            </div>
          </div>

          {/* Development Mode Banner */}
          {process.env.NODE_ENV !== "production" && (
            <Alert className="mb-6 border-yellow-200 bg-yellow-50">
              <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Development Mode:</strong> You are viewing
                configurations loaded from your <code>.env.local</code> file.
                Changes made here will not persist. To modify configurations,
                update your environment variables. Validation is available.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <XCircleIcon className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {validationError && (
            <Alert variant="destructive" className="mb-6">
              <XCircleIcon className="w-4 h-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Stats Cards */}
          <div className="grid gap-6 md:grid-cols-3 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Providers
                </CardTitle>
                <CpuChipIcon className="w-4 h-4 text-slate-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{providers.length}</div>
                <p className="text-xs text-slate-600">
                  {enabledProviders.length} enabled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Healthy Providers
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <CheckCircleIcon className="w-4 h-4 text-green-600" />
                  {enabledProviders.some((p) => p.status === "error") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRetryAllFailed}
                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                      title="Retry all failed validations"
                    >
                      <ArrowPathIcon className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {
                    enabledProviders.filter(
                      (provider) => provider.status === "valid"
                    ).length
                  }
                </div>
                <p className="text-xs text-slate-600">
                  of {enabledProviders.length} enabled
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Last updated:{" "}
                  {enabledProviders.length > 0
                    ? new Date(
                        Math.max(
                          ...enabledProviders.map((p) =>
                            p.lastChecked instanceof Date
                              ? p.lastChecked.getTime()
                              : p.lastChecked || 0
                          )
                        )
                      ).toLocaleTimeString()
                    : "Never"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Default Provider
                </CardTitle>
                <Badge
                  variant="secondary"
                  className="bg-blue-100 text-blue-800"
                >
                  {defaultProvider
                    ? getProviderIcon(defaultProvider.config.providerType)
                    : "?"}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {defaultProvider
                    ? defaultProvider.config.providerName
                    : "None"}
                </div>
                <p className="text-xs text-slate-600">
                  {defaultProvider ? "Active" : "Not set"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Provider Status */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Provider Status</CardTitle>
              <CardDescription>
                Current status and health of all configured AI providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {providers.length === 0 ? (
                <div className="text-center py-8">
                  <CpuChipIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">
                    No Providers Configured
                  </h3>
                  <p className="text-slate-600 mb-4">
                    Get started by configuring your first AI provider.
                  </p>
                  <Link href="/admin/ai-config">
                    <Button>
                      Configure Providers
                      <ArrowRightIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {providers.map((provider) => {
                    const isValidating =
                      validatingProvider ===
                      `${provider.config.providerType}-${provider.config.providerName}`;

                    return (
                      <div
                        key={`${provider.config.providerType}-${provider.config.providerName}`}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl">
                            {getProviderIcon(provider.config.providerType)}
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-900">
                              {provider.config.providerName}
                            </h3>
                            <p className="text-sm text-slate-600">
                              {provider.config.providerType
                                .charAt(0)
                                .toUpperCase() +
                                provider.config.providerType.slice(1)}
                            </p>
                            {/* Enhanced validation status with transition */}
                            <div className="mt-1 text-xs">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full transition-all duration-300 ${
                                  provider.status === "valid"
                                    ? "bg-green-100 text-green-800 shadow-sm"
                                    : provider.status === "invalid"
                                    ? "bg-red-100 text-red-800 shadow-sm"
                                    : provider.status === "error"
                                    ? "bg-red-100 text-red-800 shadow-sm"
                                    : "bg-yellow-100 text-yellow-800 shadow-sm"
                                }`}
                              >
                                {provider.status === "valid" && (
                                  <>
                                    <CheckCircleIcon className="w-3 h-3 mr-1" />
                                    Healthy
                                  </>
                                )}
                                {provider.status === "invalid" && (
                                  <>
                                    <XCircleIcon className="w-3 h-3 mr-1" />
                                    Unhealthy
                                  </>
                                )}
                                {provider.status === "error" && (
                                  <>
                                    <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                    Error
                                  </>
                                )}
                                {provider.status === "pending" &&
                                  provider.isValidating && (
                                    <>
                                      <ArrowPathIcon className="w-3 h-3 mr-1 animate-spin" />
                                      Testing...
                                    </>
                                  )}
                                {provider.status === "pending" &&
                                  !provider.isValidating && (
                                    <>
                                      <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                      Pending
                                    </>
                                  )}
                              </span>
                              {provider.lastChecked && (
                                <span className="ml-2 text-slate-500">
                                  {new Date(
                                    provider.lastChecked
                                  ).toLocaleTimeString()}
                                </span>
                              )}
                              {provider.errorMessage &&
                                provider.status === "error" && (
                                  <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-red-700">
                                        {provider.errorMessage}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-2 h-6 text-xs"
                                        onClick={() =>
                                          handleValidateProvider(
                                            provider.config.providerType,
                                            provider.config.providerName
                                          )
                                        }
                                        disabled={isValidating}
                                      >
                                        <ArrowPathIcon className="w-3 h-3 mr-1" />
                                        Retry
                                      </Button>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            {provider.config.isDefault && (
                              <Badge
                                variant="secondary"
                                className="bg-blue-100 text-blue-800"
                              >
                                Default
                              </Badge>
                            )}
                            {!provider.config.isEnabled && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-800"
                              >
                                Disabled
                              </Badge>
                            )}
                            {getValidationBadge(provider)}
                          </div>

                          <div className="flex items-center space-x-2">
                            {provider.config.isEnabled && (
                              <div className="flex flex-col items-end space-y-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    handleValidateProvider(
                                      provider.config.providerType,
                                      provider.config.providerName
                                    );
                                  }}
                                  disabled={isValidating}
                                >
                                  {isValidating ? <LoadingDots /> : "Test"}
                                </Button>
                                {/* Enhanced validation feedback */}
                                {isValidating && (
                                  <div className="flex items-center space-x-2 mt-2 p-2 bg-blue-50 rounded-md border border-blue-200">
                                    <ArrowPathIcon className="w-4 h-4 text-blue-600 animate-spin" />
                                    <span className="text-xs font-medium text-blue-700">
                                      Testing {provider.config.providerName}...
                                    </span>
                                  </div>
                                )}
                                {validationError &&
                                  validatingProvider ===
                                    `${provider.config.providerType}-${provider.config.providerName}` && (
                                    <div className="mt-2 p-2 bg-red-50 rounded-md border border-red-200">
                                      <span className="text-xs font-medium text-red-700">
                                        {validationError}
                                      </span>
                                    </div>
                                  )}
                              </div>
                            )}

                            <Link href="/admin/ai-config">
                              <Button variant="outline" size="sm">
                                Edit
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common administrative tasks and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Link href="/admin/ai-config">
                  <Button variant="outline" className="w-full justify-start">
                    <Cog6ToothIcon className="w-4 h-4 mr-2" />
                    Manage Providers
                  </Button>
                </Link>

                <Link href="/">
                  <Button variant="outline" className="w-full justify-start">
                    <ArrowRightIcon className="w-4 h-4 mr-2" />
                    Back to Application
                  </Button>
                </Link>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => window.location.reload()}
                >
                  <CpuChipIcon className="w-4 h-4 mr-2" />
                  Refresh Status
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminErrorBoundary>
  );
}
