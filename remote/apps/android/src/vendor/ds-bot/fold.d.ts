export const FOLD_AT: { chars: number; lines: number }
export function foldPreview(text: string, limit?: { chars: number; lines: number }, markdown?: boolean): string | null
export function stripLongNote(text: string): string
