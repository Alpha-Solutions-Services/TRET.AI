"use client";

import { SetupIncomplete } from "@/components/setup-incomplete";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <SetupIncomplete />
        <div className="fixed bottom-4 left-0 right-0 flex justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
