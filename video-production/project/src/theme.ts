import { staticFile } from "remotion";

// Colours taken from the DELTA PULSE app's own dark theme (radar/app/globals.css).
export const C = {
  bg: "#111815",
  bg2: "#18211d",
  void: "#070b0a",
  text: "#eef2ee",
  muted: "#9fb0a7",
  accent: "#74b9e6", // app accent (hydrography blue)
  cyan: "#4dcfcb", // open water in the app's maps
  amber: "#e6b25a", // water under vegetation in the app's maps
};

// The app's own typefaces (SIL OFL 1.1, licences in video-production/assets/fonts).
export const F = {
  head: "'Space Grotesk', system-ui, sans-serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

let loaded: Promise<void> | null = null;
export const loadFonts = () => {
  if (loaded) return loaded;
  const faces = [
    new FontFace("Space Grotesk", `url(${staticFile("fonts/SpaceGrotesk-latin.woff2")})`, { weight: "300 700" }),
    new FontFace("IBM Plex Sans", `url(${staticFile("fonts/IBMPlexSans-latin.woff2")})`, { weight: "400 600" }),
    new FontFace("IBM Plex Mono", `url(${staticFile("fonts/IBMPlexMono-400-latin.woff2")})`, { weight: "400" }),
    new FontFace("IBM Plex Mono", `url(${staticFile("fonts/IBMPlexMono-500-latin.woff2")})`, { weight: "500" }),
  ];
  loaded = Promise.all(faces.map((f) => f.load().then((ff) => { document.fonts.add(ff); }))).then(() => undefined);
  return loaded;
};

export const sec = (s: number, fps = 30) => Math.round(s * fps);
