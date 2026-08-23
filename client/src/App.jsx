import React from "react";
import { Routes, Route, Navigate, useLocation, Link, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { ToastProvider, Icon } from "./components/ui";
import AnnouncementPopup from "./components/AnnouncementPopup";
import { money } from "./api";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from "./pages/Dashboard";
import Invest from "./pages/Invest";
import MyPackages from "./pages/MyPackages";
import Deposit from "./pages/Deposit";
import DepositTransfer from "./pages/DepositTransfer";
import Withdraw from "./pages/Withdraw";
import Referrals from "./pages/Referrals";
import Coupons from "./pages/Coupons";
import History from "./pages/History";
import Profile from "./pages/Profile";
import More from "./pages/More";
import PaymentCallback from "./pages/PaymentCallback";

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app">
      <div className="shell">
        <header className="topbar">
          <div className="logo">Furgle<span>.</span></div>
          <div className="spacer" />
          <Link to="/withdraw" className="balance-chip">
            <Icon.Wallet />
            {money(user?.wallet_balance)}
          </Link>
          <button className="avatar" onClick={() => navigate("/profile")} style={{ border: 0, cursor: "pointer" }}>
            {(user?.name || "U")[0].toUpperCase()}
          </button>
        </header>

        <main className="page">{children}</main>
      </div>

      <AnnouncementPopup />

      <nav className="bnav">
        <div className="bar">
          <Link to="/dashboard" className={`item ${location.pathname.startsWith("/dashboard") ? "active" : ""}`}>
            <Icon.Home />
            <span>Home</span>
          </Link>
          <Link to="/invest" className={`item ${location.pathname.startsWith("/invest") ? "active" : ""}`}>
            <Icon.Invest />
            <span>Invest</span>
          </Link>
          <Link to="/deposit" className="item fab">
            <div className="fab-btn"><Icon.Plus /></div>
          </Link>
          <Link to="/my-packages" className={`item ${location.pathname.startsWith("/my-packages") ? "active" : ""}`}>
            <Icon.Package />
            <span>Products</span>
          </Link>
          <Link to="/profile" className={`item ${location.pathname.startsWith("/profile") || location.pathname.startsWith("/more") ? "active" : ""}`}>
            <Icon.Profile />
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />

        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/invest" element={<Protected><Invest /></Protected>} />
        <Route path="/my-packages" element={<Protected><MyPackages /></Protected>} />
        <Route path="/deposit" element={<Protected><Deposit /></Protected>} />
        <Route path="/deposit/transfer/:reference" element={<Protected><DepositTransfer /></Protected>} />
        <Route path="/withdraw" element={<Protected><Withdraw /></Protected>} />
        <Route path="/referrals" element={<Protected><Referrals /></Protected>} />
        <Route path="/coupons" element={<Protected><Coupons /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/more" element={<Protected><More /></Protected>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ToastProvider>
  );
}
