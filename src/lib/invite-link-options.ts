/**
 * How long an invitation link lasts and how many people it may bring in, as the admin
 * can choose. Its own file so the form can import it without the server's crypto.
 */
export const LINK_DAYS = [1, 7, 14, 30] as const;
export const LINK_MAX_USES = [1, 5, 15, 30, 50] as const;
export const DEFAULT_LINK_DAYS = 7;
export const DEFAULT_LINK_MAX_USES = 30;
