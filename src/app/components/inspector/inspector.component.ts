import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { BLOCK_ICONS, ICONS } from '../../icons';
import {
  BLOCK_LABELS,
  Block,
  BlockKind,
  SwitchBlock,
  newId,
  primaryText,
  withPrimaryText,
} from '../../model/diagram.model';
import { DiagramStore } from '../../services/diagram-store';

const SIMPLE: BlockKind[] = ['statement', 'call', 'exit'];
const LOOPS: BlockKind[] = ['while', 'doWhile', 'for'];

@Component({
  selector: 'nsd-inspector',
  imports: [FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="panel-head">
      <fa-icon [icon]="icons.inspector" />
      <span>Inspector</span>
    </header>
    <div class="body">
      @if (block(); as b) {
        <div class="kind">
          <span class="badge"><fa-icon [icon]="blockIcons[b.kind]" /></span>
          <div>
            <div class="kind-name">{{ labels[b.kind] }}</div>
            <div class="hint">Double-click the block to edit in place</div>
          </div>
        </div>

        <label class="field">
          <span>{{ textLabel() }}</span>
          <textarea rows="2" [value]="text()" (change)="setText(b, $any($event.target).value)"></textarea>
        </label>

        @if (convertible().length > 1) {
          <div class="field">
            <span>Type</span>
            <div class="seg">
              @for (k of convertible(); track k) {
                <button [class.on]="b.kind === k" [title]="labels[k]" (click)="convert(b, k)">
                  <fa-icon [icon]="blockIcons[k]" />
                </button>
              }
            </div>
          </div>
        }

        @if (b.kind === 'if') {
          <button class="action" (click)="swapBranches(b)">Swap true / false branches</button>
        }

        @if (b.kind === 'switch') {
          <div class="field">
            <span>Cases</span>
            @for (c of b.cases; track c.id; let i = $index) {
              <div class="case-row">
                <input [value]="c.label" (change)="setCaseLabel(b, i, $any($event.target).value)" />
                <button class="icon" title="Remove case" [disabled]="b.cases.length <= 1" (click)="removeCase(b, i)">
                  <fa-icon [icon]="icons.minus" />
                </button>
              </div>
            }
            <button class="action" (click)="addCase(b)"><fa-icon [icon]="icons.plus" /> Add case</button>
            <label class="check">
              <input type="checkbox" [checked]="b.default !== null" (change)="toggleDefault(b)" />
              <span>Default branch</span>
            </label>
          </div>
        }
      } @else {
        <label class="field">
          <span><fa-icon [icon]="icons.title" /> Diagram title</span>
          <input [value]="store.diagram().title" (change)="store.setTitle($any($event.target).value)" />
        </label>
        <p class="empty">
          @if (store.selection()?.type === 'slot') {
            Empty branch selected — use <em>Insert</em> in the toolbar to add a block here.
          } @else {
            Select a block in the diagram to edit its properties. New blocks are inserted after the selection.
          }
        </p>
      }
    </div>
  `,
  styleUrl: './inspector.component.css',
})
export class InspectorComponent {
  readonly store = inject(DiagramStore);
  readonly icons = ICONS;
  readonly blockIcons = BLOCK_ICONS;
  readonly labels = BLOCK_LABELS;

  readonly block = this.store.selectedBlock;
  readonly text = computed(() => {
    const b = this.block();
    return b ? primaryText(b) : '';
  });
  readonly textLabel = computed(() => {
    switch (this.block()?.kind) {
      case 'if':
      case 'while':
      case 'doWhile':
        return 'Condition';
      case 'switch':
        return 'Expression';
      case 'for':
        return 'Loop header';
      case 'call':
        return 'Procedure call';
      case 'exit':
        return 'Exit / return statement';
      default:
        return 'Text';
    }
  });
  readonly convertible = computed<BlockKind[]>(() => {
    const k = this.block()?.kind;
    if (!k) return [];
    if (SIMPLE.includes(k)) return SIMPLE;
    if (LOOPS.includes(k)) return LOOPS;
    return [k];
  });

  setText(b: Block, value: string): void {
    const v = value.replace(/\s*\n\s*/g, ' ').trim();
    if (v !== primaryText(b)) this.store.updateBlock(b.id, (x) => withPrimaryText(x, v));
  }

  convert(b: Block, kind: BlockKind): void {
    if (b.kind === kind) return;
    const text = primaryText(b);
    this.store.updateBlock(b.id, (x): Block => {
      if (kind === 'statement' || kind === 'call' || kind === 'exit') return { id: x.id, kind, text };
      const body = 'body' in x ? x.body : [];
      if (kind === 'for') return { id: x.id, kind, header: text, body };
      return { id: x.id, kind: kind as 'while' | 'doWhile', condition: text, body };
    });
  }

  swapBranches(b: Block): void {
    this.store.updateBlock(b.id, (x) => (x.kind === 'if' ? { ...x, then: x.else, else: x.then } : x));
  }

  private updateSwitch(b: SwitchBlock, fn: (s: SwitchBlock) => SwitchBlock): void {
    this.store.updateBlock(b.id, (x) => (x.kind === 'switch' ? fn(x) : x));
  }

  setCaseLabel(b: SwitchBlock, i: number, label: string): void {
    this.updateSwitch(b, (s) => ({ ...s, cases: s.cases.map((c, j) => (j === i ? { ...c, label: label.trim() } : c)) }));
  }

  addCase(b: SwitchBlock): void {
    this.updateSwitch(b, (s) => ({
      ...s,
      cases: [...s.cases, { id: newId(), label: String(s.cases.length + 1), body: [] }],
    }));
  }

  removeCase(b: SwitchBlock, i: number): void {
    this.updateSwitch(b, (s) => ({ ...s, cases: s.cases.filter((_, j) => j !== i) }));
  }

  toggleDefault(b: SwitchBlock): void {
    this.updateSwitch(b, (s) => ({ ...s, default: s.default ? null : [] }));
  }
}
