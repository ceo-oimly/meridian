/** Result of a server action. `error` is a key under "Wallet.errors" (or "Admin.errors" for admin forms). */
export interface ActionState {
  ok?: boolean;
  error?: string;
  attemptsLeft?: number;
  /** Extra text to show on success (for example a new card's details, shown once). */
  info?: string;
}
