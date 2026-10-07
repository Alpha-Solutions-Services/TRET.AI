import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-accent)]/50",
  secondary:
    "border border-[var(--color-border)] bg-white text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
  ghost: "bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)]",
  danger:
    "bg-red-700 text-white hover:bg-red-800 disabled:bg-red-700/50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant = "primary", type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "pressable inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition-[transform,background-color,box-shadow] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100",
          variantClass[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
