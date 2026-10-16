// Event-type filters on a destination: exact names, prefix wildcards ("invoice.*") or "*".
// No patterns means every event.
export function matchesEventType(patterns: readonly string[], eventType: string | null): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (eventType === null) return false;
    if (pattern.endsWith(".*")) return eventType.startsWith(pattern.slice(0, -1));
    return pattern === eventType;
  });
}
