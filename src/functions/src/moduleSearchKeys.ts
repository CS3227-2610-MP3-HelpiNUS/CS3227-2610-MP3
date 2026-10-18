import { moduleSchema } from '@helpinus/shared'

export function normalizeModuleQuery(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

export function activeSearchPrefixes(module: unknown): string[] {
  const parsed = moduleSchema.parse(module)
  if (!parsed.active) return []
  const tokens = new Set<string>()
  for (const field of [parsed.code, parsed.title]) {
    const normalized = normalizeModuleQuery(field)
    for (let index = 1; index <= Math.min(normalized.length, 160); index += 1) {
      tokens.add(normalized.slice(0, index))
    }
  }
  return [...tokens]
}
