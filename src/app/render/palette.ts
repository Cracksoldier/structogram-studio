import { CellRole, TextRole } from '../layout/layout';

export interface Palette {
  name: 'dark' | 'light';
  background: string;
  stroke: string;
  accent: string;
  fill: Record<CellRole, string>;
  text: Record<TextRole, string>;
}

export const DARK: Palette = {
  name: 'dark',
  background: '#0b1324',
  stroke: '#3d5f93',
  accent: '#4fc3f7',
  fill: {
    statement: '#13203a',
    call: '#152744',
    exit: '#1a2342',
    cond: '#183052',
    loop: '#142a48',
    empty: '#0f1a30',
    title: '#10244a',
  },
  text: {
    text: '#dce7ff',
    label: '#8fb4e8',
    title: '#eaf3ff',
    placeholder: '#4a6490',
  },
};

export const LIGHT: Palette = {
  name: 'light',
  background: '#ffffff',
  stroke: '#2a4a7a',
  accent: '#1d8fd1',
  fill: {
    statement: '#ffffff',
    call: '#f3f7fd',
    exit: '#f6f5fd',
    cond: '#eaf2fc',
    loop: '#edf4fb',
    empty: '#fafcff',
    title: '#dde9f8',
  },
  text: {
    text: '#0f1d33',
    label: '#3f6aa6',
    title: '#0b1a33',
    placeholder: '#9fb3d1',
  },
};
