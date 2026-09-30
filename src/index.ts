/**
 * dsh-skin-background, Host half. Owns the `skin-background` loader entry:
 * the Schemastery `Config` below is what the settings domain projects into
 * the browser (the entry id doubles as the settings namespace), and the
 * `/skin-background` routes list and serve the shipped wallpapers plus the
 * user's drop-in directory. The browser half in `src/client` consumes both.
 *
 * dsh >= 0.1.7-rc.2: user edits land in the profile patch layer keyed by this
 * entry's id — there is no separate settings document to register. The entry
 * declares `auto: false` so the domain does not generate a generic page next
 * to the plugin's own "Skin" settings section.
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BLUR_MAX, WALLPAPER_ROUTE,
  type SkinSettings,
} from './skin-settings.ts'
import { listWallpapers, readWallpaper, type WallpaperListing } from './wallpapers.ts'
import { handleUpload, handleWallpaperDelete } from './upload.ts'

/** Composition-layer configuration for the `skin-background` loader row. */
export interface Config extends SkinSettings {}

// Every field is `.volatile()`: in dsh >= 0.1.7-rc.2 only volatile fields are
// projected into the settings forms (SettingsForms.describe / volatileForm)
// and only volatile paths accept form writes. Without it the namespace is
// never served and every save is refused with "Config field ... is not
// volatile". Through the loader each volatile field reaches `apply` as a live
// `Volatile<T>` reference (read with `.get()`); the host half stores nothing,
// so it never reads them.
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  image: z.string().default('').volatile(),
  transparency: z.number().min(0).max(1).step(0.05).default(0.85).volatile(),
  blur: z.number().min(0).max(BLUR_MAX).step(1).default(0).volatile(),
  windowTransparency: z.number().min(0).max(1).step(0.05).default(0).volatile(),
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

/** The settings-domain surface this plugin touches (structural: declared by dsh-base). */
interface SettingsFormsService {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void
}

/**
 * Plugin entry: keep the auto-generated settings page off (the plugin ships
 * its own "Skin" section) and register the wallpaper routes.
 * @param ctx - host cordis context.
 * @param config - composition-layer entry; visuals are applied by the browser
 *   half from the settings projection, so the host half only stores the values.
 */
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  void config
  // Suppress the schema-derived page for this entry; the entry id still serves
  // the namespace to `configForms` readers (see SettingsForms.describe).
  ctx.inject(['settings'], (child) => {
    child.effect(() => (child as Context & { settings: SettingsFormsService }).settings.configure({ auto: false }, ctx.fiber))
  })

  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => (wctx as Context & { webServer: WebServerService }).webServer.register({
      kind: 'prefix',
      path: '/skin-background',
      handler: (req: IncomingMessage, res: ServerResponse) => { void handleSkinRequest(req, res) },
    }), 'skin-background: wallpaper routes')
  })
}

/** Serve `GET /skin-background/wallpapers[/<file>]` and `POST /skin-background/upload`. */
async function handleSkinRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: string, contentType: string, cacheControl = 'no-store'): void => {
    res.writeHead(status, { 'content-type': contentType, 'cache-control': cacheControl })
    res.end(body)
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  if (req.method === 'POST' && pathname === '/skin-background/upload') {
    await handleUpload(req, res, USER_DIR)
    return
  }
  if (req.method === 'DELETE' && pathname.startsWith(`${WALLPAPER_ROUTE}/`)) {
    await handleWallpaperDelete(req, res, USER_DIR)
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(405, JSON.stringify({ error: 'method not allowed' }), 'application/json')
    return
  }
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
