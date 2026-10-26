import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layouts/AppShell";
import Dashboard from "./pages/Dashboard";
import Scanner from "./pages/Scanner";
import StockDetails from "./pages/StockDetails";
import Watchlist from "./pages/Watchlist";
import Trades from "./pages/Trades";
import Backtest from "./pages/Backtest";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="/stock/:symbol" element={<StockDetails />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/trades" element={<Trades />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
