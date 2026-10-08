export const FILE_IMPORT_MIGRATION_MESSAGE =
  "Fuel and toll file import is not available until the v0.0.0.29 migration is applied.";

/** Shown in the review queue when Gemini answers 503 after retries. */
export const AI_BUSY_NOTE = "AI busy, try again";

export type OpenQueueItem = {
  id: string;
  kind: string;
  reason: string;
  aiSuggested: boolean;
  unitNumber: string | null;
  loadId: string | null;
  tripId: string | null;
};
