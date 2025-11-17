import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "./pages/Login";
import CreateMEP from "./pages/CreateMEP";
import CreateVR from "./pages/CreateVR";
import { Tickets } from "./pages/Tickets";
import AssignedTickets from "./pages/AssignedTickets";
import Analytics from "./pages/Analytics";
import TicketMEP from "./pages/TicketMEP";
import TicketVR from "./pages/TicketVR";
import NotFound from "./pages/NotFound";
import HOD from "./pages/HOD"; // <--- NEW

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/tickets" replace />} />
            <Route
              path="/create-mep"
              element={
                <ProtectedRoute>
                  <CreateMEP />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-vr"
              element={
                <ProtectedRoute>
                  <CreateVR />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tickets"
              element={
                <ProtectedRoute>
                  <Tickets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assigned-tickets"
              element={
                <ProtectedRoute>
                  <AssignedTickets />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/hod"
              element={
                <ProtectedRoute>
                  <HOD />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticket-mep/:ticketNumber"
              element={
                <ProtectedRoute>
                  <TicketMEP />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticket-vr/:ticketNumber"
              element={
                <ProtectedRoute>
                  <TicketVR />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
