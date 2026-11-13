import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { CareerExperience, WorkType } from "./careerApi";
import { WORK_TYPE_NAMES, workFacts } from "./workPlace";
import { DateField } from "./ProfileCareerEditor";
import { useConfirm } from "../components/ConfirmDialog";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";

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

/** Every country's name in English, for the Country field's suggestions. */
const COUNTRY_CODES =
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW";
let countries: string[] | null = null;
const countryNames = () => {
  if (countries) return countries;
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countries = COUNTRY_CODES.split(" ").map((code) => names.of(code) ?? code).sort((a, b) => a.localeCompare(b));
  } catch {
    countries = [];
  }
  return countries;
};

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
  const box = useRef<HTMLDivElement>(null);
  const pills = useRef<Partial<Record<Fact, HTMLButtonElement | null>>>({});
  /**
   * Closes the editor. Closed from the keyboard, ×, Cancel or Save, the
   * keyboard goes back to its pill; a click elsewhere keeps its own focus.
   */
  const close = (refocus = true) => {
    const fact = open;
    setOpen(null);
    if (fact && refocus) requestAnimationFrame(() => pills.current[fact]?.focus());
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { workType, location } = workFacts(role);
  const dates = [shortDate(role.from), role.current ? "Present" : shortDate(role.to)].filter(Boolean).join(" – ");

  async function save(patch: Partial<CareerExperience>) {
    setBusy(true);
    setError("");
    try {
      await onSave(patch);
      close();
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
        ref={(node) => {
          pills.current[fact] = node;
        }}
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
          <Icon name="close" size={12} />
        </button>
      )}
    </li>
  );

  return (
    <div className="job-facts" ref={box}>
      <ul className="profile-pills">
        {pill("client", "Client", role.client.trim() && `for ${role.client.trim()}`)}
        {pill("workType", "Remote / on-site", workType ? WORK_TYPE_NAMES[workType] : "")}
        {pill("location", "Location", location)}
        {pill("dates", "Dates", dates)}
      </ul>
      {open === "client" && (
        <FactCard
          title="Client"
          anchor={pills.current.client}
          container={box.current}
          busy={busy}
          canRemove={Boolean(role.client.trim())}
          onRemove={() => void save(removal("client"))}
          onCancel={close}
          onSubmit={(form) => void save({ client: String(form.get("client") ?? "").trim() })}
        >
          <label className="job-fact-field">
            <span>Client name</span>
            <input name="client" autoFocus maxLength={2000} defaultValue={role.client} placeholder="e.g. Paymorrow" />
            <small>Who you worked for through this company, as in an outsourcing job.</small>
          </label>
        </FactCard>
      )}
      {open === "workType" && (
        <FactCard title="Remote / on-site" anchor={pills.current.workType} container={box.current} busy={busy} canRemove={Boolean(workType)} onRemove={() => void save(removal("workType"))} onCancel={close}>
          <div className="job-fact-segments" role="group" aria-label="How you worked">
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
          anchor={pills.current.location}
          container={box.current}
          busy={busy}
          canRemove={Boolean(location)}
          onRemove={() => void save(removal("location"))}
          onCancel={close}
          onSubmit={(form) => {
            const city = String(form.get("city") ?? "").trim();
            const country = String(form.get("country") ?? "").trim();
            void save(where({ location: [city, country].filter(Boolean).join(", ") }));
          }}
        >
          <div className="job-fact-row">
            <label className="job-fact-field">
              <span>Country</span>
              <input name="country" autoFocus maxLength={1000} list="job-fact-countries" autoComplete="off" defaultValue={splitPlace(location).country} placeholder="e.g. Canada" />
            </label>
            <label className="job-fact-field">
              <span>
                City <em>optional</em>
              </span>
              <input name="city" maxLength={1000} defaultValue={splitPlace(location).city} placeholder="e.g. Vancouver" />
            </label>
          </div>
          <datalist id="job-fact-countries">
            {countryNames().map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <small className="job-fact-help">A remote job can still name its country.</small>
        </FactCard>
      )}
      {open === "dates" && <DatesCard role={role} anchor={pills.current.dates} container={box.current} busy={busy} onCancel={close} onSave={(patch) => void save(patch)} />}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * One fact's editor: a small panel anchored under its pill, pointing at it,
 * floating over the page so nothing below moves. A title and ×, its fields
 * with their labels, then Remove on the left and Cancel / Save on the right.
 * Escape, a click outside or × closes it.
 */
function FactCard({
  title,
  anchor,
  container,
  wide = false,
  busy,
  canRemove,
  children,
  onRemove,
  onCancel,
  onSubmit,
}: {
  title: string;
  /** The pill it opens from, and the job's facts box it is placed in. */
  anchor: HTMLElement | null | undefined;
  container: HTMLElement | null;
  /** Room for two fields side by side (the dates). */
  wide?: boolean;
  busy: boolean;
  canRemove: boolean;
  children: ReactNode;
  onRemove(): void;
  /** `false` when closed by a click elsewhere. */
  onCancel(refocus?: boolean): void;
  /** Without it the panel's own buttons save (the remote / on-site choice). */
  onSubmit?(form: FormData): void;
}) {
  const panel = useRef<HTMLFormElement>(null);
  const [place, setPlace] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const at = () => {
      if (!anchor || !container || !panel.current) return;
      const box = container.getBoundingClientRect();
      const pill = anchor.getBoundingClientRect();
      const width = Math.min(panel.current.offsetWidth, box.width);
      const left = Math.max(0, Math.min(pill.left - box.left, box.width - width));
      setPlace({ top: pill.bottom - box.top + 10, left, ["--arrow" as string]: `${Math.max(14, Math.min(pill.left - box.left - left + pill.width / 2, width - 14))}px` });
    };
    at();
    addEventListener("resize", at);
    return () => removeEventListener("resize", at);
  }, [anchor, container]);
  // A click anywhere else closes it, as a menu does; the pill toggles it itself.
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor?.contains(target)) onCancel(false);
    };
    // Escape closes it wherever the keyboard is, also on its pill after a click.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onCancel(true);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor, onCancel]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(new FormData(event.currentTarget));
  };
  return (
    <form
      ref={panel}
      className={`job-fact-card${wide ? " is-wide" : ""}`}
      style={place}
      aria-label={title}
      onSubmit={submit}
    >
      <div className="job-fact-head">
        <p className="job-fact-title">{title}</p>
        <button type="button" className="job-fact-close" aria-label="Close" title="Close (Esc)" onClick={() => onCancel(true)}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="job-fact-body">{children}</div>
      <div className="job-fact-foot">
        {canRemove && (
          <button type="button" className="job-fact-remove" disabled={busy} onClick={onRemove}>
            <Icon name="trash" size={15} />
            Remove
          </button>
        )}
        <span className="ach-actions-gap" />
        <button type="button" className="job-fact-cancel" disabled={busy} onClick={() => onCancel(true)}>
          {onSubmit ? "Cancel" : "Close"}
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
  anchor,
  container,
  busy,
  onCancel,
  onSave,
}: {
  role: CareerExperience;
  anchor: HTMLElement | null | undefined;
  container: HTMLElement | null;
  busy: boolean;
  onCancel(refocus?: boolean): void;
  onSave(patch: Pick<CareerExperience, "from" | "to" | "current">): void;
}) {
  const [from, setFrom] = useState(role.from);
  const [to, setTo] = useState(role.to);
  const [current, setCurrent] = useState(role.current);
  return (
    <FactCard
      title="Dates"
      anchor={anchor}
      container={container}
      wide
      busy={busy}
      canRemove={Boolean(role.from || role.to || role.current)}
      onRemove={() => onSave({ from: "", to: "", current: false })}
      onCancel={onCancel}
      onSubmit={() => onSave({ from, to: current ? "" : to, current })}
    >
      <div className="job-fact-dates">
        <DateField label="Start" value={from} onChange={setFrom} />
        <DateField label="End" value={current ? "" : to} disabled={current} placeholder="Present" onChange={setTo} />
        <label className="job-fact-check">
          <input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} />
          I currently work here
        </label>
      </div>
    </FactCard>
  );
}
