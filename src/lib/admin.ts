import { getCurrentUser } from "./session";

/**
 * Returns the signed-in user only if they are an administrator, otherwise null.
 * EVERY admin server action must call this itself: hiding a page is not access control.
 */
export async function getAdmin() {
  const user = await getCurrentUser();
  return user && user.role === "ADMIN" ? user : null;
}
