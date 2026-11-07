import { NavLink } from 'react-router-dom';

/** Documents holds two kinds: CVs and cover letters, one page each. */
export function DocumentKindSwitch() {
  return (
    <nav className="documents-kind" aria-label="Document type">
      <NavLink to="/documents" end className={({ isActive }) => `documents-kind-option${isActive ? ' is-active' : ''}`}>
        Resumes
      </NavLink>
      <NavLink to="/documents/cover-letters" className={({ isActive }) => `documents-kind-option${isActive ? ' is-active' : ''}`}>
        Cover Letters
      </NavLink>
    </nav>
  );
}
