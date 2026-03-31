export const USER_FLAG_SUSPENDED = 1;
export const USER_FLAG_DELETED = 2;
export const USER_FLAG_BANNED = 4;

export function hasFlag(
  flags: number | null | undefined,
  mask: number
): boolean {
  return ((flags ?? 0) & mask) === mask;
}
