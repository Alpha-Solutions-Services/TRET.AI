import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "warn" | "danger" | "vivid" | "vividAlt";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "btn-glow bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-accent)] disabled:text-[var(--color-on-accent)] disabled:opacity-100",
  secondary:
    "border border-[var(--color-fg)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)] disabled:border-[var(--color-fg)] disabled:text-[var(--color-fg)] disabled:opacity-100",
  ghost: "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)] disabled:opacity-60",
  warn:
    "bg-[var(--color-warn-bg)] text-[var(--color-warn-fg)] hover:brightness-95 disabled:opacity-100",
  danger:
    "bg-[var(--color-danger-fill)] text-[var(--color-on-danger)] hover:brightness-95 disabled:opacity-100",
  vivid:
    "border border-transparent bg-[#7eb6ff] text-[#041018] shadow-[0_0_18px_color-mix(in_srgb,#7eb6ff_55%,transparent)] hover:bg-[#a9cdff] disabled:bg-[#7eb6ff] disabled:text-[#041018] disabled:opacity-100",
  vividAlt:
    "border border-transparent bg-[#c084fc] text-[#140818] shadow-[0_0_18px_color-mix(in_srgb,#c084fc_55%,transparent)] hover:bg-[#d7b4fd] disabled:bg-[#c084fc] disabled:text-[#140818] disabled:opacity-100",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "primary", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "pressable inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed motion-reduce:transition-none motion-reduce:active:scale-100",
          variantClass[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
