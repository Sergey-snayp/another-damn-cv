import { useEffect, useRef, useState } from 'react';
import { assistantApi, type AiSettings } from './assistantApi';

const TONES: Array<{ value: AiSettings['tone']; label: string; hint: string }> = [
  { value: 'balanced', label: 'Balanced', hint: 'Plain, professional and specific.' },
  { value: 'confident', label: 'Confident', hint: 'Active verbs, outcome first.' },
  { value: 'concise', label: 'Concise', hint: 'As short as the facts allow.' },
];

/** How the editor's AI writes for this CV: the chat and the ✦ rewrite follow it. Saved on the server. */
export function AiSettingsForm({ resumeId }: { resumeId: string }) {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [status, setStatus] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void assistantApi.settings(resumeId).then(setSettings, () => setStatus('Could not load the settings.'));
    return () => clearTimeout(timer.current);
  }, [resumeId]);

  function change(next: AiSettings) {
    setSettings(next);
    setStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      assistantApi.saveSettings(resumeId, next).then(() => setStatus('Saved'), () => setStatus('Not saved. Try again.'));
    }, 700);
  }

  if (!settings) return <p className="sf-count" style={{ padding: 16 }}>{status || 'Loading…'}</p>;
  return (
    <div className="studio-form">
      <h2>AI Settings</h2>
      <p className="sf-count" style={{ margin: '0 0 14px' }}>
        The chat and the ✦ rewrite follow these for this CV. They never add facts that are not on your CV.
      </p>
      <p className="sf-label">Tone</p>
      <div className="ai-tones">
        {TONES.map((tone) => (
          <label key={tone.value} className={settings.tone === tone.value ? 'on' : ''}>
            <input type="radio" name="tone" checked={settings.tone === tone.value}
              onChange={() => change({ ...settings, tone: tone.value })} />
            <b>{tone.label}</b>
            <span>{tone.hint}</span>
          </label>
        ))}
      </div>
      <label className="sf-field wide" style={{ marginTop: 16 }}>
        <span>Standing instructions</span>
        <textarea rows={5} maxLength={1000} value={settings.instructions}
          placeholder="For example: Use British spelling. Keep the payments work first."
          onChange={(e) => change({ ...settings, instructions: e.target.value })} />
      </label>
      <p className="sf-count">{status}</p>
    </div>
  );
}
