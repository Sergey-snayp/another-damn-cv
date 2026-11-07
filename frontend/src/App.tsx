import { BrowserRouter, Navigate, Routes, Route, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Login } from './Login';
import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Home } from './pages/Home';
import { Documents } from './pages/Documents';
import { JobDetail } from './pages/JobDetail';
import { Profile } from './pages/Profile';
import { ResumeEditor } from './pages/ResumeEditor';
import { ResumeHistory } from './pages/ResumeHistory';
import { TailorReview } from './pages/TailorReview';
import { QuickTailor, QuickTailorStart } from './pages/QuickTailor';
import { CoverLetters } from './pages/CoverLetters';
import { CoverLetterEditor } from './pages/CoverLetterEditor';
import { InterviewPrep } from './pages/InterviewPrep';
import { InterviewWorkspace } from './pages/InterviewWorkspace';
import { InterviewReference } from './pages/InterviewReference';
import { PrintResume } from './pages/PrintResume';

export function App() {
  // The server's Chrome prints CVs from here with a signed link: no sign-in, no app chrome.
  if (window.location.pathname.startsWith('/print/resumes/')) return <PrintResume />;
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
        {/* The extension's Quick Tailor opens these in a popup window over the job page: no app bar. */}
        <Route path="popup/jobs/:id/quick-tailor" element={<div className="popup-frame"><QuickTailorStart popup /></div>} />
        <Route path="popup/documents/:id/quick" element={<div className="popup-frame"><QuickTailor popup /></div>} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="resumes" element={<Navigate to="/documents" replace />} />
          <Route path="resumes/:id/*" element={<LegacyResumeRedirect />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/cover-letters" element={<CoverLetters />} />
          <Route path="documents/cover-letters/:jobId" element={<CoverLetterEditor />} />
          <Route path="interview-prep" element={<InterviewPrep />} />
          <Route path="interview-prep/:id" element={<InterviewWorkspace />} />
          <Route path="interview-prep/:id/job" element={<InterviewReference kind="job" />} />
          <Route path="interview-prep/:id/cv" element={<InterviewReference kind="cv" />} />
          <Route path="documents/:id" element={<ResumeEditor />} />
          <Route path="documents/:id/history" element={<ResumeHistory />} />
          <Route path="documents/:id/tailor" element={<TailorReview />} />
          <Route path="documents/:id/quick" element={<QuickTailor />} />
          <Route path="jobs" element={<Navigate to="/dashboard" replace />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="jobs/:id/quick-tailor" element={<QuickTailorStart />} />
          <Route path="tracker" element={<Navigate to="/dashboard" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function LegacyResumeRedirect() {
  const { id = '', '*': section = '' } = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={`/documents/${encodeURIComponent(id)}${section ? `/${section}` : ''}${search}${hash}`} replace />;
}
