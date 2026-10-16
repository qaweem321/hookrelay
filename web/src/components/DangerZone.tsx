import type { ReactNode } from "react";
import { ConfirmButton } from "./buttons";
import { ErrorBox } from "./ui";

export function DangerZone({
  title,
  description,
  confirmTitle,
  confirmMessage,
  pending,
  error,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  confirmTitle: string;
  confirmMessage: ReactNode;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}) {
  return (
    <section className="mt-8 max-w-2xl rounded-xl border border-red-200 p-6 dark:border-red-900">
      <h2 className="font-medium text-red-700 dark:text-red-400">{title}</h2>
      <p className="muted mt-1 text-sm">{description}</p>
      <div className="mt-4">
        <ConfirmButton
          label={title}
          className="btn-danger"
          title={confirmTitle}
          message={confirmMessage}
          confirmLabel={title}
          pending={pending}
          onConfirm={onConfirm}
        />
        {Boolean(error) && (
          <div className="mt-3">
            <ErrorBox error={error} />
          </div>
        )}
      </div>
    </section>
  );
}
