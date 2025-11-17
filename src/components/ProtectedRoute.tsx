import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: React.ReactElement;
};

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { userEmail, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!userEmail) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
