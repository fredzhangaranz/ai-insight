import { NextRequest, NextResponse } from "next/server";

// Standardized error types for consistent error handling
export enum ErrorType {
  BAD_REQUEST = "bad_request",
  UNAUTHORIZED = "unauthorized",
  FORBIDDEN = "forbidden",
  NOT_FOUND = "not_found",
  VALIDATION_ERROR = "validation_error",
  DATABASE_ERROR = "database_error",
  AI_SERVICE_ERROR = "ai_service_error",
  EXTERNAL_API_ERROR = "external_api_error",
  INTERNAL_SERVER_ERROR = "internal_server_error",
  NETWORK_ERROR = "network_error",
  TIMEOUT_ERROR = "timeout_error",
}

interface ApiErrorPayload {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp?: string;
  requestId?: string;
}

/**
 * Creates a standardized API error response, logs it, and returns a NextResponse.
 * This ensures all errors are handled consistently across the application.
 *
 * @param error A short, machine-readable error string (e.g., "bad_request").
 * @param message A human-readable message explaining the error.
 * @param statusCode The HTTP status code for the response.
 * @param details Optional additional details about the error, such as the original error object.
 * @param requestId Optional request ID for tracking.
 * @returns A NextResponse object with the standardized error payload.
 */
export function apiError(
  error: string,
  message: string,
  statusCode: number,
  details?: any,
  requestId?: string
): NextResponse {
  const errorResponse: ApiErrorPayload = {
    error,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
    ...(requestId && { requestId }),
    ...(details && {
      details: details instanceof Error ? details.message : details,
    }),
  };

  // Centralized logging for all API errors
  console.error(
    `API Error (${statusCode}) - ${error}: ${message}`,
    requestId ? `[Request ID: ${requestId}]` : "",
    details ? `\nDetails: ${JSON.stringify(details, null, 2)}` : ""
  );

  return NextResponse.json(errorResponse, { status: statusCode });
}

/**
 * Wrapper function for API route handlers that provides comprehensive error handling.
 * This ensures all API routes have consistent error handling without duplicating code.
 *
 * @param handler The API route handler function
 * @returns A wrapped handler with error handling
 */
export function withErrorHandling<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse<T>>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const requestId =
      req.headers.get("x-request-id") ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Add request ID to headers for tracking
      req.headers.set("x-request-id", requestId);

      const response = await handler(req, context);
      return response;
    } catch (error: any) {
      // Handle different types of errors
      if (error.name === "ValidationError") {
        return apiError(
          ErrorType.VALIDATION_ERROR,
          "Invalid request data",
          400,
          error,
          requestId
        );
      }

      if (error.name === "DatabaseError" || error.code === "ECONNREFUSED") {
        return apiError(
          ErrorType.DATABASE_ERROR,
          "Database connection error. Please try again later.",
          503,
          error,
          requestId
        );
      }

      if (error.name === "TimeoutError" || error.code === "ETIMEDOUT") {
        return apiError(
          ErrorType.TIMEOUT_ERROR,
          "Request timed out. Please try again.",
          408,
          error,
          requestId
        );
      }

      if (error.name === "NetworkError" || error.code === "ENOTFOUND") {
        return apiError(
          ErrorType.NETWORK_ERROR,
          "Network connection error. Please check your connection and try again.",
          503,
          error,
          requestId
        );
      }

      // Default internal server error
      return apiError(
        ErrorType.INTERNAL_SERVER_ERROR,
        "An unexpected error occurred. Please try again later.",
        500,
        error,
        requestId
      );
    }
  };
}

/**
 * Helper function to create common error responses
 */
export const createErrorResponse = {
  badRequest: (message: string, details?: any, requestId?: string) =>
    apiError(ErrorType.BAD_REQUEST, message, 400, details, requestId),

  unauthorized: (
    message: string = "Unauthorized",
    details?: any,
    requestId?: string
  ) => apiError(ErrorType.UNAUTHORIZED, message, 401, details, requestId),

  forbidden: (
    message: string = "Forbidden",
    details?: any,
    requestId?: string
  ) => apiError(ErrorType.FORBIDDEN, message, 403, details, requestId),

  notFound: (
    message: string = "Resource not found",
    details?: any,
    requestId?: string
  ) => apiError(ErrorType.NOT_FOUND, message, 404, details, requestId),

  validationError: (message: string, details?: any, requestId?: string) =>
    apiError(ErrorType.VALIDATION_ERROR, message, 400, details, requestId),

  databaseError: (
    message: string = "Database error",
    details?: any,
    requestId?: string
  ) => apiError(ErrorType.DATABASE_ERROR, message, 503, details, requestId),

  aiServiceError: (
    message: string = "AI service error",
    details?: any,
    requestId?: string
  ) => apiError(ErrorType.AI_SERVICE_ERROR, message, 503, details, requestId),

  internalError: (
    message: string = "Internal server error",
    details?: any,
    requestId?: string
  ) =>
    apiError(ErrorType.INTERNAL_SERVER_ERROR, message, 500, details, requestId),
};
