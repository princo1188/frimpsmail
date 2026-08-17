import juice from 'juice';
import { convert } from 'html-to-text';

const FONT_FALLBACKS: Record<string, string> = {
  'sans-serif': 'Arial, Helvetica, sans-serif',
  'serif': 'Georgia, Times New Roman, serif',
  'monospace': 'Courier New, Courier, monospace',
  'cursive': 'Georgia, Times New Roman, serif',
  'fantasy': 'Arial, Helvetica, sans-serif',
};

function patchImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let patched = tag;
    if (!/\swidth=/i.test(patched)) {
      patched = patched.replace(/\s*\/?>$/, ' width="auto"$&');
    }
    if (!/\sheight=/i.test(patched)) {
      patched = patched.replace(/\s*\/?>$/, ' height="auto"$&');
    }
    return patched;
  });
}

function resolveFontFamily(style: string): string {
  return style.replace(/font-family\s*:\s*([^;]+)/gi, (_, fontList: string) => {
    const fonts = fontList.split(',').map((f: string) => f.trim().replace(/['"]/g, ''));
    const normalized = fonts.map((f: string) => FONT_FALLBACKS[f.toLowerCase()] ?? f);
    const unique = Array.from(new Set(normalized));
    return `font-family: ${unique.join(', ')}`;
  });
}

function stripUnsupportedCss(inlined: string): string {
  return inlined.replace(/style="([^"]*)"/gi, (_, style: string) => {
    const cleaned = style
      .split(';')
      .map((rule) => rule.trim())
      .filter((rule) => {
        const prop = rule.split(':')[0]?.trim().toLowerCase();
        return prop && !['position', 'flex', 'grid', 'background-image'].includes(prop);
      })
      .join('; ');
    return `style="${cleaned}"`;
  });
}

export interface EmailSafeMessage {
  html: string;
  text: string;
}

export function emailSafePipeline(bodyHtml: string): EmailSafeMessage {
  // 1. Patch inline images with width/height attributes
  let html = patchImages(bodyHtml);

  // 2. Inline CSS using juice, preserving font-family resolution
  html = juice(html, {
    applyStyleTags: true,
    removeStyleTags: true,
    preserveMediaQueries: false,
    preserveFontFaces: false,
    preserveImportant: true,
    inlinePseudoElements: false,
    webResources: { images: false },
  });

  // 3. Resolve font-family to web-safe stacks
  html = resolveFontFamily(html);

  // 4. Strip unsupported CSS properties
  html = stripUnsupportedCss(html);

  // 5. Generate plain text fallback
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: false } },
      { selector: 'img', format: 'skip' },
    ],
  });

  return { html, text };
}
