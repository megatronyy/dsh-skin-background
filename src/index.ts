/**
 * dsh-skin-background, Host half. Owns two things: the `skin-background`
 * settings namespace (enabled / image / dim / blur, durable through the
 * user-settings document) and the `/skin-background` wallpaper routes that
 * list and serve the shipped wallpapers plus the user's drop-in directory.
 * The browser half in `src/client` consumes both.
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  BLUR_MAX, DIM_MAX, SKIN_NAMESPACE, WALLPAPER_ROUTE,
  isAcceptableImage, type SkinSettings,
} from './skin-settings.ts'
import { listWallpapers, readWallpaper, type WallpaperListing } from './wallpapers.ts'

/** Settings namespace this plugin owns (join key for the browser card). */
export const NS = settingsNamespace(SKIN_NAMESPACE)

/** Composition-layer configuration for the `skin-background` loader row. */
export interface Config extends SkinSettings {}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  image: z.string().default(''),
  dim: z.number().min(0).max(DIM_MAX).step(0.05).default(0.15),
  blur: z.number().min(0).max(BLUR_MAX).step(1).default(0),
})

/** The webServer service surface this plugin touches (structural: declared by the web profile). */
interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Wallpapers shipped inside this package (…/assets/wallpapers). */
const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'wallpapers')

/** User drop-in wallpaper directory; DSH_HOME is honored when set. */
const USER_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skin-center', 'wallpapers')

/**
 * Plugin entry: register the settings section and the wallpaper routes.
 * @param ctx - host cordis context.
 * @param config - composition-layer entry (partial; schema defaults fill the gaps).
 */
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  // Schemastery normalizes a partial entry through its defaults at call time.
  const entry = Config(config as Config)
  installSettingsSection(ctx, NS, Config, entry, {
    // Constraint the schema cannot express: refuse writes that would store
    // an image reference the browser half would refuse to apply.
    validate: (value: Config) => {
      if (value.image !== undefined && !isAcceptableImage(value.image)) {
        throw new Error('image must be empty, "preset:<id>", an http(s) URL, or a skin-background wallpaper path')
      }
    },
    // Nothing on the Host side derives from these fields; the browser half
    // reacts through its settings-scope subscription.
    setSource: () => {},
    onChange: () => {},
  })

  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => (wctx as Context & { webServer: WebServerService }).webServer.register({
      kind: 'prefix',
      path: '/skin-background',
      handler: (req: IncomingMessage, res: ServerResponse) => { void handleSkinRequest(req, res) },
    }), 'skin-background: wallpaper routes')
  })
}

/** Serve `GET /skin-background/wallpapers[/<file>]`; everything else is a 404. */
async function handleSkinRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: string, contentType: string, cacheControl = 'no-store'): void => {
    res.writeHead(status, { 'content-type': contentType, 'cache-control': cacheControl })
    res.end(body)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(405, JSON.stringify({ error: 'method not allowed' }), 'application/json')
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  if (pathname === WALLPAPER_ROUTE) {
    const listing: WallpaperListing = { wallpapers: await listWallpapers(BUILTIN_DIR, USER_DIR) }
    send(200, JSON.stringify(listing), 'application/json')
    return
  }
  const stem = `${WALLPAPER_ROUTE}/`
  if (pathname.startsWith(stem)) {
    const file = await readWallpaper(pathname.slice(stem.length), [BUILTIN_DIR, USER_DIR])
    if (file === null) {
      send(404, JSON.stringify({ error: 'wallpaper not found' }), 'application/json')
      return
    }
    res.writeHead(200, {
      'content-type': file.contentType,
      'content-length': file.body.length,
      // Wallpapers are immutable files; let the browser cache them for a day.
      'cache-control': 'public, max-age=86400',
    })
    res.end(req.method === 'HEAD' ? undefined : file.body)
    return
  }
  send(404, JSON.stringify({ error: 'not found' }), 'application/json')
}
