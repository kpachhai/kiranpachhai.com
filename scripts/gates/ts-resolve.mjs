// Lets plain `node` load the extensionless relative imports the content model
// uses (Vite and Astro resolve these; Node does not). Preload with --import.
// A relative specifier that names no file is tried as `<specifier>.ts`, then as a
// directory's `index.ts`, so `./foo.config` and `./data` resolve as Vite would.
import { registerHooks } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const isFile = (url) => {
  const path = fileURLToPath(url)
  return existsSync(path) && statSync(path).isFile()
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL && !isFile(new URL(specifier, context.parentURL))) {
      for (const candidate of [`${specifier}.ts`, `${specifier.replace(/\/$/, '')}/index.ts`]) {
        const url = new URL(candidate, context.parentURL)
        if (isFile(url)) return nextResolve(url.href, context)
      }
    }
    return nextResolve(specifier, context)
  },
})
