/**
 * The Planet logo, loaded once and tinted to the theme:
 * white on dark, a faded black on light. The artwork is white with its
 * brightness stored as transparency, so tinting never changes its shape or shading.
 */
export const MARK_SRC = '/brand/planet-mark.png'
export const LOGO_SRC = '/brand/planet-logo.png'

const cache = new Map<string, HTMLImageElement>()
export function brandImage(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = src
    cache.set(src, img)
  }
  return img
}

export async function loadBrand(src: string) {
  const img = brandImage(src)
  if (!img.complete || !img.naturalWidth) {
    try {
      await img.decode()
    } catch {
      /* drawn without the logo if it can't load */
    }
  }
  return img
}

/** theme colour for the logo */
export function brandInk() {
  const light = document.documentElement.dataset.theme === 'light'
  return light ? 'rgba(18,18,18,0.82)' : '#f2f1ec'
}

const tinted = new Map<string, HTMLCanvasElement>()
/** the logo recoloured to `color`, cached per colour */
export function tintedBrand(src: string, color: string): HTMLCanvasElement | null {
  const img = brandImage(src)
  if (!img.complete || !img.naturalWidth) return null
  const key = src + '|' + color
  let c = tinted.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const x = c.getContext('2d')!
    x.drawImage(img, 0, 0)
    x.globalCompositeOperation = 'source-in'
    x.fillStyle = color
    x.fillRect(0, 0, c.width, c.height)
    tinted.set(key, c)
  }
  return c
}

// warm the cache as soon as the app loads so the first transition has the logo
if (typeof window !== 'undefined') {
  brandImage(MARK_SRC)
  brandImage(LOGO_SRC)
}
