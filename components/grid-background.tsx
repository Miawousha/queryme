/**
 * The page's ground texture: matrice-website-v2's dot grid (`bg-dots` in
 * app/globals.css), fixed behind the app and kept faint so it reads as
 * texture, not pattern. Static — v2 draws no cursor-reactive grid — so it
 * needs no client code, no animation loop, and nothing for reduced motion.
 */
export function GridBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 bg-dots opacity-50"
    />
  );
}
