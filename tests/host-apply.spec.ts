import { EventEmitter } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { isAcceptableImage, UPLOAD_MAX_BYTES } from '../src/skin-settings.ts'
import { sanitizeUploadStem, sniffImageExtension } from '../src/upload.ts'

// USER_DIR is captured from DSH_HOME when the host module is first imported;
// point it at a throwaway directory before any mount() runs.
beforeAll(async () => {
  process.env.DSH_HOME = await mkdtemp(join(tmpdir(), 'dsh-skin-upload-'))
})

interface SettingsFormsService {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void
}

interface FakeContext {
  effect(callback: () => unknown, label?: string): void
  inject(services: string[], callback: (scoped: Partial<FakeContext>) => void): void
  webServer?: { register(route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }): () => void }
  settings?: SettingsFormsService
}

interface CapturedResponse {
  status: number
  headers: Record<string, unknown>
  body: () => string
}

const importHost = async (): Promise<{ apply: (ctx: FakeContext, config?: unknown) => void, Config: (value: unknown) => Record<string, unknown> }> => {
  const host = await import('../src/index.ts')
  return host as unknown as { apply: (ctx: FakeContext, config?: unknown) => void, Config: (value: unknown) => Record<string, unknown> }
}

interface Harness {
  ctx: FakeContext
  routes: Map<string, { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }>
  configureCalls: { presentation: { auto?: boolean }; owner: unknown }[]
}

async function mount(config?: unknown): Promise<Harness> {
  const { apply } = await importHost()
  const routes = new Map<string, { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }>()
  const configureCalls: Harness['configureCalls'] = []
  const disposers: (() => void)[] = []
  const ctx: FakeContext = {
    effect(callback: () => unknown): void { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose as () => void) },
    inject(services, callback) {
      if (services.includes('settings')) {
        callback({
          effect: (callback: () => unknown) => ctx.effect(callback),
          settings: {
            configure: (presentation: { auto?: boolean }, owner?: unknown) => {
              configureCalls.push({ presentation, owner })
              return () => {}
            },
          },
        })
      }
      if (services.includes('webServer')) {
        callback({
          effect: (callback: () => unknown) => ctx.effect(callback),
          webServer: {
            register: (route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }) => {
              routes.set(`${route.kind} ${route.path}`, route)
              return () => routes.delete(`${route.kind} ${route.path}`)
            },
          },
        })
      }
    },
  }
  apply(ctx, config)
  return { ctx, routes, configureCalls }
}

async function request(
  routes: Harness['routes'],
  method: string,
  url: string,
  init: { headers?: Record<string, string>; body?: Buffer } = {},
): Promise<CapturedResponse> {
  const route = routes.get('prefix /skin-background')
  if (route === undefined) throw new Error('skin route not registered')
  const chunks: Buffer[] = []
  const response: CapturedResponse & { done: boolean } = {
    status: 0, headers: {}, done: false,
    body: () => Buffer.concat(chunks).toString('utf8'),
  }
  const res = {
    writeHead(status: number, headers?: Record<string, unknown>) {
      response.status = status
      response.headers = headers ?? {}
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) chunks.push(Buffer.from(chunk as string | Buffer))
      response.done = true
    },
  } as unknown as ServerResponse
  const req = Object.assign(new EventEmitter() as unknown as IncomingMessage, {
    method,
    url,
    headers: init.headers ?? {},
  })
  route.handler(req, res)
  if (init.body !== undefined) {
    queueMicrotask(() => {
      req.emit('data', init.body)
      req.emit('end')
    })
  }
  await vi.waitFor(() => { if (!response.done) throw new Error('response not finished') })
  return response
}

