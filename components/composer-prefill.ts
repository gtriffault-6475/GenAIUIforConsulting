// Story 5.6 — lets a component outside the composer (the presentation
// proposal card's "Ajuster") put a text in the composer and focus it,
// without lifting the composer's state: a window event the mounted
// `Composer` listens to.
export const COMPOSER_PREFILL_EVENT = 'composer:prefill';

export function prefillComposer(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(COMPOSER_PREFILL_EVENT, { detail: text }));
}
