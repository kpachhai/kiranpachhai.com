import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const fontFile = (family: string, weight: number) =>
  readFileSync(join(process.cwd(), 'node_modules', '@fontsource', family, 'files', `${family}-latin-${weight}-normal.woff`))

const fonts = () => [
  { name: 'Bricolage Grotesque', data: fontFile('bricolage-grotesque', 800), weight: 800 as const, style: 'normal' as const },
  { name: 'Newsreader', data: fontFile('newsreader', 400), weight: 400 as const, style: 'normal' as const },
  { name: 'Martian Mono', data: fontFile('martian-mono', 400), weight: 400 as const, style: 'normal' as const },
]

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
    fonts: fonts(),
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng()
}
