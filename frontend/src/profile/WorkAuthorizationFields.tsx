import { BASES, COUNTRIES, PERMITS, answer, countryOf, emptyStatus, missingOf, needsPermit, type CountryStatus } from "./workAuthorization";

/**
 * Jobright's work authorization questions: the countries you want to work in
 * (flags), then a card per country. Only the questions that apply are shown,
 * and with `showErrors` each one still missing says so.
 */
export function WorkAuthorizationFields({
  statuses,
  onChange,
  showErrors,
}: {
  statuses: CountryStatus[];
  onChange(next: CountryStatus[]): void;
  showErrors: boolean;
}) {
  const toggle = (code: CountryStatus["country"]) =>
    onChange(
      statuses.some((status) => status.country === code)
        ? statuses.filter((status) => status.country !== code)
        : COUNTRIES.map((country) => statuses.find((status) => status.country === country.code) ?? (country.code === code ? emptyStatus(code) : null)).filter((status): status is CountryStatus => Boolean(status)),
    );
  const update = (code: CountryStatus["country"], field: Parameters<typeof answer>[1], value: string) =>
    onChange(statuses.map((status) => (status.country === code ? answer(status, field, value) : status)));
  const error = (text = "Please choose an answer") => <span className="complete-error" role="alert">{text}</span>;

  const yesNo = (status: CountryStatus, field: "citizenship" | "authorized" | "sponsorship", question: string) => (
    <div className="work-row" data-missing={showErrors && missingOf(status).includes(field) ? "" : undefined} key={field}>
      <span className="work-question" id={`${status.country}-${field}`}>{question}</span>
      <span className="work-choices" role="group" aria-labelledby={`${status.country}-${field}`}>
        {(["Yes", "No"] as const).map((value) => (
          <button type="button" key={value} aria-pressed={status[field] === value} onClick={() => update(status.country, field, value)}>
            {value}
          </button>
        ))}
      </span>
      {showErrors && missingOf(status).includes(field) && error()}
    </div>
  );

  return (
    <div className="work-authorization">
      <div className="work-row work-countries" data-missing={showErrors && !statuses.length ? "" : undefined}>
        <span className="work-question" id="work-countries"><b aria-hidden="true">*</b> Countries where you want to work?</span>
        <span className="work-flags" role="group" aria-labelledby="work-countries">
          {COUNTRIES.map((country) => (
            <button
              type="button"
              key={country.code}
              title={country.name}
              aria-label={country.name}
              aria-pressed={statuses.some((status) => status.country === country.code)}
              onClick={() => toggle(country.code)}
            >
              <span aria-hidden="true">{country.flag}</span>
            </button>
          ))}
        </span>
        {showErrors && !statuses.length && error("Choose at least one country")}
      </div>
      {statuses.map((status) => {
        const { name, article, flag } = countryOf(status.country);
        const missing = showErrors ? missingOf(status) : [];
        return (
          <section className="work-card" key={status.country} aria-label={name}>
            <h4><span aria-hidden="true">{flag}</span> {name}</h4>
            {yesNo(status, "citizenship", `Are you a citizen of ${article}?`)}
            {status.citizenship === "No" && (
              <>
                {yesNo(status, "authorized", `Are you legally authorized to work in ${article}?`)}
                {yesNo(status, "sponsorship", `Will you now or in the future require employer sponsorship in ${article}?`)}
                {status.authorized === "Yes" && (
                  <label className="work-row" data-missing={missing.includes("basis") ? "" : undefined}>
                    <span className="work-question">Authorization basis</span>
                    <select value={status.basis} onChange={(event) => update(status.country, "basis", event.target.value)}>
                      <option value="">Select</option>
                      {BASES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {missing.includes("basis") && error()}
                  </label>
                )}
                {needsPermit(status) && (
                  <label className="work-row" data-missing={missing.includes("permit") ? "" : undefined}>
                    <span className="work-question">Work permit or visa type</span>
                    <select value={status.permit} onChange={(event) => update(status.country, "permit", event.target.value)}>
                      <option value="">Select</option>
                      {PERMITS[status.country].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    {missing.includes("permit") && error()}
                  </label>
                )}
                {status.authorized === "Yes" && status.basis === "TEMPORARY_WORK_AUTHORIZATION" && (
                  <label className="work-row">
                    <span className="work-question">When does it expire? <small>Some forms ask for it.</small></span>
                    <input type="date" aria-label={`${name} permit expiry date`} value={/^\d{4}-\d{2}-\d{2}$/.test(status.expiry) ? status.expiry : ""} onChange={(event) => update(status.country, "expiry", event.target.value)} />
                  </label>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
