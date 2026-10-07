"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  disconnectVektorAction,
  setImportSourceAction,
  testVektorConnectionAction,
  type getImportSourceSettings,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { CopyableError } from "@/components/copyable-error";
import { SheetsEnvBanner } from "@/components/sheets-env-banner";
import type { ImportSourceId } from "@/lib/vektor/adapters";

type Settings = Awaited<ReturnType<typeof getImportSourceSettings>>;

const NOTICES: Record<string, string> = {
  connected:
    "Vektor sign-in finished. Status is Connected. Run Test connection, then choose Vektor MCP and save.",
  needs_key:
    "Set VEKTOR_TOKEN_ENCRYPTION_KEY on the server (Vercel and local). Then click Connect Vektor again.",
  needs_migration:
    "Apply supabase/migrations/20261007120000_vektor_mcp_oauth.sql in the Supabase SQL editor. Then click Connect Vektor again.",
  denied: "Vektor did not finish sign-in. Click Connect Vektor to try again.",
  expired: "That sign-in session expired. Click Connect Vektor again.",
  failed: "Vektor sign-in could not be completed. Click Connect Vektor again.",
};

export function SettingsClient({
  initial,
  notice,
  sheetEnvMissing,
  sheetHealthSummary,
  sheetHealthDetail,
}: {
  initial: Settings;
  notice?: string | null;
  sheetEnvMissing: string[];
  sheetHealthSummary: string;
  sheetHealthDetail: string | null;
}) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ImportSourceId | "">(initial.selected ?? "");
  const noticeText = notice ? NOTICES[notice] : null;
  const connected = initial.vektor.status === "connected";

  function onSave() {
    startTransition(async () => {
      const result = await setImportSourceAction(selected);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Import source saved", "success");
      router.refresh();
    });
  }

  function onTest() {
    startTransition(async () => {
      const result = await testVektorConnectionAction();
      if (!result.ok) {
        toast(result.error, "error");
        router.refresh();
        return;
      }
      toast("Test connection passed. You can choose Vektor MCP.", "success");
      router.refresh();
    });
  }

  function onDisconnect() {
    startTransition(async () => {
      const ok = await confirm({
        title: "Disconnect Vektor",
        message: "This removes the saved Vektor sign-in from the server. Loads already imported stay.",
        confirmLabel: "Disconnect",
        danger: true,
      });
      if (!ok) return;
      const result = await disconnectVektorAction();
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast("Vektor disconnected", "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Use each truck Google Sheet for Ins and Outs. For loads, choose CSV or Google Sheet Load Ledger
          until Vektor REST keys arrive. Vektor MCP stays available and is currently broken on filters proto.
          Switching sources never deletes loads or history.
        </p>
      </div>

      <SheetsEnvBanner missing={sheetEnvMissing} />

      <section className="material rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm">
        <h2 className="font-medium text-[var(--color-fg)]">Sheet account</h2>
        <p className="mt-1 text-[var(--color-fg-muted)]">{sheetHealthSummary}</p>
        {sheetHealthDetail ? (
          <div className="mt-2">
            <CopyableError
              headline="Google private key on the server is the wrong format"
              detail={sheetHealthDetail}
            />
          </div>
        ) : null}
      </section>

      {noticeText ? (
        <p className="rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-sm" role="status">
          {noticeText}
        </p>
      ) : null}

      <section className="material space-y-3 rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Vektor</h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Status: {connected ? "Connected" : "Needs sign-in"}
              {initial.vektor.verified ? " · Test connection passed" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/vektor/oauth/start"
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--color-accent)] px-4 text-sm font-medium text-white no-underline hover:bg-[var(--color-accent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Connect Vektor
            </a>
            <Button variant="secondary" disabled={pending || !connected} onClick={onTest}>
              {pending ? "Working…" : "Test connection"}
            </Button>
            <Button variant="danger" disabled={pending || !connected} onClick={onDisconnect}>
              Disconnect
            </Button>
          </div>
        </div>
        {!initial.vektor.migrationReady ? (
          <p className="text-sm text-[var(--color-fg-muted)]">
            Token storage is not in the database yet. Apply migration 20261007120000, set VEKTOR_TOKEN_ENCRYPTION_KEY, then click Connect Vektor.
          </p>
        ) : null}
      </section>

      <fieldset className="material space-y-3 rounded-xl border border-[var(--color-border)] p-4">
        <legend className="px-1 text-sm font-medium">Import source</legend>
        <p className="text-sm text-[var(--color-fg-muted)]">
          CSV upload is the working file path. Google Sheet Load Ledger promotes sheet rows into loads for the
          dates you choose and does not replace the Ins and Outs read. REST API turns on when
          VEKTOR_API_BASE_URL and VEKTOR_API_TOKEN are set. The list path is still open. MCP is kept for later
          and is currently broken on filters proto.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="importSource"
            checked={selected === ""}
            onChange={() => setSelected("")}
          />
          <span>
            <span className="font-medium">None</span>
            <span className="block text-[var(--color-fg-muted)]">
              Import now stays disabled until a configured source is selected.
            </span>
          </span>
        </label>
        {initial.adapters.map((adapter) => (
          <label
            key={adapter.id}
            className={`flex items-start gap-2 text-sm ${adapter.selectable ? "" : "opacity-70"}`}
          >
            <input
              type="radio"
              name="importSource"
              disabled={!adapter.selectable}
              checked={selected === adapter.id}
              onChange={() => setSelected(adapter.id)}
            />
            <span>
              <span className="font-medium">{adapter.label}</span>
              <span className="block text-[var(--color-fg-muted)]">{adapter.message}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className="material space-y-2 rounded-xl border border-[var(--color-border)] p-4">
        <h2 className="text-sm font-medium">Truck Google Sheets</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Paste each truck link on Trucks. Overview reads that sheet for the selected week. Ins are the load
          ledger Rate. Outs are Mgmt Expenses: Vektor Fee, Sintra AI, Quickbooks, Job Post, Accountant Salary,
          MVR, Drug Test, and Spare Expense 1 through 5. Share the sheet so anyone with the link can view, or
          share it with the Google service account from the setup guide. The import does not write to the sheet.
        </p>
      </section>

      <Button disabled={pending} onClick={onSave}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
