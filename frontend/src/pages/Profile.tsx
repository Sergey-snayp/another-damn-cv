import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { api, type ContactFields } from "../api";
import { SECTIONS, type ContactKey } from "../fields";
import { onExtensionDetected, pushProfile } from "../extensionBridge";
import { DashboardIcon as Icon, type DashboardIconName } from "../jobs/DashboardIcon";
import { ProfileCareer, ResumeCard } from "../profile/ProfileCareer";
import { SavedAnswers } from "../profile/SavedAnswers";
import { DefaultAnswers } from "../profile/DefaultAnswers";
import { usePrimaryResume } from "../profile/usePrimaryResume";
import { ImportProfileDialog } from "../profile/ImportProfileDialog";
import { careerApi, type CareerState } from "../profile/careerApi";
import { ProfileCareerEditor, type CareerSectionKey } from "../profile/ProfileCareerEditor";
import "../profile/profile.css";

type ProfileTab = "career" | "personal" | "preferences" | "answers";
const TABS: { id: ProfileTab; label: string }[] = [
  { id: "career", label: "Career" },
  { id: "personal", label: "Personal info" },
  { id: "preferences", label: "Job preferences" },
  { id: "answers", label: "Autofill answers" },
];
const WORK_TYPES = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;
/** Answered Yes or No on forms; any other saved wording is kept as a choice. */
const YES_NO: ContactKey[] = ["workAuthorization", "requiresSponsorship"];
const LINKS: { key: ContactKey; label: string; icon: DashboardIconName }[] = [
  { key: "linkedin", label: "LinkedIn", icon: "user" },
  { key: "github", label: "GitHub", icon: "code" },
  { key: "portfolio", label: "Portfolio", icon: "laptop" },
  { key: "website", label: "Website", icon: "link" },
];

