export function pickFreeName(baseName: string, existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  let candidate = baseName;
  for (let suffix = 1; taken.has(candidate.toLowerCase()); suffix++) {
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
}
