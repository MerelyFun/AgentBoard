import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { getPagination, type PageRange } from '../domain/pagination';
import './pagination.css';

/** Live reports preserve the current page. An explicit view change starts a new browse. */
export function usePagination(totalItems: number, pageSize: number, viewKey = '') {
  const [selection, setSelection] = useState({ viewKey, pageSize, page: 1 });
  const changedView = selection.viewKey !== viewKey || selection.pageSize !== pageSize;
  const pagination = getPagination(totalItems, changedView ? 1 : selection.page, pageSize);
  if (changedView || selection.page !== pagination.page) {
    setSelection({ viewKey, pageSize, page: pagination.page });
  }
  return { ...pagination, setPage: (page: number) => {
    setSelection({ viewKey, pageSize, page: getPagination(totalItems, page, pageSize).page });
  } };
}

interface PaginationProps extends Pick<PageRange, 'page' | 'pageCount' | 'totalItems' | 'from' | 'to'> {
  onPageChange: (page: number) => void;
  label?: string;
  itemLabel?: string;
}

export function Pagination({ page, pageCount, totalItems, from, to, onPageChange,
  label = '执行分页', itemLabel = '个执行' }: PaginationProps) {
  const selectId = useId();
  return <nav className="pagination" aria-label={label}>
    <p className="pagination-range" aria-live="polite" aria-atomic="true">
      {totalItems ? `显示 ${from}–${to} / 共 ${totalItems} ${itemLabel}` : `共 0 ${itemLabel}`}
    </p>
    <div className="pagination-controls">
      <button type="button" className="pagination-button" disabled={page <= 1} aria-label="第一页" title="第一页" onClick={() => onPageChange(1)}><ChevronsLeft size={16} aria-hidden="true" /></button>
      <button type="button" className="pagination-button" disabled={page <= 1} aria-label="上一页" title="上一页" onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <label className="pagination-select-label" htmlFor={selectId}><span className="pagination-select-caption">页码</span>
        <select id={selectId} aria-label={`${label}页码`} value={page} onChange={(event) => onPageChange(Number(event.target.value))}>
          {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>第 {index + 1} / {pageCount} 页</option>)}
        </select>
      </label>
      <button type="button" className="pagination-button" disabled={page >= pageCount} aria-label="下一页" title="下一页" onClick={() => onPageChange(page + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
      <button type="button" className="pagination-button" disabled={page >= pageCount} aria-label="最后一页" title="最后一页" onClick={() => onPageChange(pageCount)}><ChevronsRight size={16} aria-hidden="true" /></button>
    </div>
  </nav>;
}
