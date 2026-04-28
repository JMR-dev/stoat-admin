const USER_FLAG_DELETED = 2;
const USER_FLAG_BANNED = 4;

export function hasFlag(flags: number | undefined, mask: number): boolean {
  return ((flags ?? 0) & mask) === mask;
}

export function getUserStatus(
  flags: number | undefined,
  disabled?: boolean
): {
  label: "active" | "banned" | "deleted";
  tone: string;
} {
  if (hasFlag(flags, USER_FLAG_DELETED)) {
    return { label: "deleted", tone: "text-red-800 bg-red-100 border-red-200" };
  }

  if (disabled || hasFlag(flags, USER_FLAG_BANNED)) {
    return {
      label: "banned",
      tone: "text-amber-900 bg-amber-100 border-amber-200"
    };
  }

  return {
    label: "active",
    tone: "text-emerald-900 bg-emerald-100 border-emerald-200"
  };
}

export function getFlagLabels(flags: number | undefined): string[] {
  const labels: string[] = [];

  if (hasFlag(flags, USER_FLAG_BANNED)) {
    labels.push("banned");
  }

  if (hasFlag(flags, USER_FLAG_DELETED)) {
    labels.push("deleted");
  }

  if (labels.length === 0) {
    labels.push("none");
  }

  return labels;
}
