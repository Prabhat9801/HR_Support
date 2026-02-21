/**
 * Botivate HR Support – App Entry
 * Routes · Auth · Toast
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import OnboardingPage from './pages/OnboardingPage';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/chat" replace /> : <LoginPage />} />
      <Route path="/register" element={<OnboardingPage isPublic />} />
      <Route path="/onboarding" element={<Guard><OnboardingPage /></Guard>} />
      <Route path="/chat" element={<Guard><ChatPage /></Guard>} />
      <Route path="*" element={<Navigate to={user ? '/chat' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              boxShadow: 'var(--shadow-md)',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
