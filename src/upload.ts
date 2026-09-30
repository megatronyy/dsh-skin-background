/**
 * Local-image upload for the Host half: `POST /skin-background/upload?name=<file>`.
 * The request body is the raw image bytes. Defense in depth, because the
 * plugin route layer is raw node:http with no session middleware:
 *
 * 1. Same-origin gate — browsers always attach `Origin` to POST requests, so
 *    requiring it to match the request `Host` blocks cross-site CSRF writes
 *    (a hostile page POSTing to `http://127.0.0.1:<port>/…` sends its own
 *    origin and is refused). Non-browser clients must send matching headers.
 * 2. Size cap — refused up front via `content-length` and again while reading.
 * 3. Content sniffing — the stored extension comes from magic-number
 *    inspection, never from the client; SVG is deliberately excluded because
 *    an image/svg file can carry scripts.
 * 4. Filename sanitization — only the stem survives, reduced to a safe
 *    charset; the stored name gets a timestamp suffix so re-uploads never
 *    overwrite (served wallpapers use `cache-control: max-age=86400`).
 */
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { WALLPAPER_ROUTE, UPLOAD_MAX_BYTES } from './skin-settings.ts'
import { isWallpaperFilename } from './wallpapers.ts'

/** Image types accepted for upload (no `.svg`, no `.jpeg` — sniffed, see below). */
export type UploadExtension = '.png' | '.jpg' | '.webp' | '.avif' | '.gif'

function asciiAt(bytes: Buffer, offset: number, text: string): boolean {
  return bytes.subarray(offset, offset + text.length).toString('latin1') === text
}

/**
 * Detect an uploaded image's real type from its magic number. Returns null
 * for anything that is not a bitmap image we serve — including SVG text,
 * which must never be persisted by this route.
 */
export function sniffImageExtension(bytes: Buffer): UploadExtension | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return '.png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  if (bytes.length >= 6 && (asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a'))) return '.gif'
  if (bytes.length >= 12 && asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) return '.webp'
  // ISO-BMFF: `ftyp` box at offset 4; AVIF uses the avif/avis/mif1 brands.
  if (bytes.length >= 12 && asciiAt(bytes, 4, 'ftyp')) {
    const brand = bytes.subarray(8, 12).toString('latin1')
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') return '.avif'
  }
  return null
}

/**
 * Reduce a client-provided filename to a safe stem: basename only, lowercase,
 * runs of foreign characters collapse to one dash, no leading separators or
 * dots. Returns null when nothing usable remains.
 */
export function sanitizeUploadStem(rawName: string): string | null {
  const base = rawName.replace(/\\/g, '/').split('/').pop() ?? ''
  const stem = base.replace(/\.[^.]*$/, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+/, '').replace(/[-.]+$/, '')
  return stem === '' ? null : stem
}

/**
 * Whether the request passes the same-origin gate (see module docs).
 * Compares the `Origin` authority against the `Host` header, case-insensitively.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (origin === undefined || req.headers.host === undefined) return false
  try {
    return new URL(origin).host.toLowerCase() === req.headers.host.toLowerCase()
  } catch {
    return false
  }
}

/** Read the request body as one Buffer; null when over the cap or the stream errors. */
function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise(resolvePromise => {
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES) {
      resolvePromise(null)
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    let failed = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > UPLOAD_MAX_BYTES) {
        failed = true
        req.destroy()
        resolvePromise(null)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { if (!failed) resolvePromise(Buffer.concat(chunks)) })
    req.on('error', () => { if (!failed) { failed = true; resolvePromise(null) } })
  })
}

interface UploadResponse {
  url: string
  filename: string
}

/**
 * Store one uploaded image into `userDir` and answer with its served URL.
 * Every failure path writes a short JSON error with a distinct status:
 * 403 cross-origin, 413 too large, 415 not an accepted image, 500 disk
 * failure. An unusable client filename falls back to a generic stem.
 */
export async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  userDir: string,
): Promise<void> {
  const send = (status: number, body: Record<string, string>): void => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (!isSameOrigin(req)) {
    send(403, { error: 'cross-origin upload refused' })
    return
  }
  const body = await readBody(req)
  if (body === null) {
    send(413, { error: `image must be at most ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)} MB` })
    return
  }
  const extension = sniffImageExtension(body)
  if (extension === null) {
    send(415, { error: 'not a supported image (png, jpeg, webp, avif, gif)' })
    return
  }
  const rawName = new URL(req.url ?? '/', 'http://localhost').searchParams.get('name') ?? ''
  // An unusable name (empty, non-latin script that sanitizes away) still
  // uploads under a generic stem rather than failing the user.
  const stem = sanitizeUploadStem(rawName) ?? 'wallpaper'
  const filename = `${stem}-${Date.now().toString(36)}${extension}`
  try {
    await mkdir(userDir, { recursive: true })
    await writeFile(join(userDir, filename), body)
  } catch {
    send(500, { error: 'failed to store the image' })
    return
  }
  const response: UploadResponse = {
    url: `${WALLPAPER_ROUTE}/${encodeURIComponent(filename)}`,
    filename,
  }
  send(200, response as unknown as Record<string, string>)
}

/**
 * `DELETE /skin-background/wallpapers/<name>` — remove one user-uploaded
 * wallpaper. Only the user drop-in directory is consulted, so shipped
 * built-in wallpapers can never be deleted through this route. Same-origin
 * gate as the upload route (browsers attach Origin to DELETE fetches).
 */
export async function handleWallpaperDelete(
  req: IncomingMessage,
  res: ServerResponse,
  userDir: string,
): Promise<void> {
  const send = (status: number, body: Record<string, string>): void => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  if (!isSameOrigin(req)) {
    send(403, { error: 'cross-origin delete refused' })
    return
  }
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
  const filename = decodeURIComponent(pathname.slice(WALLPAPER_ROUTE.length + 1))
  if (!isWallpaperFilename(filename)) {
    send(404, { error: 'wallpaper not found' })
    return
  }
  const target = resolve(userDir, filename)
  if (!target.startsWith(resolve(userDir) + (process.platform === 'win32' ? '\\' : '/'))) {
    send(404, { error: 'wallpaper not found' })
    return
  }
  try {
    await unlink(target)
  } catch {
    // Not in the user directory (e.g. a built-in name) or already gone.
    send(404, { error: 'wallpaper not found' })
    return
  }
  send(200, { ok: 'true' })
}
