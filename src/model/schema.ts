import { z } from 'zod'

export const DOMAIN_IDS = ['protocol', 'wallets', 'agents', 'explainers', 'data', 'chains'] as const
export const METHOD_IDS = ['A', 'B', 'C', 'D', 'E'] as const
export const MODE_IDS = ['build', 'architect', 'research', 'teach', 'operate'] as const

const httpsUrl = z.string().startsWith('https://')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const text = z.string().min(1)

export const DomainIdSchema = z.enum(DOMAIN_IDS)
export const MethodIdSchema = z.enum(METHOD_IDS)
export const ModeIdSchema = z.enum(MODE_IDS)

export const SourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), url: httpsUrl }),
  z.strictObject({ kind: z.literal('linkedin') }),
  z.strictObject({ kind: z.literal('owner'), date: isoDate }),
])

export const ProofSchema = z
  .strictObject({
    id: text,
    label: text,
    detail: text,
    href: httpsUrl.optional(),
    domainId: DomainIdSchema,
    methods: z.array(MethodIdSchema),
    source: SourceSchema,
    private: z.boolean(),
  })
  .refine((proof) => !(proof.private && proof.href !== undefined), {
    message: 'a private proof has no public href',
  })

export const UpstreamSchema = z.strictObject({
  label: text,
  href: httpsUrl,
  status: z.enum(['merged', 'open', 'review', 'discussion', 'commits']),
  domainId: DomainIdSchema,
})

export const DomainSchema = z.strictObject({
  id: DomainIdSchema,
  name: text,
  upstream: z.array(UpstreamSchema),
  source: SourceSchema,
})

export const MethodSchema = z.strictObject({
  id: MethodIdSchema,
  name: text,
  summary: text.optional(),
  source: SourceSchema,
})

export const MaterialSchema = z.strictObject({
  id: text,
  band: z.enum(['language', 'tool', 'discipline']),
  name: text,
  usedIn: z.array(text),
  source: SourceSchema,
})

export const ModeSchema = z.strictObject({ id: ModeIdSchema, name: text })

export const RangeCellSchema = z.strictObject({
  domainId: DomainIdSchema,
  mode: ModeIdSchema,
  proofIds: z.array(text),
})

export const RoleSchema = z.strictObject({
  title: text,
  years: text,
  proofIds: z.array(text),
  source: SourceSchema,
})

export const TimelineEntrySchema = z.strictObject({
  kind: z.enum(['role', 'education']),
  title: text,
  years: text,
  source: SourceSchema,
})

export const TalkSchema = z.strictObject({
  id: text,
  title: text,
  kind: z.enum(['talk', 'workshop', 'session', 'course', 'tutorials']),
  detail: text.optional(),
  date: isoDate.optional(),
  href: httpsUrl.optional(),
  source: SourceSchema,
})

export const SourcedTextSchema = z.strictObject({ text, source: SourceSchema })

export const CaseStudySchema = z.strictObject({
  slug: text,
  title: text,
  proofIds: z.array(text).min(1),
  source: SourceSchema,
  problem: SourcedTextSchema,
  approach: SourcedTextSchema,
  methods: SourcedTextSchema,
  outcome: SourcedTextSchema,
})

export const ModelSchema = z.strictObject({
  hero: z.strictObject({ name: text, roleLine: text, thesis: text }),
  domains: z.array(DomainSchema),
  proofs: z.array(ProofSchema),
  methods: z.array(MethodSchema),
  materials: z.array(MaterialSchema),
  modes: z.array(ModeSchema),
  range: z.array(RangeCellSchema),
  roles: z.array(RoleSchema),
  timeline: z.array(TimelineEntrySchema),
  talks: z.array(TalkSchema),
  caseStudies: z.array(CaseStudySchema),
})

export type DomainId = z.infer<typeof DomainIdSchema>
export type MethodId = z.infer<typeof MethodIdSchema>
export type ModeId = z.infer<typeof ModeIdSchema>
export type Source = z.infer<typeof SourceSchema>
export type Proof = z.infer<typeof ProofSchema>
export type Upstream = z.infer<typeof UpstreamSchema>
export type Domain = z.infer<typeof DomainSchema>
export type Method = z.infer<typeof MethodSchema>
export type Material = z.infer<typeof MaterialSchema>
export type RangeCell = z.infer<typeof RangeCellSchema>
export type Role = z.infer<typeof RoleSchema>
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>
export type Talk = z.infer<typeof TalkSchema>
export type SourcedText = z.infer<typeof SourcedTextSchema>
export type CaseStudy = z.infer<typeof CaseStudySchema>
export type Model = z.infer<typeof ModelSchema>
