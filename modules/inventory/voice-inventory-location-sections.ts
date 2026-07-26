import type { VoiceInventoryDraftItem } from "@/modules/inventory/voice-inventory-batch";

type InventoryLocation = NonNullable<VoiceInventoryDraftItem["location"]>;
type ReconciledItem = Omit<VoiceInventoryDraftItem, "client_id">;

type LocationEvidence = {
  location: InventoryLocation;
  text: string;
  kind: "section" | "explicit";
};

const locationWords: ReadonlyArray<readonly [string, InventoryLocation]> = [
  ["frigorifico", "fridge"],
  ["refrigerador", "fridge"],
  ["congelador", "freezer"],
  ["despensa", "pantry"],
  ["nevera", "fridge"],
];

const ignoredNameWords = new Set([
  "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas",
  "pechuga", "pechugas", "filete", "filetes", "pieza", "piezas",
]);

export function normalizeVoiceInventoryLocationText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES");
}

function locationForWord(word: string): InventoryLocation | null {
  return locationWords.find(([candidate]) => candidate === word)?.[1] ?? null;
}

function sectionHeaderPattern() {
  const words = locationWords.map(([word]) => word).join("|");
  // A preposition or a colon makes the location a deliberate heading rather
  // than an incidental mention (for example, "limpiar la nevera").
  return new RegExp(`(?:^|[.,;:\\n]\\s*|\\by\\s+|\\bpero\\s+)(?:(?:en|de)\\s+(?:la|el)\\s+|del\\s+)?(${words})(?:\\s+(?:tambien\\s+)?(?:tengo|hay))?\\s*:?[\\s]*`, "g");
}

function explicitProductEvidence(text: string): LocationEvidence[] {
  const words = locationWords.map(([word]) => word).join("|");
  const patterns = [
    new RegExp(`(?:^|[.,;]|\\bpero\\s+|\\by\\s+)(?:el|la|los|las)?\\s*([^.,;\\n]{1,100}?)\\s+(?:esta|estan|va|van|se\\s+guarda|se\\s+guardan)\\s+(?:en|dentro\\s+de)\\s+(?:la|el)?\\s*(${words})(?=$|[.,;:\\n])`, "g"),
    new RegExp(`(?:^|[,;]|\\by\\s+)([^,;.\\n]{1,100}?)\\s+(?:a|en)\\s+(?:la|el)\\s+(${words})(?=$|[,;.\n])`, "g"),
  ];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].flatMap((match) => {
      const location = locationForWord(match[2]);
      const product = match[1].replace(/^(?:pero|y)\s+/, "").trim();
      return location && product ? [{ location, text: product, kind: "explicit" as const }] : [];
    }));
}

/** Detects location spans before asking the model, without attempting product extraction. */
export function detectVoiceInventoryLocationEvidence(originalText: string): LocationEvidence[] {
  const text = normalizeVoiceInventoryLocationText(originalText);
  const matches = [...text.matchAll(sectionHeaderPattern())];
  const sections = matches.flatMap((match, index) => {
    const location = locationForWord(match[1]);
    if (!location || match.index === undefined) return [];
    const contentStart = match.index + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? text.length;
    const content = text.slice(contentStart, contentEnd).trim();
    return content ? [{ location, text: content, kind: "section" as const }] : [];
  });
  return [...sections, ...explicitProductEvidence(text)];
}

function nameMatchesEvidence(name: string, evidenceText: string) {
  const normalizedName = normalizeVoiceInventoryLocationText(name).replace(/[^a-z0-9ñ]+/g, " ").trim();
  const normalizedEvidence = evidenceText.replace(/[^a-z0-9ñ]+/g, " ").trim();
  if (!normalizedName || !normalizedEvidence) return false;
  if (new RegExp(`(?:^| )${normalizedName.replace(/ /g, "\\s+")}(?: |$)`).test(normalizedEvidence)) return true;

  const meaningfulTokens = normalizedName.split(" ").filter((token) => !ignoredNameWords.has(token));
  // This intentionally permits a normalized name such as "pechuga de pollo"
  // to match observed "pollo", but only via a unique, whole, meaningful word.
  return meaningfulTokens.some((token) => token.length >= 4 && new RegExp(`(?:^| )${token}(?: |$)`).test(normalizedEvidence));
}

/**
 * Reconciles recovered provider items against observed text. Explicit product
 * evidence wins over section inheritance. Conflicting or repeated evidence is
 * ambiguous and never overwrites a valid provider value.
 */
export function reconcileVoiceInventoryLocations(originalText: string, items: ReconciledItem[], detectedEvidence?: LocationEvidence[]): ReconciledItem[] {
  const evidence = detectedEvidence ?? detectVoiceInventoryLocationEvidence(originalText);
  const textAffirmsNoLocation = evidence.length === 0 && /\b(?:tengo|hay)\b/.test(normalizeVoiceInventoryLocationText(originalText));

  return items.map((item) => {
    const matches = evidence.filter((candidate) => nameMatchesEvidence(item.name, candidate.text));
    const explicitLocations = new Set(matches.filter(({ kind }) => kind === "explicit").map(({ location }) => location));
    const inheritedLocations = new Set(matches.filter(({ kind }) => kind === "section").map(({ location }) => location));
    const selected = explicitLocations.size === 1
      ? [...explicitLocations][0]
      : explicitLocations.size === 0 && inheritedLocations.size === 1
        ? [...inheritedLocations][0]
        : null;
    const location = selected ?? (textAffirmsNoLocation ? null : item.location);
    const issues = location === null
      ? [...new Set([...item.issues, "location-unconfirmed" as const])]
      : item.issues.filter((issue) => issue !== "location-unconfirmed");
    return { ...item, location, issues };
  });
}
