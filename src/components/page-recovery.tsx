"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Keeps a failed client render from leaving the main area empty. */
export class PageRecovery extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-field)] px-4 py-4">
        <h1 className="text-lg font-medium">This page did not finish loading.</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">Try again. The last read can be retried without leaving a blank page.</p>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </button>
      </div>
    );
  }
}
