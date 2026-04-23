// src/App.jsx
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MyBookingsPage from './pages/MyBookingsPage';
import AdminDashboard from './pages/AdminDashboard';
import BookingWizard from './pages/BookingWizard';
import { Loader2, Cpu } from 'lucide-react';

/* ── Inner app (uses auth context) ──────────────────────── */
function AppInner() {
  const { isLoggedIn, loading, isAdmin } = useAuth();
  const [authView,  setAuthView]  = useState('login');    // 'login' | 'register'
  const [activePage, setActivePage] = useState('book');   // 'book' | 'bookings' | 'admin'

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-void">
        <div className="text-center text-text-mid">
          <Cpu className="w-9 h-9 text-amber mx-auto mb-4" />
          <div className="font-[family-name:--font-heading] text-lg tracking-tight mb-3">
            Silicon Scheduler
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-amber mx-auto" />
        </div>
      </div>
    );
  }

  // Not logged in — show auth pages
  if (!isLoggedIn) {
    if (authView === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthView('register')} />;
  }

  // Admin: default page is admin dashboard
  const effectivePage = isAdmin && activePage === 'bookings' ? 'admin' : activePage;

  function handleNavigate(page) {
    // Protect admin route
    if (page === 'admin' && !isAdmin) return;
    setActivePage(page);
  }

  function renderPage() {
    switch (effectivePage) {
      case 'book':
        return (
          <BookingWizard
            onBookingComplete={() => setActivePage('bookings')}
          />
        );
      case 'bookings':
        return (
          <MyBookingsPage
            onNavigateToBook={() => setActivePage('book')}
          />
        );
      case 'admin':
        if (!isAdmin) {
          return (
            <div className="text-center py-16 text-text-low">
              <div className="text-4xl mb-3 opacity-40">🚫</div>
              <div className="font-[family-name:--font-heading] text-base text-text-mid mb-1.5">Access Denied</div>
              <div className="text-[12px]">You don't have permission to view this page.</div>
            </div>
          );
        }
        return <AdminDashboard />;
      default:
        return <BookingWizard onBookingComplete={() => setActivePage('bookings')} />;
    }
  }

  return (
    <Layout activePage={effectivePage} onNavigate={handleNavigate}>
      {renderPage()}
    </Layout>
  );
}

/* ── Root with providers ─────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </AuthProvider>
  );
}