describe('host apply', () => {
  it('suppresses the auto-generated settings page and keeps the namespace served', async () => {
    const { configureCalls } = await mount()
    expect(configureCalls).toHaveLength(1)
    expect(configureCalls[0].presentation).toEqual({ auto: false })
  })

  it('rejects out-of-range numbers at the schema boundary and resolves volatile defaults', async () => {
    const { Config } = await importHost()
    expect(() => Config({ transparency: 5 })).toThrow()
    expect(() => Config({ blur: -1 })).toThrow()
    // Volatile fields resolve to live references; read their snapshots.
    const resolved = Config({}) as unknown as Record<string, { get: () => unknown }>
    expect(resolved.enabled.get()).toBe(true)
    expect(resolved.image.get()).toBe('')
    expect(resolved.transparency.get()).toBe(0.85)
    expect(resolved.blur.get()).toBe(0)
  })
})

describe('wallpaper routes', () => {
  it('lists the shipped wallpapers as JSON', async () => {
    const { routes } = await mount()
    const response = await request(routes, 'GET', '/skin-background/wallpapers')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    const listing = JSON.parse(response.body()) as { wallpapers: { id: string; url: string; source: string }[] }
    const ids = listing.wallpapers.filter(entry => entry.source === 'builtin').map(entry => entry.id)
    for (const id of ['aurora-dawn', 'dusk-drift', 'ocean-mist', 'midnight-bloom']) {
      expect(ids).toContain(id)
    }
    expect(listing.wallpapers.every(entry => entry.url.startsWith('/skin-background/wallpapers/'))).toBe(true)
  })

  it('serves a wallpaper file with its image content type', async () => {
    const { routes } = await mount()
    const response = await request(routes, 'GET', '/skin-background/wallpapers/aurora-dawn.svg')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('image/svg+xml')
    expect(response.body().startsWith('<svg')).toBe(true)
  })

  it('refuses unknown files, escapes, and non-GET methods', async () => {
    const { routes } = await mount()
    expect((await request(routes, 'GET', '/skin-background/wallpapers/missing.svg')).status).toBe(404)
    expect((await request(routes, 'GET', '/skin-background/wallpapers/..%2F..%2Fpackage.json')).status).toBe(404)
    expect((await request(routes, 'GET', '/skin-background/wallpapers/..%5C..%5Cpackage.json')).status).toBe(404)
    expect((await request(routes, 'GET', '/skin-background/other')).status).toBe(404)
    expect((await request(routes, 'POST', '/skin-background/wallpapers')).status).toBe(405)
  })
})

describe('wallpaper upload route', () => {
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  const SAME_ORIGIN = { origin: 'http://localhost:3000', host: 'localhost:3000' }

  it('stores a png upload and answers with its servable url', async () => {
    const { routes } = await mount()
    const response = await request(routes, 'POST', '/skin-background/upload?name=My%20Photo.PNG', {
      headers: { ...SAME_ORIGIN },
      body: PNG_BYTES,
    })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body()) as { url: string; filename: string }
    expect(body.filename).toMatch(/^my-photo-[0-9a-z]+\.png$/)
    expect(isAcceptableImage(body.url)).toBe(true)
    // The stored file is immediately served back with its image type.
    const served = await request(routes, 'GET', body.url)
    expect(served.status).toBe(200)
    expect(served.headers['content-type']).toBe('image/png')
  })

  it('refuses cross-origin, originless, oversized, and non-image uploads', async () => {
    const { routes } = await mount()
    const crossOrigin = await request(routes, 'POST', '/skin-background/upload?name=a.png', {
      headers: { origin: 'http://evil.example', host: 'localhost:3000' },
      body: PNG_BYTES,
    })
    expect(crossOrigin.status).toBe(403)
    const originless = await request(routes, 'POST', '/skin-background/upload?name=a.png', {
      headers: { host: 'localhost:3000' },
      body: PNG_BYTES,
    })
    expect(originless.status).toBe(403)
    const oversized = await request(routes, 'POST', '/skin-background/upload?name=a.png', {
      headers: { ...SAME_ORIGIN, 'content-length': String(UPLOAD_MAX_BYTES + 1) },
      body: PNG_BYTES,
    })
    expect(oversized.status).toBe(413)
    const notAnImage = await request(routes, 'POST', '/skin-background/upload?name=a.svg', {
      headers: { ...SAME_ORIGIN },
      body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    })
    expect(notAnImage.status).toBe(415)
  })

  it('falls back to a generic stem for unusable file names', async () => {
    const { routes } = await mount()
    const response = await request(routes, 'POST', '/skin-background/upload?name=', {
      headers: { ...SAME_ORIGIN },
      body: PNG_BYTES,
    })
    expect(response.status).toBe(200)
    const body = JSON.parse(response.body()) as { filename: string }
    expect(body.filename).toMatch(/^wallpaper-[0-9a-z]+\.png$/)
  })
})

