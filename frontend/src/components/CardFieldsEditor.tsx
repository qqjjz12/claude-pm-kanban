import { PRIORITIES, type Priority } from "@/lib/kanban";

export type FieldsDraft = {
  priority: Priority;
  dueDate: string;
  labels: string;
};

type CardFieldsEditorProps = {
  value: FieldsDraft;
  onChange: (value: FieldsDraft) => void;
  idPrefix: string;
};

const input =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-2 py-1.5 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const label =
  "block text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--gray-text)]";

export const CardFieldsEditor = ({ value, onChange, idPrefix }: CardFieldsEditorProps) => (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <label className={label}>
        Priority
        <select
          id={`${idPrefix}-priority`}
          value={value.priority}
          onChange={(event) => onChange({ ...value, priority: event.target.value as Priority })}
          className={`${input} mt-1`}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priority === "none" ? "None" : priority[0].toUpperCase() + priority.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Due date
        <input
          type="date"
          value={value.dueDate}
          onChange={(event) => onChange({ ...value, dueDate: event.target.value })}
          className={`${input} mt-1`}
        />
      </label>
    </div>
    <label className={label}>
      Labels
      <input
        value={value.labels}
        onChange={(event) => onChange({ ...value, labels: event.target.value })}
        placeholder="bug, design, ..."
        className={`${input} mt-1`}
      />
    </label>
  </div>
);
