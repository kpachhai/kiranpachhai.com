import { z } from 'zod'

// The summary scripts/gates/run-all.ts writes to src/data/gates.json after every gate passes.
const GatesSchema = z
  .strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    passed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  })
  .refine((gates) => gates.passed <= gates.total, { message: 'passed cannot exceed total' })

export type Gates = z.infer<typeof GatesSchema>

export function parseGates(value: unknown): Gates {
  return GatesSchema.parse(value)
}

export function gatesLine(gates: Gates): string {
  return `Passed ${gates.passed} of ${gates.total} gates on ${gates.date}`
}
