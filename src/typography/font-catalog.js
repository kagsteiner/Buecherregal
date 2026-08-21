export const FONT_CATALOG_VERSION = '2026-08-21.3';

export const FONT_CATALOG = [
  { key: 'literata', family: 'Literata', file: 'ofl/literata/Literata[opsz,wght].ttf', description: 'warm, literary serif with strong readability' },
  { key: 'libre-baskerville', family: 'Libre Baskerville', file: 'ofl/librebaskerville/LibreBaskerville[wght].ttf', description: 'traditional book serif, calm and authoritative' },
  { key: 'cormorant-garamond', family: 'Cormorant Garamond', file: 'ofl/cormorantgaramond/CormorantGaramond[wght].ttf', description: 'elegant high-contrast serif for literary and historical books' },
  { key: 'bodoni-moda', family: 'Bodoni Moda', file: 'ofl/bodonimoda/BodoniModa[opsz,wght].ttf', description: 'dramatic Didone serif with fashion and classic-literature character' },
  { key: 'cinzel', family: 'Cinzel', file: 'ofl/cinzel/Cinzel[wght].ttf', description: 'inscriptional Roman capitals for epic, mythic, and historical titles' },
  { key: 'roboto-slab', family: 'Roboto Slab', file: 'apache/robotoslab/RobotoSlab[wght].ttf', description: 'sturdy contemporary slab serif for nonfiction and thrillers' },
  { key: 'inter', family: 'Inter', file: 'ofl/inter/Inter[opsz,wght].ttf', description: 'neutral modern sans serif for practical nonfiction' },
  { key: 'montserrat', family: 'Montserrat', file: 'ofl/montserrat/Montserrat[wght].ttf', description: 'geometric sans serif with polished editorial character' },
  { key: 'barlow-condensed', family: 'Barlow Condensed', file: 'ofl/barlowcondensed/BarlowCondensed-Regular.ttf', description: 'narrow technical sans serif, useful for science and modern nonfiction' },
  { key: 'oswald', family: 'Oswald', file: 'ofl/oswald/Oswald[wght].ttf', description: 'strong condensed sans serif for bold commercial covers' },
  { key: 'bebas-neue', family: 'Bebas Neue', file: 'ofl/bebasneue/BebasNeue-Regular.ttf', description: 'very condensed uppercase display face for thrillers and action' },
  { key: 'archivo-black', family: 'Archivo Black', file: 'ofl/archivoblack/ArchivoBlack-Regular.ttf', description: 'heavy wide sans serif with high impact' },
  { key: 'rajdhani', family: 'Rajdhani', file: 'ofl/rajdhani/Rajdhani-Regular.ttf', description: 'squared technical sans serif for science fiction' },
  { key: 'orbitron', family: 'Orbitron', file: 'ofl/orbitron/Orbitron[wght].ttf', description: 'overtly futuristic display face for space and technology themes' },
  { key: 'special-elite', family: 'Special Elite', file: 'apache/specialelite/SpecialElite-Regular.ttf', description: 'distressed typewriter face for documents, history, and mystery' },
  { key: 'caveat', family: 'Caveat', file: 'ofl/caveat/Caveat[wght].ttf', description: 'informal handwritten face for personal and lighthearted books' },
];

export const FONT_KEYS = FONT_CATALOG.map((font) => font.key);
