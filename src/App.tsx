import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import Login from "./pages/Login";
import Obras from "./pages/Obras";
import ObraDetail from "./pages/ObraDetail";
import AdminUsers from "./pages/AdminUsers";
import PendingApproval from "./pages/PendingApproval";
import NotFound from "./pages/NotFound";
import UpdatePassword from "./pages/UpdatePassword";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requireAdmin }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, loading } = useAuth();
  const { isApproved, isAdmin, loading: profileLoading } = useProfile();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pendente" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/obras" replace />;
  return <>{children}</>;
}

function ApprovedCheck({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isApproved, loading: profileLoading } = useProfile();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (isApproved) return <Navigate to="/obras" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (user) return <Navigate to="/obras" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/obras" replace />} />
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/update-password" element={<UpdatePassword />} />
      <Route path="/pendente" element={<ApprovedCheck><PendingApproval /></ApprovedCheck>} />
      <Route path="/obras" element={<ProtectedRoute><Obras /></ProtectedRoute>} />
      <Route path="/obra/:id" element={<ProtectedRoute><ObraDetail /></ProtectedRoute>} />
      <Route path="/admin/usuarios" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
