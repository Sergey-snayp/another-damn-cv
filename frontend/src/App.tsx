import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './Login';
import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Documents } from './pages/Documents';
import { Jobs } from './pages/Jobs';
import { Tracker } from './pages/Tracker';
import { Profile } from './pages/Profile';

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
          <Route path="documents" element={<Documents />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="tracker" element={<Tracker />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
