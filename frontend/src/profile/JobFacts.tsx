import { useState, type FormEvent, type ReactNode } from "react";
import type { CareerExperience, WorkType } from "./careerApi";
import { WORK_TYPE_NAMES, workFacts } from "./workPlace";
import { DateField } from "./ProfileCareerEditor";
import { useConfirm } from "../components/ConfirmDialog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2024-10" → "Oct 2024"; a year or free text stays as written. */
const shortDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return month ? `${month} ${match![1]}` : value.trim();
};

/** "Vancouver, BC, Canada" → city "Vancouver, BC", country "Canada"; "Canada" → country only. */
function splitPlace(location: string) {
  const at = location.lastIndexOf(",");
  return at < 0 ? { city: "", country: location.trim() } : { city: location.slice(0, at).trim(), country: location.slice(at + 1).trim() };
}

type Fact = "client" | "workType" | "location" | "dates";

/**
 * The facts under a job's title as pills: client, remote / hybrid / on site,
 * location and dates. A pill opens its own small editor; an empty one reads
 * "+ Client", "+ Location"… to fill it in. Remove empties it again.
 */
export function JobFacts({
  role,
  disabled,
  onSave,
}: {
  role: CareerExperience;
  disabled: boolean;
  /** Saves these fields on the job; rejects with a message when it cannot. */
  onSave(patch: Partial<CareerExperience>): Promise<void>;
}) {
  const [open, setOpen] = useState<Fact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { workType, location } = workFacts(role);
  const dates = [shortDate(role.from), role.current ? "Present" : shortDate(role.to)].filter(Boolean).join(" – ");

  async function save(patch: Partial<CareerExperience>) {
    setBusy(true);
    setError("");
    try {
      await onSave(patch);
      setOpen(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  // Whatever is saved, an older save's "Remote" in the location moves to its own field.
  const where = (patch: { workType?: WorkType | null; location?: string }) => {
    const next = { workType: patch.workType !== undefined ? patch.workType : workType, location: patch.location ?? location };
    return { workType: next.workType ?? undefined, location: next.location };
  };

  /** Empties one fact: what the × on its pill and Remove in its card save. */
  const removal = (fact: Fact): Partial<CareerExperience> =>
    fact === "client" ? { client: "" }
      : fact === "workType" ? where({ workType: null })
        : fact === "location" ? where({ location: "" })
          : { from: "", to: "", current: false };
  const confirm = useConfirm();
  async function askRemove(fact: Fact, label: string, shown: string) {
    const yes = await confirm({
      title: `Are you sure you want to remove the ${label.toLowerCase()}?`,
      body: <p>“{shown}” will be removed from this job in your Profile. Your saved CVs keep their own copy.</p>,
      action: "Remove",
    });
    if (yes) void save(removal(fact));
  }

  const pill = (fact: Fact, label: string, shown: string) => (
    <li key={fact} className={shown ? "has-remove" : undefined}>
      <button
        type="button"
        className={`job-fact${shown ? "" : " is-empty"}${open === fact ? " is-open" : ""}`}
        aria-expanded={open === fact}
        aria-label={shown ? `${label}: ${shown}. Edit` : `Add ${label.toLowerCase()}`}
        disabled={disabled || busy}
        onClick={() => {
          setError("");
          setOpen(open === fact ? null : fact);
        }}
      >
        {shown || `+ ${label}`}
      </button>
      {shown && (
        <button type="button" className="job-fact-x" aria-label={`Remove ${label.toLowerCase()}: ${shown}`} title="Remove" disabled={disabled || busy} onClick={() => void askRemove(fact, label, shown)}>
          ×
        </button>
      )}
    </li>
  );

  return (
    <div className="job-facts">
      <ul className="profile-pills">
        {pill("client", "Client", role.client.trim() && `for ${role.client.trim()}`)}
        {pill("workType", "Remote / on-site", workType ? WORK_TYPE_NAMES[workType] : "")}
        {pill("location", "Location", location)}
        {pill("dates", "Dates", dates)}
      </ul>
      {open === "client" && (
        <FactCard
          title="Client"
          hint="Who you worked for through this company, as in an outsourcing job."
          busy={busy}
          canRemove={Boolean(role.client.trim())}
          onRemove={() => void save(removal("client"))}
          onCancel={() => setOpen(null)}
          onSubmit={(form) => void save({ client: String(form.get("client") ?? "").trim() })}
        >
          <input name="client" aria-label="Client" autoFocus maxLength={2000} defaultValue={role.client} placeholder="Paymorrow/Verifone" />
        </FactCard>
      )}
      {open === "workType" && (
        <FactCard title="Remote / on-site" busy={busy} canRemove={Boolean(workType)} onRemove={() => void save(removal("workType"))} onCancel={() => setOpen(null)}>
          <div className="job-fact-choices" role="group" aria-label="How you worked">
            {(Object.keys(WORK_TYPE_NAMES) as WorkType[]).map((type) => (
              <button
                key={type}
                type="button"
                className={workType === type ? "is-on" : ""}
                aria-pressed={workType === type}
                disabled={busy}
                onClick={() => void save(where({ workType: type }))}
              >
                {WORK_TYPE_NAMES[type]}
              </button>
            ))}
          </div>
        </FactCard>
      )}
      {open === "location" && (
        <FactCard
          title="Location"
          hint="A city and country, or only the country. A remote job can still name its country."
          busy={busy}
          canRemove={Boolean(location)}
          onRemove={() => void save(removal("location"))}
          onCancel={() => setOpen(null)}
          onSubmit={(form) => {
            const city = String(form.get("city") ?? "").trim();
            const country = String(form.get("country") ?? "").trim();
            void save(where({ location: [city, country].filter(Boolean).join(", ") }));
          }}
        >
          <div className="job-fact-row">
            <input name="city" aria-label="City" maxLength={1000} defaultValue={splitPlace(location).city} placeholder="City (optional)" />
            <input name="country" aria-label="Country" autoFocus maxLength={1000} defaultValue={splitPlace(location).country} placeholder="Country" />
          </div>
        </FactCard>
      )}
      {open === "dates" && <DatesCard role={role} busy={busy} onCancel={() => setOpen(null)} onSave={(patch) => void save(patch)} />}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}

/** One fact's small editor under the pills: its fields, Remove, Cancel and Save. */
function FactCard({
  title,
  hint,
  busy,
  canRemove,
  children,
  onRemove,
  onCancel,
  onSubmit,
}: {
  title: string;
  hint?: string;
  busy: boolean;
  canRemove: boolean;
  children: ReactNode;
  onRemove(): void;
  onCancel(): void;
  /** Without it the card's own buttons save (the remote / on-site choice). */
  onSubmit?(form: FormData): void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(new FormData(event.currentTarget));
  };
  return (
    <form
      className="job-fact-card"
      aria-label={title}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <p className="job-fact-title">{title}</p>
      {hint && <p className="job-fact-hint">{hint}</p>}
      {children}
      <div className="ach-editor-actions">
        {canRemove && (
          <button type="button" className="profile-text-button job-fact-remove" disabled={busy} onClick={onRemove}>
            Remove
          </button>
        )}
        <span className="ach-actions-gap" />
        <button type="button" className="profile-text-button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {onSubmit && (
          <button type="submit" className="ach-save" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}

/** Start and end as month and year, or "I currently work here". */
function DatesCard({
  role,
  busy,
  onCancel,
  onSave,
}: {
  role: CareerExperience;
  busy: boolean;
  onCancel(): void;
  onSave(patch: Pick<CareerExperience, "from" | "to" | "current">): void;
}) {
  const [from, setFrom] = useState(role.from);
  const [to, setTo] = useState(role.to);
  const [current, setCurrent] = useState(role.current);
  return (
    <FactCard
      title="Dates"
      busy={busy}
      canRemove={Boolean(role.from || role.to || role.current)}
      onRemove={() => onSave({ from: "", to: "", current: false })}
      onCancel={onCancel}
      onSubmit={() => onSave({ from, to: current ? "" : to, current })}
    >
      <div className="career-dates job-fact-dates">
        <DateField label="Start date" value={from} onChange={setFrom} />
        <DateField label="End date" value={current ? "" : to} disabled={current} placeholder="Present" onChange={setTo} />
        <label className="profile-import-check career-current">
          <input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} />
          I currently work here
        </label>
      </div>
    </FactCard>
  );
}
