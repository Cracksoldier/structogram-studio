import { Injectable, inject } from '@angular/core';
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import { serializeDsl } from '../dsl/serializer';
import { DARK, LIGHT, Palette } from '../render/palette';
import { toSvg } from '../render/svg-export';
import { DiagramStore } from './diagram-store';

export type ExportTheme = 'dark' | 'light';

export interface ExportOptions {
  theme: ExportTheme;
  transparent: boolean;
  /** PNG only: pixel ratio. */
  scale: number;
}

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private store = inject(DiagramStore);
  private fontCss: Promise<string> | null = null;

  /** @font-face rules with the fonts inlined, so exports render identically everywhere. */
  private embeddedFonts(): Promise<string> {
    this.fontCss ??= Promise.all([toDataUrl(inter400), toDataUrl(inter600)])
      .then(
        ([r, b]) =>
          `@font-face{font-family:'Inter';font-weight:400;src:url(${r}) format('woff2')}` +
          `@font-face{font-family:'Inter';font-weight:600;src:url(${b}) format('woff2')}`,
      )
      .catch(() => '');
    return this.fontCss;
  }

  private fileBase(): string {
    const t = this.store.diagram().title.trim() || 'diagram';
    return t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'diagram';
  }

  private palette(theme: ExportTheme): Palette {
    return theme === 'dark' ? DARK : LIGHT;
  }

  async buildSvg(opts: ExportOptions): Promise<string> {
    return toSvg(this.store.layout(), {
      palette: this.palette(opts.theme),
      transparent: opts.transparent,
      fontCss: await this.embeddedFonts(),
    });
  }

  async exportSvg(opts: ExportOptions): Promise<void> {
    const svg = await this.buildSvg(opts);
    this.download(new Blob([svg], { type: 'image/svg+xml' }), `${this.fileBase()}.svg`);
  }

  async exportPng(opts: ExportOptions): Promise<void> {
    const svg = await this.buildSvg(opts);
    const { width, height } = this.store.layout();
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render SVG to image'));
    });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * opts.scale);
    canvas.height = Math.ceil(height * opts.scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(opts.scale, opts.scale);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG encoding failed');
    this.download(blob, `${this.fileBase()}.png`);
  }

  saveJson(): void {
    const json = JSON.stringify(this.store.diagram(), null, 2);
    this.download(new Blob([json], { type: 'application/json' }), `${this.fileBase()}.nsd.json`);
  }

  saveDsl(): void {
    const text = serializeDsl(this.store.diagram());
    this.download(new Blob([text], { type: 'text/plain' }), `${this.fileBase()}.nsd`);
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
