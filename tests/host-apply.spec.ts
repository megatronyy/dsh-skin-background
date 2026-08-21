import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'

// Mocked with a faithful stand-in for the real installer: same interaction
// shape (ctx.inject(['settings']), scope registration, hooks). The real
// integration is exercised on the live instance.
vi.mock('@deepseek-ai/dsh-settings', () => ({
  settingsNamespace: (value: string) => value,
  installSettingsSection: (
    ctx: FakeContext,
    ns: string,
    schema: unknown,
    entry: unknown,
    hooks: {
      validate?: (value: Record<string, unknown>) => void
      setSource: () => void
      onChange: () => void
    },
  ) => {
    ctx.inject(['settings'], (sctx) => {
      sctx.settings?.register(ns, schema, { base: entry, ...hooks.validate === undefined ? {} : { validate: hooks.validate } })
      hooks.setSource()
      sctx.effect?.((): (() => void) => () => {})
      hooks.onChange()
    })
  },
}))

interface SettingsService {
  register(ns: string, schema: unknown, options: {
    base: unknown
    validate?: (value: Record<string, unknown>) => void
  }): { get: () => unknown; watch: (callback: () => void) => () => void }
}

interface FakeContext {
  effect(callback: () => unknown, label?: string): void
  inject(services: string[], callback: (scoped: Partial<FakeContext>) => void): void
  webServer?: { register(route: { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }): () => void }
  settings?: SettingsService
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
  registrations: { ns: string; schema: unknown; options: { base: unknown; validate?: (value: Record<string, unknown>) => void } }[]
}

async function mount(config?: unknown): Promise<Harness> {
  const { apply } = await importHost()
  const routes = new Map<string, { kind: string; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }>()
  const registrations: Harness['registrations'] = []
  const disposers: (() => void)[] = []
  const ctx: FakeContext = {
    effect(callback: () => unknown): void { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose as () => void) },
    inject(services, callback) {
      if (services.includes('settings')) {
        callback({
          effect: (callback: () => unknown) => ctx.effect(callback),
          settings: {
            register: (ns: string, schema: unknown, options: { base: unknown; validate?: (value: Record<string, unknown>) => void }) => {
              registrations.push({ ns, schema, options })
              return { get: () => options.base, watch: () => () => {} }
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
  return { ctx, routes, registrations }
}

async function request(routes: Harness['routes'], method: string, url: string): Promise<CapturedResponse> {
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
  route.handler({ method, url } as unknown as IncomingMessage, res)
  await vi.waitFor(() => { if (!response.done) throw new Error('response not finished') })
  return response
}

describe('host apply', () => {
  it('registers the settings namespace with schema defaults and a write validator', async () => {
    const { registrations } = await mount()
    expect(registrations).toHaveLength(1)
    expect(registrations[0].ns).toBe('skin-background')
    expect(registrations[0].options.base).toEqual({ enabled: true, image: '', dim: 0.15, blur: 0 })
    const validate = registrations[0].options.validate
    expect(validate).toBeTypeOf('function')
    expect(() => validate?.({ image: 'javascript:alert(1)' })).toThrow()
    expect(() => validate?.({ image: 'preset:aurora-dawn' })).not.toThrow()
    expect(() => validate?.({ image: 'https://example.com/a.jpg' })).not.toThrow()
  })

  it('normalizes explicit composition config through the schema', async () => {
    const { registrations } = await mount({ enabled: false, dim: 0.6 })
    expect(registrations[0].options.base).toEqual({ enabled: false, image: '', dim: 0.6, blur: 0 })
  })

  it('rejects out-of-range numbers at the schema boundary', async () => {
    const { Config } = await importHost()
    expect(() => Config({ dim: 5 })).toThrow()
    expect(() => Config({ blur: -1 })).toThrow()
    expect(Config({})).toEqual({ enabled: true, image: '', dim: 0.15, blur: 0 })
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