describe('wallpaper delete route', () => {
  const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  const SAME_ORIGIN = { origin: 'http://localhost:3000', host: 'localhost:3000' }

  it('deletes an uploaded wallpaper and then no longer serves it', async () => {
    const { routes } = await mount()
    const uploaded = await request(routes, 'POST', '/skin-background/upload?name=Temporary.png', {
      headers: { ...SAME_ORIGIN },
      body: PNG_BYTES,
    })
    expect(uploaded.status).toBe(200)
    const url = (JSON.parse(uploaded.body()) as { url: string }).url
    expect((await request(routes, 'GET', url)).status).toBe(200)
    const deleted = await request(routes, 'DELETE', url, { headers: { ...SAME_ORIGIN } })
    expect(deleted.status).toBe(200)
    expect((await request(routes, 'GET', url)).status).toBe(404)
  })

  it('refuses cross-origin deletes and unknown or builtin names', async () => {
    const { routes } = await mount()
    const crossOrigin = await request(routes, 'DELETE', '/skin-background/wallpapers/x.png', {
      headers: { origin: 'http://evil.example', host: 'localhost:3000' },
    })
    expect(crossOrigin.status).toBe(403)
    const missing = await request(routes, 'DELETE', '/skin-background/wallpapers/nope.png', {
      headers: { ...SAME_ORIGIN },
    })
    expect(missing.status).toBe(404)
    // Built-ins live outside the user directory and cannot be removed.
    const builtin = await request(routes, 'DELETE', '/skin-background/wallpapers/aurora-dawn.svg', {
      headers: { ...SAME_ORIGIN },
    })
    expect(builtin.status).toBe(404)
    expect((await request(routes, 'GET', '/skin-background/wallpapers/aurora-dawn.svg')).status).toBe(200)
  })
})

describe('upload helpers', () => {
  it('sniffs accepted image types from magic numbers only', () => {
    expect(sniffImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('.png')
    expect(sniffImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('.jpg')
    expect(sniffImageExtension(Buffer.from('GIF89a......'))).toBe('.gif')
    const webp = Buffer.alloc(12)
    Buffer.from('RIFF').copy(webp, 0)
    Buffer.from('WEBP').copy(webp, 8)
    expect(sniffImageExtension(webp)).toBe('.webp')
    const avif = Buffer.alloc(12)
    Buffer.from('....ftyp').copy(avif, 0)
    Buffer.from('avif').copy(avif, 8)
    expect(sniffImageExtension(avif)).toBe('.avif')
    // SVG text and arbitrary bytes are never accepted.
    expect(sniffImageExtension(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(null)
    expect(sniffImageExtension(Buffer.from('hello'))).toBe(null)
  })

  it('reduces file names to safe stems and rejects unusable ones', () => {
    expect(sanitizeUploadStem('My Photo.PNG')).toBe('my-photo')
    expect(sanitizeUploadStem('..\\..\\evil.png')).toBe('evil')
    expect(sanitizeUploadStem('../../etc/passwd.jpg')).toBe('passwd')
    expect(sanitizeUploadStem('a.b.c.webp')).toBe('a.b.c')
    expect(sanitizeUploadStem('')).toBe(null)
    expect(sanitizeUploadStem('我的 图片.png')).toBe(null)
  })
})
