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

/* ── Inner app (uses auth context) ──────────────────────── */
function AppInner() {
  const { isLoggedIn, loading, isAdmin } = useAuth();
  const [authView,  setAuthView]  = useState('login');    // 'login' | 'register'
  const [activePage, setActivePage] = useState('book');   // 'book' | 'bookings' | 'admin'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-void)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-mid)' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⬡</div>
          <div style={{ fontFamily: 'var(--font-h)', fontSize: 18, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Silicon Scheduler
          </div>
          <span className="spinner" />
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
            <div className="empty-state">
              <div className="empty-icon">🚫</div>
              <div className="empty-title">Access Denied</div>
              <div className="empty-sub">You don't have permission to view this page.</div>
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
