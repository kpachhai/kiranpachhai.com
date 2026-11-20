import type { APIRoute, GetStaticPaths } from 'astro'
import { renderOg } from '../../og/render'
import { model } from '../../model'
import { domainName, proofById } from '../../lib/site'

type Card = { title: string; subtitle: string; label?: string }

const cards: Record<string, Card> = {
  home: { title: model.hero.name, subtitle: model.hero.roleLine, label: 'Portfolio' },
  default: { title: model.hero.name, subtitle: model.hero.thesis },
  ...Object.fromEntries(
    model.caseStudies.map((study): [string, Card] => [
      study.slug,
      { title: study.title, subtitle: domainName(proofById(study.proofIds[0]).domainId), label: 'Selected work' },
    ]),
  ),
}

export const getStaticPaths = (() =>
  Object.entries(cards).map(([slug, card]) => ({ params: { slug }, props: { card } }))) satisfies GetStaticPaths

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOg((props as { card: Card }).card)
  return new Response(Buffer.from(png), { headers: { 'Content-Type': 'image/png' } })
}
