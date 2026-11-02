import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  DashboardIcon as Icon,
  type DashboardIconName,
} from "../jobs/DashboardIcon";
import { HOME_PREVIEW as sample } from "../home/homePreview";
import "../home/home.css";

export function Home() {
  const { user } = useAuth();
  const steps = useRef<HTMLDivElement>(null);
  const goalTrigger = useRef<HTMLButtonElement | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [frequency, setFrequency] = useState("never");
  const [showEmail, setShowEmail] = useState(true);
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const applications =
    period === "week"
      ? sample.applicationsThisWeek
      : sample.applicationsAllTime;
  const interviews =
    period === "week" ? sample.interviewsThisWeek : sample.interviewsAllTime;
  const saved = period === "week" ? sample.savedThisWeek : sample.savedAllTime;
  const progress = goal
    ? Math.min(100, (sample.applicationsThisWeek / goal) * 100)
    : 100;

  useEffect(() => {
    if (!goalOpen) goalTrigger.current?.focus();
  }, [goalOpen]);

  function openGoal(event: MouseEvent<HTMLButtonElement>) {
    goalTrigger.current = event.currentTarget;
    setGoalOpen(true);
  }

  function scrollSteps(direction: number) {
    const element = steps.current;
    element?.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-container">
          <div className="home-welcome">
            <h1>Welcome, {firstName}</h1>
            <span className="home-preview-label" id="home-preview-note">
              Design preview · Sample statistics
            </span>
          </div>
          <section
            className="home-card home-streak"
            aria-label="Activity streak preview"
          >
            <div className="home-streak-top">
              <div className="home-streak-title">
                <Icon name="flame" size={40} />
                <h2>{sample.streak} Day Streak</h2>
              </div>
              <PreviewButton>
                <Icon name="sparkle" />
                Recruiter Highlight
              </PreviewButton>
              <div className="home-streak-actions">
                <PreviewButton>
                  <Icon name="options" />
                  Match Preferences
                </PreviewButton>
                <Link className="home-button is-primary" to="/dashboard">
                  Browse jobs
                </Link>
              </div>
            </div>
            <div className="home-streak-bottom">
              <p>
                <Icon name="flame" />
                View 5 matches to start your streak!
              </p>
              <div className="home-streak-progress">
                <progress
                  value={sample.streak}
                  max={sample.streakGoal}
                  aria-label="Streak progress"
                />
                <strong>
                  day {sample.streak}/{sample.streakGoal}
                </strong>
              </div>
            </div>
          </section>
        </div>
      </section>

      <div className="home-container home-sections">
        <section className="home-card home-onboarding">
          <div className="home-section-heading">
            <div>
              <h2>Get started</h2>
              <p>Complete a few steps to land your next job.</p>
            </div>
            <div className="home-onboarding-progress">
              <progress
                value={sample.onboardingDone}
                max={sample.onboardingTotal}
                aria-label="Getting started progress"
              />
              <strong>
                {sample.onboardingDone}/{sample.onboardingTotal}
              </strong>
            </div>
          </div>
          <div className="home-step-wrap">
            <div
              className="home-steps"
              ref={steps}
              aria-label="Getting started steps"
            >
              <ActionCard
                icon="user"
                title="Complete your profile"
                description="Add more details to build your job history."
                to="/profile"
              />
              <ActionCard
                icon="list"
                title="Explore job lists"
                description="Browse your saved roles and companies."
                to="/dashboard"
              />
              <ActionCard
                icon="file"
                title="Upload your resume"
                description="Keep your application documents in one place."
                to="/documents"
              />
              <ActionCard
                icon="applied"
                title="Track an application"
                description="Follow each step of your job search."
                to="/dashboard"
              />
              <ActionCard
                icon="interview"
                title="Prepare for an interview"
                description="Collect your examples and questions."
                to="/interview-prep"
              />
              <button className="home-action-card" onClick={openGoal}>
                <span className="home-icon-tile">
                  <Icon name="chart" />
                </span>
                <span>
                  <strong>Set a weekly goal</strong>
                  <span>Choose an application target to work towards.</span>
                </span>
                <Icon name="arrow" />
              </button>
            </div>
            <div className="home-carousel-controls">
              <button
                aria-label="Previous getting started steps"
                onClick={() => scrollSteps(-1)}
              >
                <span className="home-arrow-back">
                  <Icon name="arrow" />
                </span>
              </button>
              <button
                aria-label="Next getting started steps"
                onClick={() => scrollSteps(1)}
              >
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        </section>

        <section
          className="home-card home-promotion"
          aria-labelledby="home-contributor-title"
        >
          <div>
            <span className="home-chip">Example program · Preview</span>
            <h2 id="home-contributor-title">
              <Icon name="laptop" size={26} />
              Become a certified AI contributor
            </h2>
            <p>
              Get paid to use your expertise to evaluate and train AI models.
              <br />
              <strong>100% remote &amp; flexible hours.</strong>
            </p>
          </div>
          <div className="home-promotion-art">
            <span className="home-chip">Contributor program</span>
            <div className="home-people" aria-hidden="true">
              <span>A</span>
              <span>M</span>
              <span>J</span>
            </div>
            <strong>Join 20k+ active users</strong>
            <small>Reference content · Not available in this app</small>
          </div>
        </section>

        <section className="home-card">
          <div className="home-section-heading">
            <h2>
              Autopilot <span className="home-chip">Preview</span>
            </h2>
            <span className="home-credit">
              <Icon name="bolt" filled />
              {sample.credits}
            </span>
          </div>
          <div className="home-stats">
            <Stat value={sample.inProgress} label="In progress" />
            <Stat
              value={sample.submittedThisWeek}
              label="Submitted this week"
            />
            <Stat value={sample.submittedAllTime} label="Submitted all time" />
          </div>
          <div className="home-card-footer">
            <p>No applications submitted yet</p>
            <PreviewButton primary>View Autopilot</PreviewButton>
          </div>
        </section>

        <section className="home-card home-profile-overview">
          <div>
            <span className="home-chip is-outline">
              Profile {sample.profilePercent}% complete
            </span>
            <h2>
              You are an All-Star Applicant <Icon name="sparkle" />
            </h2>
            <p>
              Keep your profile ready for your next application.{" "}
              <Link to="/profile">Edit profile →</Link>
            </p>
          </div>
          <div>
            <h2>
              <Icon name="flame" />
              You saved {sample.hoursSaved} hours so far!
            </h2>
            <p>By autofilling your job applications with the extension.</p>
            <small className="home-muted">
              Example estimate for this layout
            </small>
          </div>
        </section>

        <section aria-labelledby="home-quick-menu">
          <h2 className="home-heading" id="home-quick-menu">
            Quick Menu
          </h2>
          <div className="home-quick-menu">
            <ActionCard
              icon="file"
              title="Generate resume"
              description="Create new"
              to="/documents"
            />
            <ActionCard
              icon="offer"
              title="Generate cover letter"
              description="Coming soon"
            />
            <ActionCard
              icon="interview"
              title="Question Response"
              description="Coming soon"
            />
          </div>
        </section>

        <section aria-labelledby="home-applications">
          <h2 className="home-heading" id="home-applications">
            My Job Applications
          </h2>
          <div className="home-card home-tracker">
            <div className="home-weekly">
              <h3>Week of {sample.week}</h3>
              <div className="home-weekly-content">
                <div className="home-gauge">
                  <svg
                    viewBox="0 0 220 132"
                    role="img"
                    aria-label={`${sample.applicationsThisWeek} applications this week${goal ? `, goal ${goal}` : ", no weekly goal set"}`}
                  >
                    <path
                      className="home-gauge-track"
                      d="M20 110a90 90 0 0 1 180 0"
                    />
                    <path
                      className="home-gauge-value"
                      d="M20 110a90 90 0 0 1 180 0"
                      pathLength="100"
                      strokeDasharray={`${progress} 100`}
                    />
                    <text x="110" y="103" textAnchor="middle">
                      {sample.applicationsThisWeek}
                    </text>
                  </svg>
                  <p>jobs applied</p>
                </div>
                <div>
                  <h3>
                    {goal
                      ? `${goal} applications per week`
                      : "No weekly goal set"}
                  </h3>
                  <p>
                    {goal
                      ? `${Math.max(0, goal - sample.applicationsThisWeek)} more to reach this preview goal.`
                      : "Set a weekly application goal to give your job search a clear focus."}
                  </p>
                </div>
              </div>
              <button className="home-button is-primary" onClick={openGoal}>
                {goal ? "Change weekly goal" : "Set a weekly goal"}
              </button>
            </div>
            <div className="home-tracker-overview">
              <div className="home-section-heading">
                <h3>Tracker Overview</h3>
                <select
                  aria-label="Tracker overview period"
                  value={period}
                  onChange={(event) =>
                    setPeriod(event.target.value as "week" | "all")
                  }
                >
                  <option value="week">This week</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <dl>
                <Overview
                  icon="applied"
                  label={
                    period === "week"
                      ? "Applications this week"
                      : "Applications all time"
                  }
                  value={applications}
                />
                <Overview
                  icon="interview"
                  label={
                    period === "week"
                      ? "Interviews this week"
                      : "Interviews all time"
                  }
                  value={interviews}
                />
                <Overview
                  icon="heart"
                  label={
                    period === "week"
                      ? "Saved jobs this week"
                      : "Saved jobs all time"
                  }
                  value={saved}
                />
              </dl>
              <Link className="home-text-link" to="/dashboard">
                Go to tracker <Icon name="arrow" />
              </Link>
            </div>
          </div>
        </section>

        {showEmail && (
          <section aria-labelledby="home-emails">
            <div className="home-section-heading">
              <h2 className="home-heading" id="home-emails">
                Sign Up for Email Notifications
              </h2>
              <button
                className="home-icon-button"
                aria-label="Dismiss email notifications preview"
                onClick={() => setShowEmail(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="home-card">
              <div className="home-section-heading">
                <h3>
                  When should we email you with new jobs that match your
                  preferences?
                </h3>
                <PreviewButton>
                  <Icon name="options" />
                  Match Preferences
                </PreviewButton>
              </div>
              <fieldset className="home-email-options">
                <legend className="home-sr-only">
                  Email frequency preview
                </legend>
                {[
                  {
                    value: "daily",
                    title: "Daily",
                    icon: "flame",
                    text: "Apply to opportunities as soon as they are posted. Early applications get noticed more.",
                  },
                  {
                    value: "weekly",
                    title: "Weekly",
                    icon: "flame",
                    text: "Check in regularly for new opportunities every week to boost your job search.",
                  },
                  {
                    value: "never",
                    title: "Never",
                    icon: "eyeOff",
                    text: "I don’t want to receive emails about the latest career opportunities.",
                  },
                ].map((option) => (
                  <label key={option.value}>
                    <input
                      type="radio"
                      name="home-email-frequency"
                      value={option.value}
                      checked={frequency === option.value}
                      onChange={() => setFrequency(option.value)}
                    />
                    <span>
                      <Icon name={option.icon as DashboardIconName} size={27} />
                      <strong>{option.title}</strong>
                      <span>{option.text}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="home-muted">
                Preview only. These options do not subscribe you to emails.
              </p>
            </div>
          </section>
        )}

        <div className="home-bottom-grid">
          <section>
            <h2 className="home-heading">Subscription Status</h2>
            <div className="home-card home-subscription">
              <h3>
                My subscription <span className="home-chip">Preview</span>
              </h3>
              <dl>
                <div>
                  <dt>
                    <Icon name="rejected" />
                    Subscription Status
                  </dt>
                  <dd>Canceled</dd>
                </div>
                <div>
                  <dt>
                    <Icon name="calendar" />
                    Access Ends On
                  </dt>
                  <dd>{sample.accessEnds}</dd>
                </div>
              </dl>
              <PreviewButton primary>Manage Subscription</PreviewButton>
            </div>
          </section>
          <div className="home-bottom-stack">
            <section>
              <h2 className="home-heading">Refer a Friend!</h2>
              <div className="home-card home-referrals">
                <div>
                  <h3>Your Referrals:</h3>
                  <p>Earn credit when you refer a friend.</p>
                </div>
                <span className="home-referral-count">{sample.referrals}</span>
                <PreviewButton primary>Get referral link</PreviewButton>
              </div>
            </section>
            <section>
              <h2 className="home-heading">Resume Review</h2>
              <div className="home-card">
                <h3>45-min session with a recruiter</h3>
                <p>Get feedback on your resume and application strategy.</p>
                <PreviewButton primary>Book a session</PreviewButton>
              </div>
            </section>
          </div>
        </div>
        <p className="home-preview-footer">
          This Home page is a design preview. Statistics and service details are
          examples. Dashboard, Documents, Profile, and Interview Prep use your
          saved data.
        </p>
      </div>
      {goalOpen && (
        <GoalDialog
          initial={goal}
          onClose={() => setGoalOpen(false)}
          onSave={(value) => {
            setGoal(value);
            setGoalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PreviewButton({
  children,
  primary = false,
}: {
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`home-button${primary ? " is-primary" : ""}`}
      disabled
      title="Layout preview — this feature is not available yet"
    >
      {children}
      <span className="home-sr-only"> (preview)</span>
    </button>
  );
}

function ActionCard({
  icon,
  title,
  description,
  to,
}: {
  icon: DashboardIconName;
  title: string;
  description: string;
  to?: string;
}) {
  const content = (
    <>
      <span className="home-icon-tile">
        <Icon name={icon} size={24} />
      </span>
      <span>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <Icon name="arrow" />
    </>
  );
  return to ? (
    <Link className="home-action-card" to={to}>
      {content}
    </Link>
  ) : (
    <button
      className="home-action-card"
      disabled
      title="Layout preview — coming soon"
    >
      {content}
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="home-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Overview({
  icon,
  label,
  value,
}: {
  icon: DashboardIconName;
  label: string;
  value: number;
}) {
  return (
    <div>
      <dt>
        <Icon name={icon} />
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function GoalDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: number | null;
  onClose(): void;
  onSave(value: number): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(initial ?? 50));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      className="home-goal-dialog"
      ref={dialog}
      aria-labelledby="home-goal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = Number(value);
          if (Number.isInteger(next) && next > 0 && next <= 1000) onSave(next);
        }}
      >
        <h2 id="home-goal-title">Set a weekly goal</h2>
        <p>Preview only. This goal lasts while the Home page is open.</p>
        <label>
          Applications per week
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            required
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="home-dialog-actions">
          <button type="button" className="home-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="home-button is-primary">
            Apply preview goal
          </button>
        </div>
      </form>
    </dialog>
  );
}
