// Where to go after logging in. Only same-site paths are allowed, so a crafted link like
// /login?next=https://evil.example can't send people elsewhere.
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith("/login") || value.startsWith("/setup")) return fallback;
  return value;
}

export function loginUrl(path: string): string {
  const next = safeNext(path, "");
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
