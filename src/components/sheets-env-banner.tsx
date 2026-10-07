export function SheetsEnvBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  const verb = missing.length === 1 ? "is" : "are";
  return (
    <p
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
    >
      Google Sheets service account is not set. {missing.join(" and ")} {verb} missing on the server.
      Ins and Outs use each truck sheet as the source. Set both variables, then share each sheet with that
      account as a viewer.
    </p>
  );
}
