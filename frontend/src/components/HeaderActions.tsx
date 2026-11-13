import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardIcon, type DashboardIconName } from "../jobs/DashboardIcon";
import { onExtensionDetected, isExtensionInstalled } from "../extensionBridge";
import { Popover } from "./Popover";
import "./header-actions.css";

export type HeaderAction = "extension" | "updates" | "help" | "notifications";

const ACTIONS: { id: HeaderAction; label: string; icon: DashboardIconName }[] =
  [
    { id: "extension", label: "Browser extension", icon: "extension" },
    { id: "updates", label: "What’s new", icon: "announcement" },
    { id: "help", label: "Help", icon: "help" },
    { id: "notifications", label: "Notifications", icon: "bell" },
  ];

export function HeaderActions({
  active,
  onChange,
}: {
  active: HeaderAction | null;
  onChange(action: HeaderAction | null): void;
}) {
  const [installed, setInstalled] = useState(isExtensionInstalled);
  useEffect(() => {
    if (active === "extension") return onExtensionDetected(setInstalled);
  }, [active]);

  return (
    <div className="header-actions" role="group" aria-label="Quick tools">
      {ACTIONS.map((action) => (
        <Popover
          key={action.id}
          portal
          open={active === action.id}
          onToggle={() => onChange(active === action.id ? null : action.id)}
          onClose={() => onChange(null)}
          label={action.label}
          triggerClassName="header-action-button"
          panelClassName="header-action-panel"
          trigger={
            <span title={action.label}>
              <DashboardIcon name={action.icon} size={20} />
            </span>
          }
        >
          {action.id === "extension" && (
            <>
              <h2>Browser extension</h2>
              <p className={installed ? "header-action-success" : ""}>
                {installed ? "Extension connected" : "Extension not detected"}
              </p>
              <p>
                Use the extension to fill application forms and save jobs to
                your Dashboard.
              </p>
              {!installed && (
                <p>
                  For local use, load the project’s <code>extension/</code>{" "}
                  folder through Chrome’s <strong>Load unpacked</strong> option.
                </p>
              )}
              <Link to="/profile" onClick={() => onChange(null)}>
                Open profile and extension settings{" "}
                <DashboardIcon name="arrow" size={16} />
              </Link>
            </>
          )}
          {action.id === "updates" && (
            <>
              <h2>What’s new</h2>
              <ul>
                <li>
                  <strong>A new Home page</strong>
                  <span>
                    Click the logo to see the statistics layout preview.
                  </span>
                </li>
                <li>
                  <strong>Your brand colors</strong>
                  <span>The app now uses the acid-yellow palette.</span>
                </li>
                <li>
                  <strong>Interview preparation</strong>
                  <span>
                    Keep notes, interview dates, and your application CV
                    together.
                  </span>
                </li>
              </ul>
              <Link to="/" onClick={() => onChange(null)}>
                Open Home <DashboardIcon name="arrow" size={16} />
              </Link>
            </>
          )}
          {action.id === "help" && (
            <>
              <h2>How can we help?</h2>
              <div className="header-help-links">
                <Link to="/dashboard" onClick={() => onChange(null)}>
                  <strong>Track applications</strong>
                  <span>Add jobs and update their status.</span>
                </Link>
                <Link to="/documents" onClick={() => onChange(null)}>
                  <strong>Manage documents</strong>
                  <span>Upload, edit, and tailor your CV.</span>
                </Link>
                <Link to="/interview-prep" onClick={() => onChange(null)}>
                  <strong>Prepare for an interview</strong>
                  <span>Set a date and collect your notes.</span>
                </Link>
              </div>
            </>
          )}
          {action.id === "notifications" && (
            <>
              <h2>Notifications</h2>
              <div className="header-notification-empty">
                <DashboardIcon name="bell" size={28} />
                <strong>Notifications are coming soon</strong>
                <p>You can check your interview dates and preparation now.</p>
              </div>
              <Link to="/interview-prep" onClick={() => onChange(null)}>
                Open Interview Prep <DashboardIcon name="arrow" size={16} />
              </Link>
            </>
          )}
        </Popover>
      ))}
    </div>
  );
}
