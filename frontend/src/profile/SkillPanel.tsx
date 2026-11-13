import { useEffect, useRef, useState } from "react";
import { DashboardIcon as Icon } from "../jobs/DashboardIcon";
import { useConfirm } from "../components/ConfirmDialog";
import { TagList } from "./TagList";
import { flattenGroups, groupSkills, type SkillGroup } from "./skillGroups";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Profile's skills in groups, one row each, as a CV writes them
 * ("Core: TypeScript, Node.js"). Each row is a chip list; its name is renamed
 * by clicking it, and its × removes the group. Typing a skill another group has
 * moves it here. "Add group" starts a new row.
 */
export function SkillGroups({
  skills,
  types,
  suggestions,
  disabled,
  onSave,
}: {
  skills: string[];
  /** Each skill's group, by its name. */
  types?: Record<string, string>;
  suggestions: string[];
  disabled: boolean;
  /** Saves the list and the groups; rejects with a message when it cannot. */
  onSave(skills: string[], skillTypes: Record<string, string>): Promise<void>;
}) {
  const confirm = useConfirm();
  /** Groups named here that have no skills yet: shown, not saved. */
  const [fresh, setFresh] = useState<string[]>([]);
  /** The new group's name while it is typed; null when not adding one. */
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const saved = groupSkills(skills, types);
  const named = saved.filter((group) => group.name);
  const groups: SkillGroup[] = [
    ...named,
    ...fresh.filter((name) => !named.some((group) => same(group.name, name))).map((name) => ({ name, skills: [] })),
    ...saved.filter((group) => !group.name),
  ];
  const grouped = groups.some((group) => group.name);

  async function save(next: SkillGroup[]) {
    const { skills: list, skillTypes } = flattenGroups(next);
    await onSave(list, skillTypes);
    // A new group is saved once it has a skill.
    setFresh((names) => names.filter((name) => !next.some((group) => same(group.name, name) && group.skills.length)));
  }

  /** One row's new list. A skill another row has moves here. */
  const changeGroup = (at: number) => (items: string[]) =>
    save(groups.map((group, index) => (index === at ? { ...group, skills: items } : { ...group, skills: group.skills.filter((skill) => !items.some((item) => same(item, skill))) })));

  async function rename(at: number, name: string) {
    const group = groups[at]!;
    if (!group.skills.length) {
      setFresh((names) => names.map((item) => (same(item, group.name) ? name : item)).filter(Boolean));
      return;
    }
    await save(groups.map((item, index) => (index === at ? { ...item, name } : item)));
  }

  async function remove(at: number) {
    const group = groups[at]!;
    if (!group.skills.length) {
      setFresh((names) => names.filter((name) => !same(name, group.name)));
      return;
    }
    const yes = await confirm({
      title: `Remove the group “${group.name || "Other"}”?`,
      body: (
        <p>
          Its {group.skills.length === 1 ? "skill" : `${group.skills.length} skills`} ({group.skills.join(", ")}) will be removed from your Profile. Your saved CVs keep their own
          copy. To keep the skills, rename the group to nothing instead.
        </p>
      ),
      action: "Remove group",
    });
    if (!yes) return;
    setError("");
    try {
      await save(groups.filter((_, index) => index !== at));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    }
  }

  function addGroup() {
    if (naming === null) return;
    const name = naming.trim();
    setNaming(null);
    if (!name || groups.some((group) => same(group.name, name))) return;
    setFresh((names) => [...names, name]);
  }

  return (
    <div className={`skill-groups${grouped ? " is-grouped" : ""}`}>
      {groups.map((group, at) => (
        <div className="skill-group" key={group.name ? `group:${group.name.toLowerCase()}` : "other"}>
          {grouped && <GroupName name={group.name} disabled={disabled} onRename={(name) => rename(at, name)} onRemove={() => void remove(at)} />}
          <TagList
            label="skill"
            items={group.skills}
            suggestions={suggestions}
            addLabel={grouped ? "Add" : "Add skill"}
            startAdding={!group.skills.length && fresh.some((name) => same(name, group.name))}
            disabled={disabled}
            onChange={changeGroup(at)}
          />
        </div>
      ))}
      {naming !== null ? (
        <div className="skill-group-new">
          <input
            className="tag-add-input"
            aria-label="New group name"
            placeholder="Group name, e.g. Core or Cloud"
            autoFocus
            maxLength={80}
            value={naming}
            onChange={(event) => setNaming(event.target.value)}
            onBlur={addGroup}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addGroup();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setNaming(null);
              }
            }}
          />
        </div>
      ) : (
        <button type="button" className="skill-group-add" disabled={disabled} onClick={() => setNaming("")}>
          <Icon name="plus" size={14} />
          Add group
        </button>
      )}
      {error && <p className="profile-error" role="alert">{error}</p>}
    </div>
  );
}

/** A group's name: click to rename (Enter saves, Esc cancels); its × removes the group. */
function GroupName({ name, disabled, onRename, onRemove }: { name: string; disabled: boolean; onRename(name: string): Promise<void>; onRemove(): void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const open = editing !== null;
  // Opened: the whole name is selected, so typing replaces it.
  useEffect(() => {
    if (open) field.current?.select();
  }, [open]);

  async function finish() {
    if (editing === null || busy) return;
    const next = editing.trim();
    if (next === name) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRename(next);
      setEditing(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (editing !== null)
    return (
      <div className="skill-group-name is-editing">
        <input
          className="tag-add-input"
          ref={field}
          aria-label={`Rename the group ${name || "Other"}`}
          placeholder="No group"
          autoFocus
          maxLength={80}
          value={editing}
          disabled={busy}
          onChange={(event) => setEditing(event.target.value)}
          onBlur={() => void finish()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void finish();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setError("");
              setEditing(null);
            }
          }}
        />
        {error && <p className="profile-error" role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="skill-group-name">
      <button type="button" className={`skill-group-label${name ? "" : " is-other"}`} disabled={disabled} title="Rename" onClick={() => setEditing(name)}>
        {name || "Other"}
      </button>
      <button type="button" className="tag-chip-x" aria-label={`Remove the group ${name || "Other"}`} title="Remove group" disabled={disabled} onClick={onRemove}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
