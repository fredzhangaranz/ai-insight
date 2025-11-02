// Frontend error handling utilities for consistent error management

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp?: string;
  requestId?: string;
}

/**
 * Handles API errors and provides user-friendly error messages
 */
export class ErrorHandler {
  /**
   * Processes API error responses and returns user-friendly messages
   */
  static processApiError(error: any): string {
    // If it's already a processed API error
    if (error.error && error.message) {
      return error.message;
    }

    // If it's a fetch error (network issues)
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return "Network connection error. Please check your internet connection and try again.";
    }

    // If it's a timeout error
    if (error.name === "AbortError" || error.message?.includes("timeout")) {
      return "Request timed out. Please try again.";
    }

    // If it's a validation error
    if (error.statusCode === 400) {
      return (
        error.message ||
        "Invalid request. Please check your input and try again."
      );
    }

    // If it's an authentication error
    if (error.statusCode === 401) {
      return "Authentication required. Please log in and try again.";
    }

    // If it's a permission error
    if (error.statusCode === 403) {
      return "You don't have permission to perform this action.";
    }

    // If it's a not found error
    if (error.statusCode === 404) {
      return "The requested resource was not found.";
    }

    // If it's a server error
    if (error.statusCode >= 500) {
      return "Server error. Please try again later or contact support if the problem persists.";
    }

    // Default error message
    return error.message || "An unexpected error occurred. Please try again.";
  }

  /**
   * Shows error notification to user
   */
  static showError(message: string, title: string = "Error") {
    // You can integrate with your preferred notification system
    // For now, we'll use alert as a fallback
    alert(`${title}: ${message}`);
  }

  /**
   * Shows success notification to user
   */
  static showSuccess(message: string, title: string = "Success") {
    // You can integrate with your preferred notification system
    // For now, we'll use alert as a fallback
    alert(`${title}: ${message}`);
  }

  /**
   * Wraps API calls with error handling
   */
  static async withErrorHandling<T>(
    apiCall: () => Promise<T>,
    errorTitle: string = "Operation Failed"
  ): Promise<T | null> {
    try {
      return await apiCall();
    } catch (error: any) {
      const userMessage = this.processApiError(error);
      this.showError(userMessage, errorTitle);
      return null;
    }
  }

  /**
   * Creates a standardized error object for API calls
   */
  static createError(
    message: string,
    statusCode: number = 500,
    details?: any
  ): ApiError {
    return {
      error: "api_error",
      message,
      statusCode,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Hook for handling API errors in React components
 */
export function useErrorHandler() {
  const handleError = (error: any, context: string = "Operation") => {
    const message = ErrorHandler.processApiError(error);
    ErrorHandler.showError(message, `${context} Failed`);
    console.error(`${context} error:`, error);
  };

  const handleSuccess = (message: string, context: string = "Operation") => {
    ErrorHandler.showSuccess(message, `${context} Successful`);
  };

  return {
    handleError,
    handleSuccess,
    withErrorHandling: ErrorHandler.withErrorHandling,
  };
}

// Export withErrorHandling as a higher-order function for Next.js API routes
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error: any) {
      console.error("API route error:", error);
      // Return error response
      const apiError = ErrorHandler.createError(
        error.message || "Internal server error",
        error.statusCode || 500,
        error.details
      );
      return new Response(JSON.stringify(apiError), {
        status: apiError.statusCode,
        headers: { "Content-Type": "application/json" },
      }) as any;
    }
  };
}
