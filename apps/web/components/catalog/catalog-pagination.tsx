"use client";

import { pageItems, type PageItem } from "@/lib/catalog/page-items";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

function openEndedItems(page: number, hasNext: boolean): PageItem[] {
  const items: PageItem[] = [];
  if (page > 2) {
    items.push(1, "ellipsis");
  } else if (page === 2) {
    items.push(1);
  }
  items.push(page);
  if (hasNext) {
    items.push(page + 1, "ellipsis");
  }
  return items;
}

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

  const items: PageItem[] =
    count !== null ? pageItems(page, count) : openEndedItems(page, hasNext);

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
        {items.map((item, index) => (
              <PaginationItem
                key={item === "ellipsis" ? `ellipsis-${index}` : item}
              >
                {item === "ellipsis" ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    href="#"
                    isActive={item === page}
                    className="w-auto min-w-7 px-2 text-xs"
                    onClick={(event) => {
                      event.preventDefault();
                      if (item !== page) {
                        onPage(item);
                      }
                    }}
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
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