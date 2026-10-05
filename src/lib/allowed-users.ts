export type AllowedUserRole = string;

export type AllowedUserRow = {
  email: string;
  role: AllowedUserRole;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailAllowed(
  email: string | null | undefined,
  allowedEmails: readonly string[],
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return allowedEmails.some((entry) => normalizeEmail(entry) === normalized);
}
