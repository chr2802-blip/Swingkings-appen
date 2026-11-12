/** An invitation link's token is a secret in the path; analytics hears only that a link was opened. */
export function scrubUrl(url: string) {
  return url.replace(/\/join\/[^/?#]+/, "/join/[token]");
}
