import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONS } from '../../icons';

@Component({
  selector: 'nsd-help-dialog',
  imports: [FaIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="close.emit()">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Help" (click)="$event.stopPropagation()">
        <header>
          <h2><fa-icon [icon]="icons.book" /> Quick reference</h2>
          <button class="x" title="Close (Esc)" (click)="close.emit()"><fa-icon [icon]="icons.close" /></button>
        </header>
        <div class="cols">
          <section>
            <h3><fa-icon [icon]="icons.terminal" /> Pseudo-code syntax</h3>
            <pre>{{ syntax }}</pre>
            <p>
              Blocks open with <code>{{ '{' }}</code> at the end of a line and close with <code>{{ '}' }}</code> on
              their own line. Any other line is a plain statement. Wrap text in <code>"quotes"</code> if it starts with a keyword.
              Lines starting with <code>#</code> or <code>//</code> are comments.
            </p>
          </section>
          <section>
            <h3><fa-icon [icon]="icons.keyboard" /> Keyboard</h3>
            <table>
              @for (k of keys; track k[0]) {
                <tr>
                  <td><kbd>{{ k[0] }}</kbd></td>
                  <td>{{ k[1] }}</td>
                </tr>
              }
            </table>
          </section>
        </div>
      </div>
    </div>
  `,
  styleUrl: './help-dialog.component.css',
})
export class HelpDialogComponent {
  readonly close = output<void>();
  readonly icons = ICONS;
  readonly syntax = `title "My algorithm"

# statement
read n
# sub-procedure
call init(n)
# exit / break
exit return result

if n > 0 {
  print "positive"
} else if n < 0 {
  print "negative"
} else {
  print "zero"
}

switch op {
  case + {
    r := a + b
  }
  default {
    error
  }
}

# pre-test loop
while i < n {
  i := i + 1
}
for i := 1 to n {
  sum := sum + i
}
# post-test loop
do {
  read x
} while x < 0`;

  readonly keys: [string, string][] = [
    ['Click', 'Select block / empty branch'],
    ['Double-click · F2', 'Edit text in place'],
    ['1 – 8', 'Insert Step, Call, Exit, If, Switch, While, Do, For'],
    ['↑ / ↓', 'Select previous / next sibling'],
    ['Alt + ↑ / ↓', 'Move block up / down'],
    ['Del', 'Delete block'],
    ['Ctrl + C / X / V', 'Copy / cut / paste'],
    ['Ctrl + D', 'Duplicate'],
    ['Ctrl + Z / Y', 'Undo / redo'],
    ['Ctrl + S', 'Save as JSON'],
    ['Ctrl + wheel', 'Zoom'],
    ['Esc', 'Clear selection'],
  ];
}
