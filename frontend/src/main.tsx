import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { closeEmbed, embedded, startEmbed, toParent } from './embed';
import './theme/colors.css';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

if (!embedded) root.render(app);
else {
  // In a job page, CV Autofill signs this frame in first; until then nothing calls the API.
  root.render(<div className="studio-message"><p className="muted">Opening Quick tailoring…</p></div>);
  startEmbed().then(
    () => {
      root.render(app);
      toParent({ type: 'cv-embed-open' });
    },
    (error: Error) => {
      root.render(
        <div className="studio-message">
          <h1>Quick tailoring</h1>
          <p className="error">{error.message}</p>
          <button className="ghost" onClick={closeEmbed}>Close</button>
        </div>,
      );
      toParent({ type: 'cv-embed-open' });
    },
  );
}