function webUrl(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function Profile() {
  const { user } = useAuth();
  const career = usePrimaryResume();
  const [profile, setProfile] = useState<ContactFields | null>(null);
  const [draft, setDraft] = useState<ContactFields | null>(null);
  const [active, setActive] = useState<ProfileTab>("career");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [extension, setExtension] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [careerState, setCareerState] = useState<CareerState | null>(null);
  // false, or the import dialog's options: a saved CV to start from.
  const [importing, setImporting] = useState<false | { resumeId?: string }>(false);
  // A whole section, or (from a job's or school's own edit button) just that entry.
  const [editingCareer, setEditingCareer] = useState<{ section: CareerSectionKey; entry?: number } | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    void Promise.all([api.profile(), careerApi.read()])
      .then(([row, history]) => {
        if (current) {
          setProfile(row);
          setDraft({ ...row });
          setCareerState(history);
        }
      })
      .catch((err: unknown) => {
        if (current) setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  useEffect(() => onExtensionDetected(setExtension), []);
  // Sync saved account data. Editing a field does not send an unsaved draft to the extension.
  useEffect(() => {
    if (extension && profile) void pushProfile(profile);
  }, [extension, profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.saveProfile(draft);
      setProfile(saved);
      setDraft({ ...saved });
      setNotice("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Your changes are still here.");
    } finally {
      setSaving(false);
    }
  }

  const dirty = !!profile && !!draft && JSON.stringify(profile) !== JSON.stringify(draft);
  const name =
    profile?.fullName?.trim() ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "Your profile";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const roles = careerState?.data.experiences?.value ?? [];
  const currentRole = roles.find((role) => role.current) ?? [...roles].sort((a, b) => b.from.localeCompare(a.from))[0];
  const headline = [currentRole?.title, currentRole?.company].filter(Boolean).join(" · ");
  const place = profile?.location?.trim() || [profile?.city, profile?.country].filter((part) => part?.trim()).join(", ");
  // What is still missing, each with where to fill it in. Shown only while something is.
  const missing: { label: string; go(): void }[] = profile
    ? [
        { done: !!profile.firstName?.trim() && !!profile.lastName?.trim(), label: "Your name", go: () => setActive("personal") },
        { done: !!profile.email?.trim(), label: "Email", go: () => setActive("personal") },
        { done: !!profile.phone?.trim(), label: "Phone", go: () => setActive("personal") },
        { done: !!place, label: "Location", go: () => setActive("personal") },
        { done: roles.length > 0, label: "Work experience", go: () => setEditingCareer({ section: "experiences" }) },
        { done: LINKS.some((link) => profile[link.key]?.trim()), label: "A link (LinkedIn, GitHub…)", go: () => setActive("personal") },
      ].filter((item) => !item.done)
    : [];
  const update = (key: ContactKey, value: string) => {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setError("");
    setNotice("");
  };

  if (loading || loadError || !profile || !draft)
    return (
      <div className="profile-page">
        <h1 className="profile-page-title">Profile</h1>
        <section className="profile-panel">
          {loading ? (
            <p role="status">Loading your profile…</p>
          ) : (
            <>
              <p className="profile-error" role="alert">{loadError || "Could not load your profile."}</p>
              <button className="profile-button" onClick={() => setAttempt((value) => value + 1)}>Retry profile</button>
            </>
          )}
        </section>
      </div>
    );

  const field = (key: ContactKey, label: string, half = false, placeholder?: string) =>
    YES_NO.includes(key) ? (
      <label className={half ? "is-half" : ""} key={key}>
        <span>{label}</span>
        <select value={draft[key] ?? ""} onChange={(event) => update(key, event.target.value)}>
          <option value="">Not set</option>
          {[...new Set(["Yes", "No", draft[key]].filter(Boolean))].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    ) : (
      <label className={half ? "is-half" : ""} key={key}>
        <span>{label}</span>
        <input type="text" value={draft[key] ?? ""} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} />
      </label>
    );
  const kinds = (draft.workArrangements ?? "").split(",").filter(Boolean);
  const formSections =
    active === "personal"
      ? SECTIONS.filter((section) => section.title !== "Eligibility")
      : SECTIONS.filter((section) => section.title === "Eligibility");

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="profile-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}</div>
        <div className="profile-header-text">
          <h1>{name}</h1>
          {headline && <p className="profile-headline">{headline}</p>}
          <p className="profile-meta">
            {place && (
              <span>
                <Icon name="location" size={15} />
                {place}
              </span>
            )}
            {LINKS.map((link) => {
              const href = webUrl(profile[link.key]);
              return href ? (
                <a key={link.key} href={href} target="_blank" rel="noreferrer noopener" aria-label={link.label} title={profile[link.key]}>
                  <Icon name={link.icon} size={15} />
                  {link.label}
                </a>
              ) : null;
            })}
          </p>
        </div>
        <div className="profile-header-actions">
          <button className="profile-button is-secondary" onClick={() => setActive("personal")}>
            Edit details
          </button>
          <button
            className="profile-button"
            disabled={dirty || saving || !careerState}
            title={dirty ? "Save or discard your changes first." : "Fill your Profile from a CV, choosing what to keep."}
            onClick={() => setImporting({})}
          >
            <Icon name="upload" size={16} />
            Import from CV
          </button>
        </div>
      </header>

      <nav className="profile-tabs" aria-label="Profile sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={active === tab.id ? "is-active" : ""}
            aria-current={active === tab.id ? "page" : undefined}
            onClick={() => {
              setActive(tab.id);
              setNotice("");
            }}
          >
            {tab.label}
            {dirty && (tab.id === "personal" || tab.id === "preferences") && <span className="profile-dot" aria-label="unsaved changes" />}
          </button>
        ))}
      </nav>

      {notice && <p className="profile-success" role="status">{notice}</p>}
      {error && active === "career" && <p className="profile-error" role="alert">{error}</p>}

      {active === "career" ? (
        <div className="profile-layout">
          <div className="profile-main" role="region" aria-label="Career">
            <ProfileCareer
              imported={careerState?.data ?? {}}
              importDisabled={dirty || saving || !careerState}
              onEditCareer={(section, entry) => setEditingCareer({ section, entry })}
            />
          </div>
          <aside className="profile-side">
            <ResumeCard
              career={career}
              importDisabled={dirty || saving || !careerState}
              onImportCv={(resumeId) => {
                if (!dirty && !saving) setImporting({ resumeId });
              }}
            />
            {missing.length > 0 && (
              <section className="profile-panel profile-side-card" aria-labelledby="profile-missing-heading">
                <h2 id="profile-missing-heading">Finish your profile</h2>
                <p className="profile-muted">Autofill and job matching use these.</p>
                <ul className="profile-checklist">
                  {missing.map((item) => (
                    <li key={item.label}>
                      <button type="button" className="profile-text-button" onClick={item.go}>
                        <Icon name="plus" size={14} />
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      ) : active === "answers" ? (
        <div className="profile-main">
          <SavedAnswers />
          <DefaultAnswers />
        </div>
      ) : (
        <form className="profile-form profile-panel" onSubmit={(event) => void save(event)}>
          <fieldset disabled={saving}>
            {active === "preferences" && (
              <section className="profile-form-section">
                <h3>Type of work</h3>
                <div className="profile-choices" role="group" aria-label="Types of work you accept">
                  {WORK_TYPES.map((type) => (
                    <label key={type.value} className="profile-choice">
                      <input
                        type="checkbox"
                        checked={kinds.includes(type.value)}
                        onChange={() => {
                          const next = kinds.includes(type.value) ? kinds.filter((kind) => kind !== type.value) : [...kinds, type.value];
                          update("workArrangements", WORK_TYPES.map((item) => item.value).filter((kind) => next.includes(kind)).join(","));
                        }}
                      />
                      {type.label}
                    </label>
                  ))}
                </div>
              </section>
            )}
            {formSections.map((section) => (
              <section className="profile-form-section" key={section.title}>
                <h3>{section.title === "Eligibility" ? "Eligibility and pay" : section.title}</h3>
                {section.title === "Location" && <p className="profile-muted">Location is the whole place as forms ask for it, e.g. Vancouver, BC, Canada.</p>}
                <div className="profile-field-grid">
                  {section.fields.map((spec) =>
                    field(spec.key, spec.key === "workAuthorization" ? "Authorized to work" : spec.label, spec.half, YES_NO.includes(spec.key) ? undefined : spec.placeholder),
                  )}
                </div>
              </section>
            ))}
          </fieldset>
          <div className={`profile-savebar${dirty ? " is-dirty" : ""}`}>
            {error && <span className="profile-error" role="alert">{error}</span>}
            <span className="profile-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
            {dirty && (
              <button
                className="profile-button is-secondary"
                type="button"
                onClick={() => {
                  setDraft({ ...profile });
                  setError("");
                }}
              >
                Discard
              </button>
            )}
            <button className="profile-button" type="submit" disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}

      {importing && careerState && (
        <ImportProfileDialog
          profile={profile}
          career={careerState}
          initialResumeId={importing.resumeId}
          onClose={() => setImporting(false)}
          onApplied={(state) => {
            setImporting(false);
            setCareerState(state);
            setError("");
            setNotice("Selected CV information saved to your profile.");
            void api
              .profile()
              .then((next) => {
                setProfile(next);
                setDraft({ ...next });
              })
              .catch(() => setError("The import was saved, but personal details could not refresh. Reload the page to see them."));
          }}
        />
      )}
      {editingCareer && careerState && (
        <ProfileCareerEditor
          section={editingCareer.section}
          entry={editingCareer.entry}
          career={careerState}
          onClose={() => setEditingCareer(null)}
          onSaved={(state) => {
            setCareerState(state);
            setEditingCareer(null);
            setNotice("Profile career details saved.");
            void api
              .profile()
              .then((next) => {
                setProfile(next);
                setDraft({ ...next });
              })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
