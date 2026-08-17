import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { BrandingConfig } from '@/types/types';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  branding: BrandingConfig | null;
  applyBranding: (config: BrandingConfig) => void;
  fetchBrandingByDomain: (domain: string) => Promise<void>;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_STORAGE_KEY = 'cosmos-theme-mode';

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
}
}
return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function getSystemMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveMode(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') return getSystemMode();
  return theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    return 'system';
});

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveMode(theme));

  const applyTheme = (mode: 'light' | 'dark') => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}
};

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    const resolved = resolveMode(mode);
    setResolvedTheme(resolved);
    applyTheme(resolved);
};

  const toggleTheme = () => {
    setThemeState((prev: ThemeMode) => {
      let next: ThemeMode;
      if (prev === 'system') {
        next = getSystemMode() === 'dark' ? 'light' : 'dark';
  } else {
    next = prev === 'dark' ? 'light' : 'dark';
}
localStorage.setItem(THEME_STORAGE_KEY, next);
setResolvedTheme(next);
applyTheme(next);
return next;
});
};

  // Apply initial theme on mount and listen for system changes
  useEffect(() => {
    applyTheme(resolveMode(theme));
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        const resolved = media.matches ? 'dark' : 'light';
        setResolvedTheme(resolved);
        applyTheme(resolved);
  }
};
media.addEventListener('change', handler);
return () => media.removeEventListener('change', handler);
}, []); // eslint-disable-line

  const applyBranding = (config: BrandingConfig) => {
    setBranding(config);
    const root = document.documentElement;

    if (config.primary_color) {
      const hsl = hexToHsl(config.primary_color);
      root.style.setProperty('--primary', hsl);
      root.style.setProperty('--cosmos-primary', config.primary_color);
      root.style.setProperty('--sidebar-primary', hsl);
      root.style.setProperty('--ring', hsl);
}
if (config.accent_color) {
  const hsl = hexToHsl(config.accent_color);
  root.style.setProperty('--accent', hsl);
  root.style.setProperty('--cosmos-accent', config.accent_color);
}
if (config.surface_color) {
  root.style.setProperty('--cosmos-surface', config.surface_color);
}

    // Apply organization theme only if user has not set an explicit override
    if (config.theme_mode && !localStorage.getItem(THEME_STORAGE_KEY)) {
      setTheme(config.theme_mode as ThemeMode);
}
};

  const fetchBrandingByDomain = async (domain: string) => {
    const { data } = await supabase
      .from('organizations')
      .select('branding_config')
      .eq('domain', domain)
      .maybeSingle();
if (data?.branding_config) applyBranding(data.branding_config as BrandingConfig);
};

  // Auto-detect domain on load
  useEffect(() => {
    const hostname = window.location.hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      fetchBrandingByDomain(hostname);
} else {
  // Dev: apply Frimps Oil branding as default
  applyBranding({
    primary_color: '#E31E24',
    accent_color: '#F7941D',
    surface_color: '#FFFFFF',
    theme_mode: 'light',
});
}
}, []); // eslint-disable-line

  return (
    <ThemeContext.Provider value={{ branding, applyBranding, fetchBrandingByDomain, theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
</ThemeContext.Provider>
);
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

