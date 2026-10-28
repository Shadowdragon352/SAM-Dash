import { privateDemo } from './lib/privateDemo';
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
            {privateDemo && <aside className="border-b bg-amber-100 p-3 text-center text-sm text-slate-900">Private team demo · Fully synthetic scenarios · Not for clinical use</aside>}
            <Routes>
              <Route path="/scenario-replay" element={authUser ? <ScenarioReplay /> : <Navigate to="/login" replace />} />
              <Route
                path="/"
                element={
                  authUser ? (privateDemo ? <Navigate to="/scenario-replay" replace /> : <Index />) : <Navigate to="/login" replace />
                }
              />
              <Route
                path="/login"
                element={authUser ? <Navigate to="/" replace /> : <Login />}
              />
              <Route
                path="/signup"
                element={privateDemo ? <Navigate to="/login" replace /> : authUser ? <Navigate to="/" replace /> : <SignUp />}
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


