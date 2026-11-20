import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

// Mirrors the light tokens in src/styles/tokens.css; satori cannot read CSS variables.
const PAPER = '#F2F3EF'
const INK = '#141A22'
const MUTED = '#535A62'
const ACCENT = '#1C39D4'

// satori reads TTF, OTF and WOFF but not WOFF2, so it loads the static Fontsource woff files.
// Each package is found by Node's own resolution from this module, so the build's working
// directory does not matter.
const resolvePackage = createRequire(import.meta.url).resolve
const fontFile = (family: string, weight: number) =>
  readFileSync(join(dirname(resolvePackage(`@fontsource/${family}/package.json`)), 'files', `${family}-latin-${weight}-normal.woff`))

type FontOptions = NonNullable<Parameters<typeof satori>[1]>['fonts']
let loaded: FontOptions | null = null

// Read once per build, however many cards are rendered.
export function ogFonts(): FontOptions {
  loaded ??= [
    { name: 'Bricolage Grotesque', data: fontFile('bricolage-grotesque', 800), weight: 800, style: 'normal' },
    { name: 'Newsreader', data: fontFile('newsreader', 400), weight: 400, style: 'normal' },
    { name: 'Martian Mono', data: fontFile('martian-mono', 400), weight: 400, style: 'normal' },
  ]
  return loaded
}

type OgInput = { title: string; subtitle: string; label: string }

function layout({ title, subtitle, label }: OgInput) {
  const text = (content: string, style: Record<string, string | number>) => ({
    type: 'div',
    props: { style: { display: 'flex', ...style }, children: content },
  })
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: OG_WIDTH,
        height: OG_HEIGHT,
        boxSizing: 'border-box',
        padding: '64px 72px',
        background: PAPER,
        borderLeft: `16px solid ${ACCENT}`,
      },
      children: [
        text(label, { fontFamily: 'Martian Mono', fontSize: 26, color: ACCENT, letterSpacing: 2 }),
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column' },
            children: [
              text(title, { fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: 96, lineHeight: 1, color: INK, marginBottom: 28 }),
              text(subtitle, { fontFamily: 'Newsreader', fontSize: 36, lineHeight: 1.3, color: MUTED }),
            ],
          },
        },
        text('kiranpachhai.com', { fontFamily: 'Martian Mono', fontSize: 22, color: MUTED }),
      ],
    },
  }
}

export async function renderOg(input: { title: string; subtitle: string; label?: string }): Promise<Uint8Array> {
  const svg = await satori(layout({ label: 'Kiran Pachhai', ...input }) as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: ogFonts(),
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng()
}
