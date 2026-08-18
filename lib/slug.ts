/**
 * Slugify. Ported in spirit from the GitScrum original's Helper::slug, minus
 * its global-uniqueness assumption — slugs here are unique per user.
 */
export function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

/**
 * Append -2, -3 … until the slug is free. The caller supplies the set of slugs
 * already taken *within the owning scope*, never globally.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = slugify(base);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
