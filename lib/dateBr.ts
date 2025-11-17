export function parseFlexibleToDate(input: string | Date | null | undefined): Date | null {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, yearString, monthString, dayString] = isoMatch;
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
    return null;
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dayString, monthString, yearString] = slashMatch;
    const day = Number(dayString);
    const month = Number(monthString);
    const year = Number(yearString);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
    return null;
  }

  const dashMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dashMatch) {
    const [, dayString, monthString, yearString] = dashMatch;
    const day = Number(dayString);
    const month = Number(monthString);
    const year = Number(yearString);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date;
    }
    return null;
  }

  return null;
}

export function formatBR(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? (Number.isNaN(value.getTime()) ? null : value) : parseFlexibleToDate(value);

  if (!date) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function parseStrictBrDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [dayString, monthString, yearString] = trimmed.split('/');
  if (!dayString || !monthString || !yearString) {
    return null;
  }

  const day = Number(dayString);
  const monthIndex = Number(monthString) - 1;
  const year = Number(yearString);

  if (!Number.isInteger(day) || !Number.isInteger(monthIndex + 1) || !Number.isInteger(year)) {
    return null;
  }

  const candidate = new Date(year, monthIndex, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== monthIndex ||
    candidate.getDate() !== day ||
    Number.isNaN(candidate.getTime())
  ) {
    return null;
  }

  return candidate;
}
