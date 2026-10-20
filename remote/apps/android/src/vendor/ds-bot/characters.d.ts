export function lookOf(bot?: { id?: string; color?: string; avatar?: { shape?: string; image?: string } }): { shape: string; image?: string; color: string }
export function shapeOf(shape: string): { size: number }
export function characterMarkup(shape: string, color: string): string
export const MASK_ID: string
export const CHARACTERS: Record<string, {
  body: string
  shade: string
  light: string
  paints?: [string, string, number][]
  eyes: [number, number, number, number, number][]
}>
