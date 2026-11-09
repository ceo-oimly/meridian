// Shared Tailwind class strings (a plain module so server and client components can both import it).
export const inputClass = "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";
export const buttonClass =
  "rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60";
export const darkButtonClass =
  "rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-60";
export const ghostButtonClass =
  "rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition hover:bg-paper disabled:opacity-60";
export const dangerButtonClass =
  "rounded-full border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20 disabled:opacity-60";
export const panelClass = "rounded-2xl border border-line bg-card p-6";
