export function countContentChars(input: string): number {
  return Array.from(stripByteOrderMark(input).normalize('NFC')).length
}

export const countChars = countContentChars

function stripByteOrderMark(input: string): string {
  return input.startsWith('\uFEFF') ? input.slice(1) : input
}
