import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import Dashboard from "./pages/Dashboard";
import ProductionEntry from "./pages/ProductionEntry";
import StockUnits from "./pages/StockUnits";
import Cartonization from "./pages/Cartonization";
import DPL from "./pages/DPL";
import FinancePI from "./pages/FinancePI";
import DispatchBundle from "./pages/DispatchBundle";
import ShippingLabel from "./pages/ShippingLabel";
import GateScan from "./pages/GateScan";
import Traceability from "./pages/Traceability";
import Printers from "./pages/Printers";
import Templates from "./pages/Templates";
import PrintLogs from "./pages/PrintLogs";
import Reprints from "./pages/Reprints";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/production" element={<ProductionEntry />} />
            <Route path="/stock" element={<StockUnits />} />
            <Route path="/cartons" element={<Cartonization />} />
            <Route path="/dpl" element={<DPL />} />
            <Route path="/finance" element={<FinancePI />} />
            <Route path="/dispatch" element={<DispatchBundle />} />
            <Route path="/shipping" element={<ShippingLabel />} />
            <Route path="/gate" element={<GateScan />} />
            <Route path="/trace" element={<Traceability />} />
            <Route path="/printers" element={<Printers />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/print-logs" element={<PrintLogs />} />
            <Route path="/reprints" element={<Reprints />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
