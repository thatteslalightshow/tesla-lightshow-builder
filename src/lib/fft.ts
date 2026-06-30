// Minimal iterative radix-2 FFT (pure JS, no Web Audio) so the spectral onset detector runs
// IDENTICALLY in the browser preview and the serverless export path. Power-of-two sizes only.
export class FFT {
  readonly n: number
  private cos: Float32Array
  private sin: Float32Array
  private rev: Uint32Array
  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of 2')
    this.n = n
    this.cos = new Float32Array(n / 2)
    this.sin = new Float32Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos(-2 * Math.PI * i / n)
      this.sin[i] = Math.sin(-2 * Math.PI * i / n)
    }
    const bits = Math.round(Math.log2(n))
    this.rev = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      let x = i, r = 0
      for (let j = 0; j < bits; j++) { r = (r << 1) | (x & 1); x >>= 1 }
      this.rev[i] = r >>> 0
    }
  }
  // In-place forward FFT of the complex arrays re/im (length n).
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n, rev = this.rev
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size
      for (let i = 0; i < n; i += size) {
        for (let k = 0, idx = 0; k < half; k++, idx += step) {
          const c = this.cos[idx], s = this.sin[idx]
          const a = i + k, b = a + half
          const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c
          re[b] = re[a] - tr; im[b] = im[a] - ti
          re[a] += tr; im[a] += ti
        }
      }
    }
  }
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))
  return w
}
