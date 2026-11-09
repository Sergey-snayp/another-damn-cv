import { useId } from 'react';

export type ResumeType = 'mine' | 'generated' | 'all';
export type SortBy = 'updatedAt' | 'createdAt' | 'name';
export type SortOrder = 'asc' | 'desc';

function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend>{label}</legend>
      {options.map((option) => (
        <label className="documents-radio" key={option.value}>
          <span>{option.label}</span>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
        </label>
      ))}
    </fieldset>
  );
}

export function DocumentFilters({
  type = 'all',
  sortBy,
  order,
  onType,
  onSort,
  onOrder,
  showResumeType = true,
  showCreated = true,
}: {
  type?: ResumeType;
  sortBy: SortBy;
  order: SortOrder;
  onType?(value: ResumeType): void;
  onSort(value: SortBy): void;
  onOrder(value: SortOrder): void;
  showResumeType?: boolean;
  showCreated?: boolean;
}) {
  return (
    <div className="documents-filter-menu">
      {showResumeType && onType && (
        <RadioGroup
          label="Resume type"
          value={type}
          onChange={onType}
          options={[
            { value: 'mine', label: 'My resumes' },
            { value: 'generated', label: 'Generated resumes' },
            { value: 'all', label: 'All resumes' },
          ]}
        />
      )}
      <RadioGroup
        label="Sort By"
        value={sortBy}
        onChange={onSort}
        options={[
          { value: 'updatedAt', label: 'Last Edited' },
          ...(showCreated
            ? [{ value: 'createdAt' as const, label: 'Created' }]
            : []),
          { value: 'name', label: 'Name' },
        ]}
      />
      <RadioGroup
        label="Order"
        value={order}
        onChange={onOrder}
        options={[
          { value: 'asc', label: 'Ascending' },
          { value: 'desc', label: 'Descending' },
        ]}
      />
    </div>
  );
}
