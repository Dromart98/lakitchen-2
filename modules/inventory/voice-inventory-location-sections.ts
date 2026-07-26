import type { VoiceInventoryDraftItem, VoiceInventoryDraftIssue } from "@/modules/inventory/voice-inventory-batch";

type VoiceInventoryLocationDraft = Omit<VoiceInventoryDraftItem, "client_id" | "review_acknowledged">;
type VoiceInventoryLocation = NonNullable<VoiceInventoryLocationDraft["location"]>;

type LocationSection = {
  location: VoiceInventoryLocation;
  content: string;
};

type ExplicitLocationClause = {
  location: VoiceInventoryLocation;
  content: string;
};

export type VoiceInventoryLocationEvidence = {
  hasLocationEvidence: boolean;
  sections: LocationSection[];
  explicitClauses: ExplicitLocationClause[];
};

const LOCATION_ALIASES: Array<{ location: VoiceInventoryLocation; aliases: string[] }> = [
  { location: "fridge", aliases: ["nevera", "frigorifico", "refrigerador"] },
  { location: "freezer", aliases: ["congelador"] },
  { location: "pantry", aliases: ["despensa"] },
];

const STOP_WORDS = new Set(["de", "del", "la", "el", "las", "los", "un", "una", "y"]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stemToken(token: string) {
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function significantTokens(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .map(stemToken);
}

function candidateProductNames(name: string) {
  const normalized = normalizeText(name).trim();
  const candidates = new Set([normalized]);
  for (const prefix of ["pechuga de ", "filete de ", "lata de ", "latas de "]) {
    if (normalized.startsWith(prefix)) candidates.add(normalized.slice(prefix.length));
  }
  return [...candidates].filter(Boolean);
}

function contentMatchesProduct(content: string, name: string) {
  const normalizedContent = normalizeText(content);
  for (const candidate of candidateProductNames(name)) {
    const candidatePattern = candidate
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => escapeRegExp(stemToken(token)))
      .join("(?:[a-z0-9]*\\s+|\\s+)");
    if (candidatePattern && new RegExp(`\\b${candidatePattern}[a-z0-9]*\\b`).test(normalizedContent)) return true;
  }

  const itemTokens = significantTokens(name);
  const contentTokens = new Set(significantTokens(content));
  if (itemTokens.length === 1) return contentTokens.has(itemTokens[0]);
  return itemTokens.length > 1 && itemTokens.filter((token) => contentTokens.has(token)).length >= Math.min(2, itemTokens.length);
}

function locationForAlias(alias: string): VoiceInventoryLocation | null {
  const normalizedAlias = normalizeText(alias);
  return LOCATION_ALIASES.find(({ aliases }) => aliases.includes(normalizedAlias))?.location ?? null;
}

const LOCATION_WORDS = LOCATION_ALIASES.flatMap(({ aliases }) => aliases).join("|");
const HEADER_PATTERN = new RegExp(
  `(?:^|[.;:\\n]|,\\s*(?:y\\s+)?)(?:\\s*(?:y|pero)\\s+)?(?:en\\s+(?:la|el)\\s+|del\\s+|de\\s+la\\s+)?(${LOCATION_WORDS})\\b(?:\\s*(?:tengo|hay)\\b|\\s*:)?`,
  "g",
);
const LOCATION_MENTION_PATTERN = new RegExp(`\\b(${LOCATION_WORDS})\\b`, "g");

function findExplicitLocationClauses(normalized: string): ExplicitLocationClause[] {
  const clauses = normalized.split(/[.;\n]+/).map((part) => part.trim()).filter(Boolean);
  const result: ExplicitLocationClause[] = [];
  for (const clause of clauses) {
    LOCATION_MENTION_PATTERN.lastIndex = 0;
    for (const match of clause.matchAll(LOCATION_MENTION_PATTERN)) {
      const location = locationForAlias(match[1]);
      if (!location) continue;
      const alias = escapeRegExp(match[1]);
      const relation = new RegExp(`\\b(?:esta|va|se encuentra|lo tengo|la tengo|los tengo|las tengo)\\s+en\\s+(?:la|el)\\s+${alias}\\b`);
      if (relation.test(clause)) result.push({ location, content: clause });
    }
  }
  return result;
}

export function detectVoiceInventoryLocationEvidence(text: string): VoiceInventoryLocationEvidence {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(HEADER_PATTERN)];
  const sections: LocationSection[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const location = locationForAlias(match[1]);
    if (!location || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length && matches[index + 1].index !== undefined ? matches[index + 1].index! : normalized.length;
    sections.push({ location, content: normalized.slice(start, end) });
  }

  LOCATION_MENTION_PATTERN.lastIndex = 0;
  return {
    hasLocationEvidence: LOCATION_MENTION_PATTERN.test(normalized),
    sections,
    explicitClauses: findExplicitLocationClauses(normalized),
  };
}

function withLocationIssue(item: VoiceInventoryLocationDraft, location: VoiceInventoryLocation | null): VoiceInventoryLocationDraft {
  const issues = new Set<VoiceInventoryDraftIssue>(item.issues);
  if (location === null) issues.add("location-unconfirmed");
  else issues.delete("location-unconfirmed");
  return { ...item, location, issues: [...issues] };
}

export function reconcileVoiceInventoryDraftLocation(
  item: VoiceInventoryLocationDraft,
  evidence: VoiceInventoryLocationEvidence,
): VoiceInventoryLocationDraft {
  if (!evidence.hasLocationEvidence) return withLocationIssue(item, null);

  const explicitLocations = new Set(
    evidence.explicitClauses
      .filter((clause) => contentMatchesProduct(clause.content, item.name))
      .map((clause) => clause.location),
  );
  if (explicitLocations.size === 1) return withLocationIssue(item, [...explicitLocations][0]);
  if (explicitLocations.size > 1) return item.location ? withLocationIssue(item, item.location) : withLocationIssue(item, null);

  const sectionLocations = new Set(
    evidence.sections
      .filter((section) => contentMatchesProduct(section.content, item.name))
      .map((section) => section.location),
  );
  if (sectionLocations.size === 1) return withLocationIssue(item, [...sectionLocations][0]);
  if (sectionLocations.size > 1) return item.location ? withLocationIssue(item, item.location) : withLocationIssue(item, null);

  return item.location ? withLocationIssue(item, item.location) : withLocationIssue(item, null);
}
