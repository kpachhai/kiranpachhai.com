// The labels the sheet, the readout and the palette print the same way: an area's two-digit number
// and a proof count. Pure, so the sheet can render them at build time too.
export const pad = (value: number) => String(value).padStart(2, '0')
export const proofCount = (count: number) => `${count} ${count === 1 ? 'proof' : 'proofs'}`
