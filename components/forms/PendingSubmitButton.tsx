"use client";

import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
};

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  disabled = false,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      aria-disabled={isDisabled}
      className={className}
      disabled={isDisabled}
      type="submit"
    >
      <span aria-live="polite">{pending ? pendingLabel : idleLabel}</span>
    </button>
  );
}
