import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../AuthContext";
import { api, type ContactFields } from "../api";
import { SECTIONS, type ContactKey } from "../fields";
import { onExtensionDetected, pushProfile } from "../extensionBridge";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { ProfileCareer } from "../profile/ProfileCareer";
import { usePrimaryResume } from "../profile/usePrimaryResume";
import { ImportProfileDialog } from "../profile/ImportProfileDialog";
import { careerApi, type CareerState } from "../profile/careerApi";
import "../profile/profile.css";

type ProfileTab = "profile" | "personal" | "preferences";
const DERIVED: ContactKey[] = [
  "currentCompany",
  "currentTitle",
  "yearsExperience",
];

export function Profile() {
  const { user } = useAuth();
  const career = usePrimaryResume();
  const [profile, setProfile] = useState<ContactFields | null>(null);
  const [draft, setDraft] = useState<ContactFields | null>(null);
  const [active, setActive] = useState<ProfileTab>("profile");
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
        if (current)
          setLoadError(
            err instanceof Error ? err.message : "Could not load your profile.",
          );
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
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your profile. Your changes are still here.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    !!profile && !!draft && JSON.stringify(profile) !== JSON.stringify(draft);
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
  const checks = [
    !!profile?.firstName?.trim() && !!profile?.lastName?.trim(),
    !!profile?.email?.trim(),
    !!profile?.phone?.trim(),
    !!(profile?.location?.trim() || profile?.city?.trim()),
    !!career.primary?.currentSnapshotId,
    !!(
      profile?.linkedin?.trim() ||
      profile?.github?.trim() ||
      profile?.portfolio?.trim() ||
      profile?.website?.trim()
    ),
  ];
  const complete = checks.filter(Boolean).length;
  const percent = Math.round((complete / checks.length) * 100);
  const sections = SECTIONS.filter((section) =>
    active === "preferences"
      ? section.title === "Eligibility"
      : section.title !== "Eligibility",
  );

  if (loading)
    return (
      <div className="profile-page">
        <h1>Profile</h1>
        <section className="profile-panel">
          <p role="status">Loading your profile…</p>
        </section>
      </div>
    );
  if (loadError || !profile || !draft)
    return (
      <div className="profile-page">
        <h1>Profile</h1>
        <section className="profile-panel">
          <p className="profile-error" role="alert">
            {loadError || "Could not load your profile."}
          </p>
          <button
            className="profile-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry profile
          </button>
        </section>
      </div>
    );

  return (
    <div className="profile-page">
      <aside className="profile-sidebar" aria-label="Career hub">
        <section className="profile-panel profile-identity">
          <button
            className="profile-edit-button profile-identity-edit"
            aria-label="Edit profile information"
            onClick={() => setActive("personal")}
          >
            <Icon name="edit" />
          </button>
          <div className="profile-avatar">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}
          </div>
          <h1>{name}</h1>
          <p className="profile-headline">
            {[profile.currentTitle, profile.currentCompany]
              .filter(Boolean)
              .join(" @ ") || "Add your current role in your primary CV"}
          </p>
          <div className="profile-job-search">
            <span>Job Search Status</span>
            <strong className="profile-tag">Not set · Coming soon</strong>
          </div>
          <div className="profile-hub-nav">
            <h2>My Career Hub</h2>
            <button
              className={active === "profile" ? "is-active" : ""}
              aria-pressed={active === "profile"}
              onClick={() => setActive("profile")}
            >
              <Icon name="edit" />
              <span>
                <strong>Profile</strong>
                <span>Your career overview</span>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button
              className={active === "personal" ? "is-active" : ""}
              aria-pressed={active === "personal"}
              onClick={() => setActive("personal")}
            >
              <Icon name="user" />
              <span>
                <strong>Personal Info</strong>
                <span>Edit autofill information</span>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button
              className={active === "preferences" ? "is-active" : ""}
              aria-pressed={active === "preferences"}
              onClick={() => setActive("preferences")}
            >
              <Icon name="briefcase" />
              <span>
                <strong>Job Preferences</strong>
                <span>Eligibility, salary, and availability</span>
              </span>
              <Icon name="arrow" size={17} />
            </button>
          </div>
          {dirty && (
            <p className="profile-unsaved">You have unsaved profile changes.</p>
          )}
        </section>
        <section className="profile-panel profile-subscription">
          <h2>
            My subscription <span className="profile-tag">Preview</span>
          </h2>
          <p>
            <Icon name="rejected" />
            Subscription Status
          </p>
          <strong>Not connected</strong>
          <p>
            <Icon name="calendar" />
            Access Ends On
          </p>
          <strong>—</strong>
          <button className="profile-button" disabled>
            Manage Subscription
          </button>
        </section>
        <section className="profile-panel profile-strength">
          <h2>My Profile Strength</h2>
          <h3>
            {percent === 100 ? "Profile complete" : "Build your profile"}{" "}
            <Icon name="sparkle" />
          </h3>
          <p>
            Fill your contact details, add a primary CV, and link your work.
          </p>
          <div>
            <progress
              value={complete}
              max={checks.length}
              aria-label="Profile completeness"
            />
            <strong>{percent}%</strong>
          </div>
          <small>
            {complete} of {checks.length} profile checks complete
          </small>
        </section>
      </aside>

      <div className="profile-main" role="region" aria-label="Profile details">
        <section className="profile-panel profile-import-banner">
          <div className="profile-panel-heading">
            <div>
              <h2>Build your profile from your CV</h2>
              <p>
                Import contact details, work experience, education and skills.
                Review everything before saving.
              </p>
            </div>
            <button
              className="profile-button"
              disabled={dirty || saving || !careerState}
              onClick={() => setImporting({})}
            >
              <Icon name="file" size={17} />
              Import from CV
            </button>
          </div>
          {dirty && (
            <p>Save or discard your profile changes before importing a CV.</p>
          )}
          {active === "profile" && notice && (
            <p className="profile-success" role="status">
              {notice}
            </p>
          )}
          {active === "profile" && error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
        </section>
        {active === "profile" ? (
          <ProfileCareer
            career={career}
            profile={profile}
            imported={careerState?.data ?? {}}
            onImport={() => {
              if (!dirty && !saving) setImporting({});
            }}
            onImportCv={(resumeId) => {
              if (!dirty && !saving) setImporting({ resumeId });
            }}
            importDisabled={dirty || saving || !careerState}
            onEditPersonal={() => setActive("personal")}
          />
        ) : (
          <>
            <section className="profile-panel">
              <div className="profile-panel-heading">
                <h2>
                  {active === "personal" ? "Personal Info" : "Job Preferences"}
                </h2>
                <span
                  className={`profile-tag${extension ? " is-success" : ""}`}
                >
                  {extension ? "Extension connected" : "Extension not detected"}
                </span>
              </div>
              <p className="profile-source-note">
                These details fill your application forms. Save changes to
                update your account and connected extension.
              </p>
              <form
                className="profile-form"
                onSubmit={(event) => void save(event)}
              >
                <fieldset disabled={saving}>
                  {sections.map((section) => (
                    <section
                      className="profile-form-section"
                      key={section.title}
                    >
                      <h3>{section.title}</h3>
                      {section.hint && <p>{section.hint}</p>}
                      <div className="profile-field-grid">
                        {section.fields.map((field) => (
                          <label
                            className={field.half ? "is-half" : ""}
                            key={field.key}
                          >
                            <span>{field.label}</span>
                            <input
                              type="text"
                              value={draft[field.key] ?? ""}
                              placeholder={field.placeholder}
                              onChange={(event) => {
                                setDraft({
                                  ...draft,
                                  [field.key]: event.target.value,
                                });
                                setError("");
                                setNotice("");
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                  {active === "preferences" && (
                    <section className="profile-form-section">
                      <h3>
                        Current role{" "}
                        <span className="profile-muted">
                          from your saved work experience
                        </span>
                      </h3>
                      <div className="profile-field-grid">
                        {DERIVED.map((key) => (
                          <label className="is-half" key={key}>
                            <span>
                              {key === "yearsExperience"
                                ? "Years of experience"
                                : key === "currentCompany"
                                  ? "Company"
                                  : "Title"}
                            </span>
                            <input value={profile[key] ?? ""} readOnly />
                          </label>
                        ))}
                      </div>
                      <p>
                        Import work experience into Profile to update these
                        values. Until then, they come from your primary CV.
                      </p>
                    </section>
                  )}
                  <div className="profile-savebar">
                    <button
                      className="profile-button"
                      type="submit"
                      disabled={saving || !dirty}
                    >
                      {saving ? "Saving…" : "Save profile"}
                    </button>
                    {dirty && (
                      <>
                        <button
                          className="profile-button is-secondary"
                          type="button"
                          onClick={() => {
                            setDraft({ ...profile });
                            setError("");
                            setNotice("Changes discarded.");
                          }}
                        >
                          Discard changes
                        </button>
                        <span>Unsaved changes</span>
                      </>
                    )}
                  </div>
                </fieldset>
              </form>
              {error && (
                <p className="profile-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="profile-success" role="status">
                  {notice}
                </p>
              )}
            </section>
          </>
        )}
      </div>
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
              .catch(() =>
                setError(
                  "The import was saved, but personal details could not refresh. Reload the page to see them.",
                ),
              );
          }}
        />
      )}
    </div>
  );
}
