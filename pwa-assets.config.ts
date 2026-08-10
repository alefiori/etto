import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
    // The generated `<link rel="icon" type="image/svg+xml">` defaults to the
    // basename of the source image — public/icon.svg, the full 512 artwork,
    // whose three concentric rings turn to mush in a 16px tab. Point it at the
    // simplified mark instead. Only the link moves: the PNG set below is still
    // rendered from icon.svg, where the detail has room.
    resolveSvgName: () => 'favicon.svg',
  },
  preset: {
    ...minimal2023Preset,
    // Maskable + apple icons get a solid background matching the brand so the
    // SVG's transparent corners don't show through on iOS/Android launchers.
    // Flat violet rather than the tile's gradient: this only ever shows in the
    // few pixels outside the artwork, where a second gradient would band
    // against the first.
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: {
        background: '#6e56f8',
        fit: 'contain',
      },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: {
        background: '#6e56f8',
        fit: 'contain',
      },
    },
  },
  images: ['public/icon.svg'],
})
