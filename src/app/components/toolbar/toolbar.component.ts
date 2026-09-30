import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, output, signal, viewChild } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { BLOCK_ICONS, ICONS } from '../../icons';
import { BLOCK_LABELS, BlockKind } from '../../model/diagram.model';
import { DiagramStore } from '../../services/diagram-store';
import { ExportOptions, ExportService, ExportTheme } from '../../services/export.service';

@Component({
  selector: 'nsd-toolbar',
  imports: [FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="brand">
      <span class="logo"><fa-icon [icon]="icons.logo" /></span>
      <span class="name">Structogram<span class="dim">Studio</span></span>
    </div>

    <div class="group" role="group" aria-label="File">
      <button class="tb" title="New diagram" (click)="store.newDiagram()"><fa-icon [icon]="icons.newFile" /></button>
      <button class="tb" title="Open .json / .nsd file" (click)="fileInput().nativeElement.click()">
        <fa-icon [icon]="icons.open" />
      </button>
      <button class="tb" title="Save as JSON" (click)="exporter.saveJson()"><fa-icon [icon]="icons.save" /></button>
      <button class="tb" title="Load example" (click)="store.loadSample()"><fa-icon [icon]="icons.sample" /></button>
      <input #file type="file" accept=".json,.nsd,.txt" hidden (change)="openFile($event)" />
    </div>

    <div class="group" role="group" aria-label="Edit">
      <button class="tb" title="Undo (Ctrl+Z)" [disabled]="!store.canUndo()" (click)="store.undo()">
        <fa-icon [icon]="icons.undo" />
      </button>
      <button class="tb" title="Redo (Ctrl+Y)" [disabled]="!store.canRedo()" (click)="store.redo()">
        <fa-icon [icon]="icons.redo" />
      </button>
      <span class="sep"></span>
      <button class="tb" title="Cut (Ctrl+X)" [disabled]="!store.selectedBlock()" (click)="store.cutSelected()">
        <fa-icon [icon]="icons.cut" />
      </button>
      <button class="tb" title="Copy (Ctrl+C)" [disabled]="!store.selectedBlock()" (click)="store.copySelected()">
        <fa-icon [icon]="icons.copy" />
      </button>
      <button class="tb" title="Paste (Ctrl+V)" [disabled]="!store.canPaste()" (click)="store.paste()">
        <fa-icon [icon]="icons.paste" />
      </button>
      <span class="sep"></span>
      <button class="tb" title="Move up (Alt+↑)" [disabled]="!store.selectedBlock()" (click)="store.moveSelected(-1)">
        <fa-icon [icon]="icons.up" />
      </button>
      <button class="tb" title="Move down (Alt+↓)" [disabled]="!store.selectedBlock()" (click)="store.moveSelected(1)">
        <fa-icon [icon]="icons.down" />
      </button>
      <button class="tb danger" title="Delete (Del)" [disabled]="!store.selectedBlock()" (click)="store.deleteSelected()">
        <fa-icon [icon]="icons.delete" />
      </button>
    </div>

    <div class="group insert" role="group" aria-label="Insert block">
      <span class="group-label">Insert</span>
      @for (k of kinds; track k) {
        <button class="tb labeled" [title]="'Insert ' + labels[k]" (click)="store.insert(k)">
          <fa-icon [icon]="blockIcons[k]" />
          <span>{{ short[k] }}</span>
        </button>
      }
    </div>

    <div class="spacer"></div>

    <div class="group export" #exportWrap>
      <button class="tb primary" (click)="exportOpen.set(!exportOpen())" [class.active]="exportOpen()">
        <fa-icon [icon]="icons.download" />
        <span>Export</span>
        <fa-icon [icon]="icons.chevron" class="chev" />
      </button>
      @if (exportOpen()) {
        <div class="popover" role="dialog" aria-label="Export options">
          <div class="row">
            <span class="lbl">Theme</span>
            <div class="seg">
              @for (t of themes; track t) {
                <button [class.on]="opts().theme === t" (click)="setOpt({ theme: t })">{{ t }}</button>
              }
            </div>
          </div>
          <div class="row">
            <span class="lbl">PNG scale</span>
            <div class="seg">
              @for (s of scales; track s) {
                <button [class.on]="opts().scale === s" (click)="setOpt({ scale: s })">{{ s }}×</button>
              }
            </div>
          </div>
          <label class="row check">
            <input type="checkbox" [checked]="opts().transparent" (change)="setOpt({ transparent: !opts().transparent })" />
            <span>Transparent background</span>
          </label>
          <div class="actions">
            <button class="big" (click)="doExport('png')" [disabled]="busy()">
              <fa-icon [icon]="icons.png" /> PNG
            </button>
            <button class="big" (click)="doExport('svg')" [disabled]="busy()">
              <fa-icon [icon]="icons.svg" /> SVG
            </button>
          </div>
          <button class="link" (click)="exporter.saveDsl(); exportOpen.set(false)">
            <fa-icon [icon]="icons.terminal" /> Download pseudo-code (.nsd)
          </button>
        </div>
      }
    </div>

    <button class="tb" title="Help & DSL reference (F1)" (click)="help.emit()"><fa-icon [icon]="icons.help" /></button>
  `,
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  readonly store = inject(DiagramStore);
  readonly exporter = inject(ExportService);
  readonly help = output<void>();
  readonly error = output<string>();

  readonly icons = ICONS;
  readonly blockIcons = BLOCK_ICONS;
  readonly labels = BLOCK_LABELS;
  readonly kinds: BlockKind[] = ['statement', 'call', 'exit', 'if', 'switch', 'while', 'doWhile', 'for'];
  readonly short: Record<BlockKind, string> = {
    statement: 'Step',
    call: 'Call',
    exit: 'Exit',
    if: 'If',
    switch: 'Switch',
    while: 'While',
    doWhile: 'Do',
    for: 'For',
  };
  readonly themes: ExportTheme[] = ['dark', 'light'];
  readonly scales = [1, 2, 3];

  readonly exportOpen = signal(false);
  readonly busy = signal(false);
  readonly opts = signal<ExportOptions>({ theme: 'dark', transparent: false, scale: 2 });

  readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private readonly exportWrap = viewChild.required<ElementRef<HTMLElement>>('exportWrap');

  setOpt(p: Partial<ExportOptions>): void {
    this.opts.update((o) => ({ ...o, ...p }));
  }

  async doExport(kind: 'png' | 'svg'): Promise<void> {
    this.busy.set(true);
    try {
      if (kind === 'png') await this.exporter.exportPng(this.opts());
      else await this.exporter.exportSvg(this.opts());
      this.exportOpen.set(false);
    } catch (e) {
      this.error.emit(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async openFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) this.store.loadJson(text);
      else this.store.loadDsl(text);
    } catch (e) {
      this.error.emit(e instanceof Error ? e.message : String(e));
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(ev: PointerEvent): void {
    if (this.exportOpen() && !this.exportWrap().nativeElement.contains(ev.target as Node)) {
      this.exportOpen.set(false);
    }
  }
}
