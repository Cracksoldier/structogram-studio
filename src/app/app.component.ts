import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { DiagramCanvasComponent } from './components/diagram-canvas/diagram-canvas.component';
import { DslEditorComponent } from './components/dsl-editor/dsl-editor.component';
import { HelpDialogComponent } from './components/help-dialog/help-dialog.component';
import { InspectorComponent } from './components/inspector/inspector.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { ICONS } from './icons';
import { BlockKind } from './model/diagram.model';
import { findBlock, getList } from './model/tree-ops';
import { DiagramStore } from './services/diagram-store';
import { ExportService } from './services/export.service';

const INSERT_KEYS: BlockKind[] = ['statement', 'call', 'exit', 'if', 'switch', 'while', 'doWhile', 'for'];

@Component({
  selector: 'nsd-root',
  imports: [ToolbarComponent, DiagramCanvasComponent, DslEditorComponent, InspectorComponent, HelpDialogComponent, FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nsd-toolbar (help)="helpOpen.set(true)" (error)="toast($event)" />
    <main [style.--side-w.px]="sideWidth()">
      <nsd-diagram-canvas />
      <div class="resizer" (pointerdown)="startResize($event)" title="Drag to resize"></div>
      <aside>
        <nsd-dsl-editor />
        <nsd-inspector />
      </aside>
    </main>
    <footer>
      <span><fa-icon [icon]="icons.logo" /> {{ store.blockCount() }} blocks</span>
      <span class="dot"></span>
      <span>{{ store.layout().width }} × {{ store.layout().height }} px</span>
      <span class="grow"></span>
      <span class="muted">Autosaved locally · press <kbd>F1</kbd> for help</span>
    </footer>
    @if (helpOpen()) {
      <nsd-help-dialog (close)="helpOpen.set(false)" />
    }
    @if (message(); as m) {
      <div class="toast" role="alert"><fa-icon [icon]="icons.warning" /> {{ m }}</div>
    }
  `,
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly store = inject(DiagramStore);
  private readonly exporter = inject(ExportService);
  readonly icons = ICONS;
  readonly helpOpen = signal(false);
  readonly message = signal<string | null>(null);
  readonly sideWidth = signal(400);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  toast(msg: string): void {
    this.message.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.message.set(null), 4500);
  }

  startResize(ev: PointerEvent): void {
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = this.sideWidth();
    const move = (e: PointerEvent) => {
      const w = startW - (e.clientX - startX);
      this.sideWidth.set(Math.max(280, Math.min(window.innerWidth * 0.6, w)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const s = this.store;
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();

    if (ev.key === 'F1') {
      ev.preventDefault();
      this.helpOpen.set(!this.helpOpen());
      return;
    }
    if (this.helpOpen()) {
      if (ev.key === 'Escape') this.helpOpen.set(false);
      return;
    }

    let handled = true;
    if (mod && key === 'z' && !ev.shiftKey) s.undo();
    else if (mod && (key === 'y' || (key === 'z' && ev.shiftKey))) s.redo();
    else if (mod && key === 'c') s.copySelected();
    else if (mod && key === 'x') s.cutSelected();
    else if (mod && key === 'v') s.paste();
    else if (mod && key === 'd') s.duplicateSelected();
    else if (mod && key === 's') this.exporter.saveJson();
    else if (ev.key === 'Delete' || ev.key === 'Backspace') s.deleteSelected();
    else if (ev.altKey && ev.key === 'ArrowUp') s.moveSelected(-1);
    else if (ev.altKey && ev.key === 'ArrowDown') s.moveSelected(1);
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') this.selectSibling(ev.key === 'ArrowUp' ? -1 : 1);
    else if ((ev.key === 'F2' || ev.key === 'Enter') && s.selectedBlock()) s.editingId.set(s.selectedBlock()!.id);
    else if (ev.key === 'Escape') s.select(null);
    else if (!mod && !ev.altKey && /^[1-8]$/.test(ev.key)) s.insert(INSERT_KEYS[Number(ev.key) - 1]);
    else handled = false;

    if (handled) ev.preventDefault();
  }

  private selectSibling(delta: number): void {
    const d = this.store.diagram();
    const sel = this.store.selection();
    if (!sel) {
      if (d.body[0]) this.store.select({ type: 'block', id: d.body[0].id });
      return;
    }
    if (sel.type !== 'block') return;
    const loc = findBlock(d, sel.id);
    if (!loc) return;
    const list = getList(d, loc.slot)!;
    const next = list[loc.index + delta];
    if (next) this.store.select({ type: 'block', id: next.id });
  }
}
