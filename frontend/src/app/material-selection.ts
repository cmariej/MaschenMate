/** A single project material applies everywhere; multiple materials use explicit inheritance. */
export function materialId(
  materials: readonly { id: string }[],
  ...selections: (string | null | undefined)[]
): string | undefined {
  return materials.length === 1 ? materials[0].id : selections.find(id => id != null) ?? undefined;
}
