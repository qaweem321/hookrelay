import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// Disabled with a "Saving..." label while the request runs, so a double click can't submit twice.
export function SubmitButton({
  pending,
  children,
  pendingLabel = "Saving...",
  className = "btn-primary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; pendingLabel?: string }) {
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      {...rest}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

export function ActionButton({
  pending,
  children,
  pendingLabel = "Working...",
  className = "btn-secondary",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pending: boolean; pendingLabel?: string }) {
  return (
    <button
      type="button"
      className={className}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      {...rest}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

// Destructive actions ask "Are you sure?" in a modal first. Escape or Cancel closes it.
export function ConfirmButton({
  label,
  title,
  message,
  confirmLabel,
  onConfirm,
  pending,
  className = "btn-secondary",
}: {
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    // Close once the action finishes.
    if (wasPending.current && !pending) setOpen(false);
    wasPending.current = pending;
  }, [pending]);
  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !pending && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="card w-full max-w-md p-6"
          >
            <h2 id="confirm-title" className="text-lg font-semibold">
              {title}
            </h2>
            <div className="muted mt-2 text-sm">{message}</div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                ref={cancel}
                type="button"
                className="btn-secondary"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <ActionButton className="btn-danger" pending={pending} onClick={onConfirm}>
                {confirmLabel}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary shrink-0"
      onClick={async () => {
        await navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
