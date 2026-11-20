// Link gate: linkinator crawls dist/ from a local server and checks every link, external ones
// included. Links to this site's own domain (canonical and og:image URLs) are rewritten to the local
// server so they test this build rather than whatever is deployed. LinkedIn, X/Twitter and YouTube
// block automated clients, so their links are excluded and listed in the output.
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { LinkChecker, LinkState } from 'linkinator'

export const EXCLUDED_HOSTS = ['linkedin.com', 'twitter.com', 'x.com', 'youtube.com']

const hostPattern = (host: string) => `^https?://([a-z0-9-]+\\.)*${host.replace(/\./g, '\\.')}(?=[/:?#]|$)`

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address ? done(address.port) : fail(new Error('no port'))))
    })
  })
}

export async function main(dist = 'dist'): Promise<number> {
  const port = await freePort()
  const result = await new LinkChecker().check({
    path: dist,
    port,
    recurse: true,
    checkCss: true,
    concurrency: 10,
    timeout: 20_000,
    retry: true,
    retryErrors: true,
    retryErrorsCount: 3,
    linksToSkip: EXCLUDED_HOSTS.map(hostPattern),
    urlRewriteExpressions: [{ pattern: /^https:\/\/(?:www\.)?kiranpachhai\.com\//, replacement: `http://127.0.0.1:${port}/` }],
  })
  const broken = result.links.filter((link) => link.state === LinkState.BROKEN)
  const skipped = [...new Set(result.links.filter((link) => link.state === LinkState.SKIPPED && /^https?:/.test(link.url)).map((link) => link.url))]
  const checked = result.links.filter((link) => link.state === LinkState.OK).length
  console.log(`Checked ${checked} links; ${broken.length} broken.`)
  console.log(`Excluded hosts (block automated clients): ${EXCLUDED_HOSTS.join(', ')}`)
  for (const url of skipped) console.log(`SKIPPED ${url}`)
  for (const link of broken) console.log(`BROKEN ${link.status ?? '-'} ${link.url} (on ${link.parent})`)
  return broken.length > 0 ? 1 : 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv[2]))
}
