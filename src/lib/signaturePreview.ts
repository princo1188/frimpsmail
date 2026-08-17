/**
 * Lightweight browser-side preview pipeline that mirrors the sync-service
 * email-safe-pipeline transformations used at SMTP send time.
 *
 * It is intentionally less powerful than Juice (which runs in Node) but covers
 * the same guardrails the signature will encounter: explicit image dimensions,
 * web-safe font fallbacks, and removal of unsupported email CSS properties.
 */

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
    const fonts = fontList.split(',').map((f) => f.trim().replace(/['"]/g, ''));
    const normalized = fonts.map((f) => FONT_FALLBACKS[f.toLowerCase()] ?? f);
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

export function signaturePreviewPipeline(bodyHtml: string): string {
  let html = patchImages(bodyHtml);
  html = resolveFontFamily(html);
  html = stripUnsupportedCss(html);
  return html;
}
