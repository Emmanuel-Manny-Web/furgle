import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { Protected } from "@/components/Protected";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Invest from "@/pages/Invest";
import Deposit from "@/pages/Deposit";
import DepositTransfer from "@/pages/DepositTransfer";
import Withdraw from "@/pages/Withdraw";
import Referrals from "@/pages/Referrals";
import Coupons from "@/pages/Coupons";
import History from "@/pages/History";
import Profile from "@/pages/Profile";
import More from "@/pages/More";
import PaymentCallback from "@/pages/PaymentCallback";
import ForgotPassword from "@/pages/ForgotPassword";
import AdminLogin from "@/pages/AdminLogin";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminDeposits from "@/pages/admin/AdminDeposits";
import AdminWithdrawals from "@/pages/admin/AdminWithdrawals";
import AdminInvestments from "@/pages/admin/AdminInvestments";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminPasswordResets from "@/pages/admin/AdminPasswordResets";
import AdminAnnouncements from "@/pages/admin/AdminAnnouncements";
import AdminManualAdjustments from "@/pages/admin/AdminManualAdjustments";
import AdminFraudMonitor from "@/pages/admin/AdminFraudMonitor";
import AdminFinancialReport from "@/pages/admin/AdminFinancialReport";
import AdminActivityLog from "@/pages/admin/AdminActivityLog";
import AdminProfitBreakdown from "@/pages/admin/AdminProfitBreakdown";
import AdminPayoutProjection from "@/pages/admin/AdminPayoutProjection";
import AdminUserDetail from "@/pages/admin/AdminUserDetail";
import AdminGatewayPayoutFailures from "@/pages/admin/AdminGatewayPayoutFailures";
import MyPackages from "@/pages/MyPackages";
import { ThemeProvider } from "@/context/ThemeContext";
import { BrandingProvider } from "@/context/BrandingContext";
import { SettingsProvider } from "@/context/SettingsContext";

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <BrandingProvider>
            <SettingsProvider>
            <Toaster richColors position="top-right" />
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/payment/callback" element={<PaymentCallback />} />
              <Route path="/pentest/fuser/login" element={<AdminLogin />} />

              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/invest" element={<Protected><Invest /></Protected>} />
              <Route path="/my-packages" element={<Protected><MyPackages /></Protected>} />
              <Route path="/team" element={<Protected><Referrals /></Protected>} />
              <Route path="/deposit" element={<Protected><Deposit /></Protected>} />
              <Route path="/deposit/transfer/:reference" element={<Protected><DepositTransfer /></Protected>} />
              <Route path="/withdraw" element={<Protected><Withdraw /></Protected>} />
              <Route path="/referrals" element={<Protected><Referrals /></Protected>} />
              <Route path="/coupons" element={<Protected><Coupons /></Protected>} />
              <Route path="/history" element={<Protected><History /></Protected>} />
              <Route path="/profile" element={<Protected><Profile /></Protected>} />
              <Route path="/more" element={<Protected><More /></Protected>} />

              <Route path="/pentest/fuser" element={<Protected admin><AdminDashboard /></Protected>} />
              <Route path="/pentest/fuser/users" element={<Protected admin><AdminUsers /></Protected>} />
              <Route path="/pentest/fuser/users/:id" element={<Protected admin><AdminUserDetail /></Protected>} />
              <Route path="/pentest/fuser/products" element={<Protected admin><AdminProducts /></Protected>} />
              <Route path="/pentest/fuser/deposits" element={<Protected admin><AdminDeposits /></Protected>} />
              <Route path="/pentest/fuser/withdrawals" element={<Protected admin><AdminWithdrawals /></Protected>} />
              <Route path="/pentest/fuser/investments" element={<Protected admin><AdminInvestments /></Protected>} />
              <Route path="/pentest/fuser/referrals" element={<Protected admin><AdminReferrals /></Protected>} />
              <Route path="/pentest/fuser/coupons" element={<Protected admin><AdminCoupons /></Protected>} />
              <Route path="/pentest/fuser/announcements" element={<Protected admin><AdminAnnouncements /></Protected>} />
              <Route path="/pentest/fuser/manual-adjustments" element={<Protected admin><AdminManualAdjustments /></Protected>} />
              <Route path="/pentest/fuser/fraud-monitor" element={<Protected admin><AdminFraudMonitor /></Protected>} />
              <Route path="/pentest/fuser/activity-log" element={<Protected admin><AdminActivityLog /></Protected>} />
              <Route path="/pentest/fuser/profit-breakdown" element={<Protected admin><AdminProfitBreakdown /></Protected>} />
              <Route path="/pentest/fuser/payout-projection" element={<Protected admin><AdminPayoutProjection /></Protected>} />
              <Route path="/pentest/fuser/financial-report" element={<Protected admin><AdminFinancialReport /></Protected>} />
              <Route path="/pentest/fuser/password-resets" element={<Protected admin><AdminPasswordResets /></Protected>} />
              <Route path="/pentest/fuser/gateway-payout-failures" element={<Protected admin><AdminGatewayPayoutFailures /></Protected>} />
              <Route path="/pentest/fuser/settings" element={<Protected admin><AdminSettings /></Protected>} />

              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            </SettingsProvider>
            </BrandingProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
