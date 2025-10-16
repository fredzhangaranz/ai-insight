import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import { useSession } from "next-auth/react";
import { ProtectedRoute } from "../ProtectedRoute";

const useSessionMock = useSession as unknown as vi.Mock;

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading fallback while session loads", () => {
    useSessionMock.mockReturnValue({ status: "loading", data: null });

    render(
      <ProtectedRoute>
        <div>Secure</div>
      </ProtectedRoute>
    );

    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("shows children when authenticated", () => {
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: { user: { role: "admin" } },
    });

    render(
      <ProtectedRoute>
        <div>Secure</div>
      </ProtectedRoute>
    );

    expect(screen.getByText("Secure")).toBeInTheDocument();
  });

  it("redirects non-admins when admin required", async () => {
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: { user: { role: "standard_user" } },
    });

    render(
      <ProtectedRoute requireAdmin>
        <div>Secure</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/unauthorized");
    });
  });
});
