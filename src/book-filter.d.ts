export type BookFilter = {
  title: string;
  author: string;
  description: string;
  genres: string[];
  moods: string[];
  minimumRating: number | null;
};

export type FacetOption = { value: string; normalized: string; count: number };

export const EMPTY_BOOK_FILTER: Readonly<BookFilter>;
export function normalizeFilterText(value: unknown): string;
export function sanitizeBookFilter(value: unknown): BookFilter;
export function hasActiveBookFilter(value: unknown): boolean;
export function filterBooks<T>(books: readonly T[], value: unknown): T[];
export function collectFacetOptions<T>(books: readonly T[], property: keyof T): FacetOption[];
