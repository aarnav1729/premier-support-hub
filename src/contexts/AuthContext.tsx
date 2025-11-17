import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const API_BASE_URL = window.location.origin;

type AuthContextValue = {
  userEmail: string | null;
  initializing: boolean;
  requestOtp: (email: string) => Promise<{ otp: string | null }>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        setUserEmail(null);
        return;
      }
      const data = await res.json();
      if (data && data.email) {
        setUserEmail(data.email as string);
      } else {
        setUserEmail(null);
      }
    } catch {
      setUserEmail(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchMe();
      setInitializing(false);
    })();
  }, [fetchMe]);

  const requestOtp = useCallback(async (email: string) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to request OTP");
    }

    const data = await res.json();
    // For MVP the server returns `otp` in the response.
    // In production you would ignore this and send it via email.
    return { otp: (data?.otp as string) || null };
  }, []);

  const verifyOtp = useCallback(
    async (email: string, otp: string) => {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to verify OTP");
      }

      const data = await res.json();
      if (data && data.email) {
        setUserEmail(data.email as string);
      } else {
        // fallback: re-fetch from /me
        await fetchMe();
      }
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setUserEmail(null);
  }, []);

  const value: AuthContextValue = {
    userEmail,
    initializing,
    requestOtp,
    verifyOtp,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
