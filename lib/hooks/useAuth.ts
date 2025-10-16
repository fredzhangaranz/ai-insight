import { useSession } from "next-auth/react";

export function useAuth() {
  const { data: session, status } = useSession();
  const user = session?.user;

  return {
    session,
    user,
    status,
    isAuthenticated: status === "authenticated" && !!user,
    isAdmin: user?.role === "admin",
    isLoading: status === "loading",
  };
}
