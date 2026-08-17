# Theme Name: Editorial — Frimps Oil Edition

# Vibe & Description: Magazine-like editorial design that prioritizes refined typesetting and a professional information hierarchy. Oversized headlines, elegant font layering, and generous whitespace create a strong reading rhythm. Content is structured with magazine-inspired grids and card layouts, anchored by high-contrast black-and-white tones and elevated with a restrained accent color. Delicate dividers, subtle shadows, and understated transitions add premium polish and improve readability.

# Branding
- Frimps Oil primary red: #E31E24
- Frimps Oil accent orange: #F7941D
- Surface: #FFFFFF
- Dark surface fallback: #0F1117

# Color
:root {
  --background: 0 0% 98%;
  --foreground: 0 0% 7%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 7%;
  --muted: 0 0% 95%;
  --muted-foreground: 0 0% 33%;
  --border: 0 0% 90%;
  --primary: 358 80% 50%; /* Frimps Oil red #E31E24 */
  --primary-foreground: 0 0% 100%;
  --accent: 32 93% 53%; /* Frimps Oil orange #F7941D */
  --accent-foreground: 0 0% 7%;
  --ring: 358 80% 50% / 0.25;
  --radius: 12px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.06);
  --shadow-md: 0 10px 30px rgba(0,0,0,.10);
  --tracking-tight: -0.02em;
  --leading-body: 1.7;
}
.dark {
  --background: 220 18% 8%;
  --foreground: 0 0% 96%;
  --card: 220 16% 12%;
  --card-foreground: 0 0% 96%;
  --muted: 220 14% 15%;
  --muted-foreground: 0 0% 72%;
  --border: 220 14% 20%;
  --primary: 358 80% 55%;
  --primary-foreground: 0 0% 100%;
  --accent: 32 90% 55%;
  --accent-foreground: 0 0% 7%;
  --ring: 358 80% 55% / 0.25;
  --radius: 12px;
}
- Title: Recommendation: Use a serif font with humanistic characteristics, such as "Playfair Display".
- Body text: Do not modify, use the default font.
# Font
- Heading & Body: PlayfairDisplay (url: https://resource-static.cdn.bcebos.com/fonts/Playfair_Display.woff2)
# Animation
## Element Animation
- Buttons slowly lift on hover (ease-out);
- Images slowly zoom within their container on hover, rather than changing abruptly.
## Transition Animation
- When scrolling down, create a relaxed, unhurried scrolling experience. Elements fade in and float upward as they enter the viewport.

# Layout
- Prefer asymmetry within structure: allow certain modules (hero image, quote block) to break the grid for editorial impact.
- Use a magazine-like grid as the backbone: clean alignment and generous whitespace.

# Elements
- Masthead / Header: magazine title, issue-style navigation, subtle separators;
- Cover Hero: oversized headline, deck (lead paragraph), author/date/reading time metadata.



