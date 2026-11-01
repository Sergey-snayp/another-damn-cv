import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './Login';
import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Documents } from './pages/Documents';
import { JobDetail } from './pages/JobDetail';
import { Profile } from './pages/Profile';
import { Resumes } from './pages/Resumes';
import { ResumeEditor } from './pages/ResumeEditor';
import { ResumeHistory } from './pages/ResumeHistory';
import { TailorReview } from './pages/TailorReview';

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/**
 * Everything behind the login wall.
 *
 * The router only mounts once we know who you are, so no page ever renders in a
 * half-authenticated state and then has to unwind.
 */
function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <main className="centred"><p className="muted">Loading…</p></main>;
  }

  if (!user) {
    return <main className="centred"><Login /></main>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="resumes" element={<Resumes />} />
          <Route path="resumes/:id" element={<ResumeEditor />} />
          <Route path="resumes/:id/history" element={<ResumeHistory />} />
          <Route path="resumes/:id/tailor" element={<TailorReview />} />
          <Route path="documents" element={<Documents />} />
          <Route path="jobs" element={<Navigate to="/" replace />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="tracker" element={<Navigate to="/" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
