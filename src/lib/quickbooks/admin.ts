/** Owner is the seeded admin. A later allowlist row can use role admin. */
export function isAdminRole(role: string | null | undefined): boolean {
  const value = (role ?? "").trim().toLowerCase();
  return value === "owner" || value === "admin";
}
