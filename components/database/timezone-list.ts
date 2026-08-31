export interface TimezoneOption {
  city: string; // last path segment, underscores → spaces, e.g. "Addis Ababa"
  offsetLabel: string; // "GMT+05:30", "GMT"
  value: string; // IANA zone, e.g. "Africa/Abidjan"
}

function offsetLabelFor(zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date());
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
}

let cached: TimezoneOption[] | null = null;

// Built once (module-level cache) — Intl.supportedValuesOf('timeZone') and the
// offset formatting below are pure and don't change within a session.
export function listTimezones(): TimezoneOption[] {
  if (cached) {
    return cached;
  }
  const zones = Intl.supportedValuesOf("timeZone");
  cached = zones
    .map((value) => ({
      value,
      city: value.split("/").pop()!.replaceAll("_", " "),
      offsetLabel: offsetLabelFor(value),
    }))
    .sort((a, b) => a.city.localeCompare(b.city));
  return cached;
}

export function currentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
