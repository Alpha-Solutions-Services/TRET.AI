export function routeGuidance(pathname: string): string {
  if (pathname === "/") {
    return "Overview reads each truck Google Sheet for this Monday to Sunday week. If money is blank, share that sheet with the service account.";
  }
  if (pathname.startsWith("/ins-outs")) {
    return "Ins are the load ledger Rate. Outs are Mgmt Expenses for this week. Share a private sheet with the service account.";
  }
  if (pathname.startsWith("/trucks")) {
    return "Paste each truck Google Sheet link. Share the sheet with the service account as a viewer.";
  }
  if (pathname.startsWith("/settings")) {
    return "CSV upload works now. Google Sheet Load Ledger can promote loads. Vektor MCP is available but filters are broken.";
  }
  if (pathname.startsWith("/imports")) {
    return "Import loads from CSV or the Google Sheet. Vektor MCP stays off until filters work.";
  }
  if (pathname.startsWith("/issues")) {
    return "Open issues for this week, including sheet loads whose rate does not match.";
  }
  if (pathname.startsWith("/statements")) {
    return "Statements use delivery date for the Monday to Sunday week. Close locks the week. There is no reopen.";
  }
  if (pathname.startsWith("/loads")) {
    return "Loads come from CSV, the sheet, or Vektor. Ins and Outs still read the Google Sheet.";
  }
  if (pathname.startsWith("/fuel") || pathname.startsWith("/tolls")) {
    return "Fuel and tolls import from Vektor or CSV. They are not the sheet Ins and Outs.";
  }
  if (pathname.startsWith("/operating-expenses")) {
    return "These are the management company costs. They are not the truck sheet outs.";
  }
  if (pathname.startsWith("/health")) {
    return "Health shows the app version, the database, and whether the Google service account is set. No secrets are shown.";
  }
  return "Share each truck Google Sheet with the service account so Overview can show Ins and Outs.";
}

export function sheetPageGuidance(
  rows: Array<{ readable: boolean; note: string | null }>,
  error: string | null,
): string {
  if (error) return `Ins and Outs could not be loaded. ${error}`;
  if (rows.length === 0) return "No active trucks. Add one and paste its Google Sheet link.";
  const failed = rows.filter((row) => !row.readable);
  if (failed.length === 0) {
    return "Sheets were read for this week. Amounts come from the load ledger and Mgmt Expenses.";
  }
  const sample = failed.find((row) => row.note)?.note ?? "A sheet could not be read.";
  if (failed.length === rows.length) return `No sheet money this week. ${sample}`;
  return `${failed.length} of ${rows.length} trucks were not read. ${sample}`;
}
