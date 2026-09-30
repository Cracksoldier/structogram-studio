import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONS } from '../../icons';
import { Box, Prim } from '../../layout/layout';
import { primaryText } from '../../model/diagram.model';
import { findBlock } from '../../model/tree-ops';
import { DARK } from '../../render/palette';
import { DiagramStore } from '../../services/diagram-store';

@Component({
  selector: 'nsd-diagram-canvas',
  imports: [FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scroller" #scroller (click)="store.select(null)" (wheel)="onWheel($event)">
      <div class="stage" [style.width.px]="lay().width * zoom()" [style.height.px]="lay().height * zoom()">
        <svg
          class="diagram"
          xmlns="http://www.w3.org/2000/svg"
          [attr.width]="lay().width * zoom()"
          [attr.height]="lay().height * zoom()"
          [attr.viewBox]="'0 0 ' + lay().width + ' ' + lay().height"
          (click)="$event.stopPropagation()"
          (mouseleave)="hovered.set(null)"
        >
          <g [attr.stroke]="pal.stroke" stroke-width="1" stroke-linejoin="round">
            @for (p of lay().prims; track $index) {
              @switch (p.t) {
                @case ('rect') {
                  <rect
                    [attr.x]="p.x"
                    [attr.y]="p.y"
                    [attr.width]="p.w"
                    [attr.height]="p.h"
                    [attr.fill]="pal.fill[p.role]"
                    [class.hit]="!!(p.nodeId || p.slot)"
                    (click)="onPrimClick(p, $event)"
                    (dblclick)="onPrimDblClick(p)"
                    (mouseenter)="hovered.set(p.nodeId ?? p.slot ?? null)"
                  />
                }
                @case ('poly') {
                  <polygon
                    [attr.points]="p.points"
                    [attr.fill]="pal.fill[p.role]"
                    class="hit"
                    (click)="onPrimClick(p, $event)"
                    (dblclick)="onPrimDblClick(p)"
                    (mouseenter)="hovered.set(p.nodeId ?? null)"
                  />
                }
                @case ('line') {
                  <line
                    [attr.x1]="p.x1"
                    [attr.y1]="p.y1"
                    [attr.x2]="p.x2"
                    [attr.y2]="p.y2"
                    [attr.stroke]="p.accent ? pal.accent : null"
                    pointer-events="none"
                  />
                }
                @case ('text') {
                  <text
                    [attr.x]="p.x"
                    [attr.y]="p.y"
                    [attr.text-anchor]="p.anchor"
                    [attr.fill]="pal.text[p.role]"
                    [attr.class]="'tx ' + p.role"
                    stroke="none"
                    pointer-events="none"
                  >{{ p.text }}</text>
                }
              }
            }
          </g>
          @if (hoverBox(); as h) {
            <rect class="hover" [attr.x]="h.x" [attr.y]="h.y" [attr.width]="h.w" [attr.height]="h.h" />
          }
          @if (selBox(); as s) {
            <rect class="sel" [attr.x]="s.x + 1" [attr.y]="s.y + 1" [attr.width]="s.w - 2" [attr.height]="s.h - 2" />
          }
        </svg>

        @if (editBox(); as e) {
          <textarea
            #editor
            class="inline-edit"
            [style.left.px]="e.x * zoom()"
            [style.top.px]="e.y * zoom()"
            [style.width.px]="e.w * zoom()"
            [style.height.px]="e.h * zoom()"
            [style.fontSize.px]="13 * zoom()"
            [value]="editValue()"
            (click)="$event.stopPropagation()"
            (keydown)="onEditKey($event)"
            (blur)="commitEdit()"
          ></textarea>
        }
      </div>
    </div>

    <div class="zoombar">
      <button title="Zoom out" (click)="store.setZoom(zoom() - 0.1)"><fa-icon [icon]="icons.zoomOut" /></button>
      <button class="pct" title="Reset zoom" (click)="store.setZoom(1)">{{ (zoom() * 100).toFixed(0) }}%</button>
      <button title="Zoom in" (click)="store.setZoom(zoom() + 0.1)"><fa-icon [icon]="icons.zoomIn" /></button>
      <button title="Fit to view" (click)="fit()"><fa-icon [icon]="icons.fit" /></button>
    </div>
  `,
  styleUrl: './diagram-canvas.component.css',
})
export class DiagramCanvasComponent {
  readonly store = inject(DiagramStore);
  readonly icons = ICONS;
  readonly pal = DARK;

  readonly lay = this.store.layout;
  readonly zoom = this.store.zoom;
  readonly hovered = signal<string | null>(null);

  private readonly scroller = viewChild.required<ElementRef<HTMLDivElement>>('scroller');
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  private cancelled = false;

  private boxFor(key: string | null): Box | null {
    if (!key) return null;
    const l = this.lay();
    return l.bounds.get(key) ?? l.slots.get(key)?.box ?? null;
  }

  readonly hoverBox = computed(() => {
    const h = this.hovered();
    return h && h !== this.store.selectedKey() ? this.boxFor(h) : null;
  });
  readonly selBox = computed(() => this.boxFor(this.store.selectedKey()));
  readonly editBox = computed(() => {
    const id = this.store.editingId();
    return id ? (this.lay().editBoxes.get(id) ?? null) : null;
  });
  readonly editValue = computed(() => {
    const id = this.store.editingId();
    const b = id ? findBlock(this.store.diagram(), id)?.block : null;
    return b ? primaryText(b) : '';
  });

  constructor() {
    afterRenderEffect(() => {
      const el = this.editor()?.nativeElement;
      if (el && document.activeElement !== el) {
        el.focus();
        el.select();
      }
    });
  }

  onPrimClick(p: Prim, ev: MouseEvent): void {
    ev.stopPropagation();
    if ((p.t === 'rect' || p.t === 'poly') && p.nodeId) {
      this.store.select({ type: 'block', id: p.nodeId });
    } else if (p.t === 'rect' && p.slot) {
      const s = this.lay().slots.get(p.slot);
      if (s) this.store.select({ type: 'slot', slot: s.slot });
    }
  }

  onPrimDblClick(p: Prim): void {
    if ((p.t === 'rect' || p.t === 'poly') && p.nodeId) {
      this.cancelled = false;
      this.store.editingId.set(p.nodeId);
    }
  }

  onEditKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.commitEdit();
    } else if (ev.key === 'Escape') {
      this.cancelled = true;
      this.store.editingId.set(null);
    }
  }

  commitEdit(): void {
    const id = this.store.editingId();
    const el = this.editor()?.nativeElement;
    if (!id || !el) return;
    const value = el.value;
    this.store.editingId.set(null);
    if (!this.cancelled) this.store.setBlockText(id, value);
  }

  onWheel(ev: WheelEvent): void {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    this.store.setZoom(this.zoom() * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  fit(): void {
    const el = this.scroller().nativeElement;
    const l = this.lay();
    const z = Math.min((el.clientWidth - 48) / l.width, (el.clientHeight - 48) / l.height);
    this.store.setZoom(Math.min(2, z));
  }
}
