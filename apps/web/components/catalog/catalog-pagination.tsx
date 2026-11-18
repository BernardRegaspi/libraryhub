"use client";

import { pageItems } from "@/lib/catalog/page-items";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export type CatalogPaginationProps = {
  page: number;
  total: number | null;
  perPage: number;
  hasNext: boolean;
  onPage: (page: number) => void;
};

export function CatalogPagination({
  page,
  total,
  perPage,
  hasNext,
  onPage,
}: CatalogPaginationProps) {
  if (total === 0) {
    return null;
  }

  const count =
    total !== null && total > 0 ? Math.ceil(total / perPage) : null;

  const prevDisabled = page <= 1;
  const nextDisabled = count !== null ? page >= count : !hasNext;

  const items = count !== null ? pageItems(page, count) : [];

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            disabled={prevDisabled}
            onClick={(event) => {
              event.preventDefault();
              if (!prevDisabled) {
                onPage(page - 1);
              }
            }}
          />
        </PaginationItem>
        {count !== null
          ? items.map((item, index) => (
              <PaginationItem
                key={item === "ellipsis" ? `ellipsis-${index}` : item}
              >
                {item === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    onClick={(event) => {
                      event.preventDefault();
                      onPage(item);
                    }}
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))
          : null}
        <PaginationItem>
          <PaginationNext
            href="#"
            disabled={nextDisabled}
            onClick={(event) => {
              event.preventDefault();
              if (!nextDisabled) {
                onPage(page + 1);
              }
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}