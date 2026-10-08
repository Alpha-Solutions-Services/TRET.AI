/** Built-in Legacy card, plate, and tag map. The database copy is editable on the truck page. */
export type PlateRecord = { plate: string; state: string | null };

export type TruckIdentity = {
  unitNumber: string;
  cards: string[];
  plates: PlateRecord[];
  tags: string[];
};

export const SEEDED_IDENTITIES: TruckIdentity[] = [
  { unitNumber: "1", cards: [], plates: [{ plate: "XPV9531", state: null }], tags: [] },
  { unitNumber: "2", cards: ["00011"], plates: [{ plate: "XRH2610", state: null }], tags: ["B7010395362"] },
  { unitNumber: "3", cards: ["00003"], plates: [{ plate: "UD12588", state: "VA" }], tags: ["B7010395372"] },
  { unitNumber: "4", cards: ["00037"], plates: [{ plate: "6OSB7382", state: null }], tags: [] },
  { unitNumber: "5", cards: ["00045"], plates: [{ plate: "5OSB8618", state: null }], tags: [] },
  { unitNumber: "6", cards: ["00094"], plates: [{ plate: "5OSB8623", state: null }], tags: ["B7010405625"] },
  { unitNumber: "7", cards: ["00029"], plates: [{ plate: "YHM2482", state: null }], tags: ["B7010406687"] },
  { unitNumber: "8", cards: ["00060"], plates: [{ plate: "5OSB8626", state: "TX" }], tags: ["B7010406665"] },
];

export function unitNumberFromRaw(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits;
}

export function cardKey(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

export function plateKey(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function findByUnit(identities: readonly TruckIdentity[], unitRaw: string): TruckIdentity | null {
  const unit = unitNumberFromRaw(unitRaw);
  if (!unit) return null;
  return identities.find((row) => row.unitNumber === unit) ?? null;
}

export function findByCard(identities: readonly TruckIdentity[], cardRaw: string): TruckIdentity | null {
  const key = cardKey(cardRaw);
  if (!key) return null;
  return identities.find((row) => row.cards.some((card) => cardKey(card) === key)) ?? null;
}

export function findByPlate(identities: readonly TruckIdentity[], plateRaw: string): TruckIdentity | null {
  const key = plateKey(plateRaw);
  if (!key || key === "NONE") return null;
  return identities.find((row) => row.plates.some((plate) => plateKey(plate.plate) === key)) ?? null;
}

export function findByTag(identities: readonly TruckIdentity[], tagRaw: string): TruckIdentity | null {
  const key = plateKey(tagRaw);
  if (!key) return null;
  return identities.find((row) => row.tags.some((tag) => plateKey(tag) === key)) ?? null;
}

export function truckLabel(unitNumber: string): string {
  return `Truck ${unitNumber}`;
}
