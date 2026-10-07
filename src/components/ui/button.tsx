import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-accent)]/50",
  secondary:
    "border border-[var(--color-border)] bg-[var(--color-field)] text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
  ghost: "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
  danger:
    "bg-[var(--color-danger-fill)] text-white hover:brightness-95 disabled:opacity-60",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "primary", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "pressable inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100",
          variantClass[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
