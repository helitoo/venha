"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const renderPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 4) {
        pages.push("ellipsis-1");
      }

      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 3) {
        pages.push("ellipsis-2");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 my-6 flex-wrap">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Trước</span>
      </button>

      <div className="flex items-center gap-1">
        {renderPageNumbers().map((item, idx) => {
          if (typeof item === "string") {
            return (
              <span
                key={idx}
                className="px-2 py-1 text-slate-400 dark:text-slate-500 select-none text-xs sm:text-sm"
              >
                ...
              </span>
            );
          }

          const isActive = item === currentPage;
          return (
            <button
              key={idx}
              onClick={() => onPageChange(item)}
              className={`min-w-[32px] sm:min-w-[36px] h-8 sm:h-9 px-2 flex items-center justify-center rounded-lg text-xs sm:text-sm font-medium transition ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm font-semibold"
                  : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        <span className="hidden sm:inline">Sau</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
