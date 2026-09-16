/** Shared active-route matching for primary nav and account links. */

export type NavMatchItem = {
  href: string;
  match?: (path: string) => boolean;
};

export function isNavActive(path: string, item: NavMatchItem): boolean {
  if (item.match) return item.match(path);
  return path === item.href || path.startsWith(`${item.href}/`);
}

export const primaryNavMatchers = {
  members: (p: string) => p === "/uyeler" || p.startsWith("/u/"),
  community: (p: string) => p === "/topluluk" || p.startsWith("/topluluk/"),
  episodes: (p: string) => p === "/bolumler" || p.startsWith("/bolumler/"),
  jobs: (p: string) => p === "/is-ilanlari" || p.startsWith("/is-ilanlari/"),
  arayanlar: (p: string) => p === "/arayanlar" || p.startsWith("/arayanlar/"),
} as const;
