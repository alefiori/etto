/**
 * The scanner reads the barcodes it is for.
 *
 * BarcodeScanner.tsx deliberately uses the *one-dimensional* reader rather than
 * `BrowserMultiFormatReader`, because the general one statically pulls in the
 * Aztec, DataMatrix, MaxiCode, MicroQR, PDF417 and QR decoders and roughly
 * triples a chunk the service worker precaches. Nothing about that swap is
 * visible until someone points a camera at a product, which is exactly the kind
 * of regression worth a test.
 *
 * So: synthesise the bar pattern for each format the scanner claims to support
 * and push it through the same reader the component constructs, via the public
 * `decodeBitmap` — no camera, no DOM video, just the decoder.
 */
import { describe, it, expect } from 'vitest'
import { BrowserMultiFormatOneDReader } from '@zxing/browser'
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  RGBLuminanceSource,
} from '@zxing/library'

// EAN/UPC digit encodings. Each digit is seven modules; `1` is a bar.
const L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
]
const G = L.map((bits) => [...bits].reverse().map((b) => (b === '1' ? '0' : '1')).join(''))
const R = L.map((bits) => [...bits].map((b) => (b === '1' ? '0' : '1')).join(''))

/** Which of the first six digits use G rather than L, chosen by the first digit. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
]

/** The module pattern for a 13-digit EAN-13 (a UPC-A is one with a leading zero). */
function ean13Modules(code: string): string {
  const d = [...code].map(Number)
  const parity = PARITY[d[0]]
  const left = d.slice(1, 7).map((digit, i) => (parity[i] === 'L' ? L : G)[digit]).join('')
  const right = d.slice(7).map((digit) => R[digit]).join('')
  return `101${left}01010${right}101`
}

/** The module pattern for an 8-digit EAN-8: four L digits, four R digits. */
function ean8Modules(code: string): string {
  const d = [...code].map(Number)
  const left = d.slice(0, 4).map((digit) => L[digit]).join('')
  const right = d.slice(4).map((digit) => R[digit]).join('')
  return `101${left}01010${right}101`
}

/**
 * Which of a UPC-E's six digits use G rather than L, chosen by its check digit.
 * (For number system 1 the whole table inverts; the scanner only ever meets 0.)
 */
const UPCE_PARITY = [
  'GGGLLL', 'GGLGLL', 'GGLLGL', 'GGLLLG', 'GLGGLL',
  'GLLGGL', 'GLLLGG', 'GLGLGL', 'GLGLLG', 'GLLGLG',
]

/**
 * The module pattern for an 8-digit UPC-E: no centre guard and no right-hand
 * group — the six digits carry their own parity, and the check digit is what
 * says which parities to expect.
 */
function upceModules(code: string): string {
  const d = [...code].map(Number)
  const parity = UPCE_PARITY[d[7]]
  const digits = d.slice(1, 7).map((digit, i) => (parity[i] === 'L' ? L : G)[digit]).join('')
  return `101${digits}010101`
}

/**
 * Render a module pattern as a bitmap the decoder can read: each module widened
 * so a scan line has something to measure, with the quiet zones EAN/UPC require
 * on either side, and tall enough that the reader's row sampling finds it.
 */
function bitmapOf(modules: string, { scale = 3, quietZone = 12, height = 40 } = {}): BinaryBitmap {
  const quiet = '0'.repeat(quietZone)
  const row = [...`${quiet}${modules}${quiet}`].flatMap((m) =>
    // A bar is black (luminance 0); everything else is white.
    Array<number>(scale).fill(m === '1' ? 0 : 255),
  )
  const width = row.length
  const luminances = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) luminances.set(row, y * width)

  const source = new RGBLuminanceSource(luminances, width, height)
  return new BinaryBitmap(new HybridBinarizer(source))
}

/** The reader BarcodeScanner.tsx builds, hinted the same way. */
function scannerReader(): BrowserMultiFormatOneDReader {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ])
  return new BrowserMultiFormatOneDReader(hints)
}

describe('the barcode formats the scanner promises', () => {
  it('reads an EAN-13 — the format on most of the world`s groceries', () => {
    // Nutella 750g, as it happens: a real code with a valid check digit.
    const result = scannerReader().decodeBitmap(bitmapOf(ean13Modules('3017624010701')))
    expect(result.getText()).toBe('3017624010701')
    expect(result.getBarcodeFormat()).toBe(BarcodeFormat.EAN_13)
  })

  it('reads a UPC-A — the same bars, read as the 12 digits North America prints', () => {
    const result = scannerReader().decodeBitmap(bitmapOf(ean13Modules('0012000001086')))
    expect(result.getText()).toBe('012000001086')
    expect(result.getBarcodeFormat()).toBe(BarcodeFormat.UPC_A)
  })

  it('reads an EAN-8 — the short code small packaging carries', () => {
    const result = scannerReader().decodeBitmap(bitmapOf(ean8Modules('96385074')))
    expect(result.getText()).toBe('96385074')
    expect(result.getBarcodeFormat()).toBe(BarcodeFormat.EAN_8)
  })

  it('does NOT read a UPC-E, though the scanner asks for them', () => {
    // Not a consequence of the one-dimensional reader — `BrowserMultiFormatReader`
    // fails this exact bitmap identically. UPC-E is broken in @zxing/library
    // 0.23.0: UPCEReader.decodeMiddle passes `new StringBuilder(result)` to
    // determineNumSysAndCheckDigit, so the number system and check digit it works
    // out are written to a throwaway and the six bare digits are what comes back.
    // (That helper is doubly wrong: `'0' + numSys` concatenates where the Java it
    // was ported from did char arithmetic, so it yields '0012345605', not
    // '01234565'.) The row is then the wrong length and the decode is abandoned.
    //
    // Pinned rather than fixed: patching a dependency's decoder is not this app's
    // job, and UPC-E is rare outside small US packaging. This test is here so the
    // day a @zxing upgrade fixes it, this fails and tells us we can drop the
    // caveat — at which point assert the decode instead.
    expect(() => scannerReader().decodeBitmap(bitmapOf(upceModules('01234565')))).toThrow()
  })

  it('rejects a blank frame rather than inventing a code', () => {
    // Most frames from a live camera look like this, and the component treats a
    // throw as "keep scanning" — so this is the common path, not an edge case.
    expect(() => scannerReader().decodeBitmap(bitmapOf('0'.repeat(95)))).toThrow()
  })
})
