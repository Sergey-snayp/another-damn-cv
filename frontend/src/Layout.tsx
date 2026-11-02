import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { HeaderActions, type HeaderAction } from "./components/HeaderActions";
import {
  AccountDialog,
  type AccountDialogKind,
} from "./components/AccountDialog";
import { DashboardIcon } from "./jobs/DashboardIcon";

const NAV = [
  { to: "/dashboard", label: "Dashboard", end: true },
  { to: "/documents", label: "Documents" },
  { to: "/interview-prep", label: "Interview Prep" },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<HeaderAction | null>(null);
  const [accountDialog, setAccountDialog] = useState<AccountDialogKind | null>(
    null,
  );
  const [feedback, setFeedback] = useState("");
  const accountButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        accountButton.current?.focus();
      }
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  function openAccountDialog(kind: AccountDialogKind) {
    setMenuOpen(false);
    setAccountDialog(kind);
  }

  function closeAccountDialog() {
    setAccountDialog(null);
    requestAnimationFrame(() => accountButton.current?.focus());
  }

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="Home" end>
          <img
            className="brand-logo"
            src="/brand/d-stamp-logo.png"
            alt="D! logo"
            width={40}
            height={40}
          />
        </NavLink>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? "navlink active" : "navlink"
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-account">
          <HeaderActions
            active={activeAction}
            onChange={(action) => {
              setActiveAction(action);
              if (action) setMenuOpen(false);
            }}
          />
          <div className="account">
            <button
              ref={accountButton}
              type="button"
              className="avatar"
              aria-label="Account menu"
              onClick={() => {
                setActiveAction(null);
                setMenuOpen((open) => !open);
              }}
              aria-expanded={menuOpen}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" />
              ) : (
                <span className="initials">{user?.name?.[0] ?? "?"}</span>
              )}
              <span className="who">{user?.name}</span>
              <span className="chevron">▾</span>
            </button>

            {menuOpen && (
              <>
                {/* Click anywhere to dismiss, rather than trapping the menu open. */}
                <div className="scrim" onClick={() => setMenuOpen(false)} />
                <div
                  className="menu account-menu"
                  role="group"
                  aria-label="Account options"
                >
                  <div className="menu-head">
                    <div className="menu-name">{user?.name}</div>
                    <div className="menu-email">{user?.email}</div>
                  </div>
                  <NavLink
                    to="/profile"
                    className="menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <DashboardIcon name="user" />
                    Profile
                  </NavLink>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => openAccountDialog("settings")}
                  >
                    <DashboardIcon name="settings" />
                    Settings
                  </button>
                  <div className="account-menu-divider" />
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => openAccountDialog("feedback")}
                  >
                    <DashboardIcon name="flag" />
                    Give feedback
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setActiveAction("help");
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLButtonElement>(
                            '.header-action-button[aria-label="Help"]',
                          )
                          ?.focus(),
                      );
                    }}
                  >
                    <DashboardIcon name="help" />
                    Help &amp; support
                  </button>
                  <div className="account-menu-divider" />
                  <button
                    className="menu-item danger"
                    onClick={() => void signOut()}
                  >
                    <DashboardIcon name="signOut" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
      {accountDialog && (
        <AccountDialog
          kind={accountDialog}
          feedback={feedback}
          onFeedbackChange={setFeedback}
          onClose={closeAccountDialog}
        />
      )}
    </div>
  );
}
