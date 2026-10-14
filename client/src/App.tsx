import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import ScenarioReplay from "./pages/ScenarioReplay";
import { Loader } from "lucide-react";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import { ThemeProvider } from "./components/ThemeProvider";
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";

const queryClient = new QueryClient();

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);
  if (isCheckingAuth)
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader className="size-10 animate-spin" />
      </div>
    );
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/scenario-replay" element={authUser ? <ScenarioReplay /> : <Navigate to="/login" replace />} />
              <Route
                path="/"
                element={
                  authUser ? <Index /> : <Navigate to="/login" replace />
                }
              />
              <Route
                path="/login"
                element={authUser ? <Navigate to="/" replace /> : <Login />}
              />
              <Route
                path="/signup"
                element={authUser ? <Navigate to="/" replace /> : <SignUp />}
              />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;

