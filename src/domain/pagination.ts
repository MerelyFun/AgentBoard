export interface PageRange {
  page: number;
  pageSize: number;
  pageCount: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  from: number;
  to: number;
}

/** One-based navigation and zero-based slice bounds, including empty and shrinking data. */
export function getPagination(totalItems: number, requestedPage = 1, pageSize = 20): PageRange {
  const total = Number.isFinite(totalItems) ? Math.max(0, Math.floor(totalItems)) : 0;
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(pageCount, Math.max(1, requested));
  const startIndex = (page - 1) * size;
  const endIndex = Math.min(total, startIndex + size);
  return { page, pageSize: size, pageCount, totalItems: total, startIndex, endIndex,
    from: total ? startIndex + 1 : 0, to: endIndex };
}
