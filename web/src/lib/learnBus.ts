import type { LearnView } from './api';

/** Tiny event bus: an idea-check choice tells the "Déclaré et révélé" block to update at once. */
type Listener = (learn: LearnView | null) => void;
const listeners = new Set<Listener>();
export const onLearnUpdate = (l: Listener) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const emitLearnUpdate = (learn: LearnView | null) => listeners.forEach((l) => l(learn));
