"use client";

import Link from "next/link";

import { titleGroups } from "@/lib/catalog/group-titles";
import {
  serializeCatalogSearch,
  type CatalogSearchState,
} from "@/lib/catalog/search-params";
import type { CatalogHit } from "@/lib/catalog/types";

export type CatalogResultsProps = {
  hits: CatalogHit[];
  pending: boolean;
  view: CatalogSearchState["view"];
  sort: string;
  state: CatalogSearchState;
};

function HitTitle({
  hit,
  state,
  className,
}: {
  hit: CatalogHit;
  state: CatalogSearchState;
  className?: string;
}) {
  if (hit.biblio_id == null || hit.title == null) {
    return hit.title != null ? (
      <span className={className}>{hit.title}</span>
    ) : null;
  }
  const href = `/catalog/${hit.biblio_id}?${serializeCatalogSearch(state)}`;
  return (
    <Link href={href} className={className}>
      {hit.title}
    </Link>
  );
}

function CoverCard({ hit, state }: { hit: CatalogHit; state: CatalogSearchState }) {
  const inner = (
    <>
      {hit.has_cover && hit.biblio_id != null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/v1/catalog/biblios/${hit.biblio_id}/cover`}
          alt=""
          className="aspect-[3/4] w-full rounded-md object-cover"
        />
      ) : (
        <div
          className="aspect-[3/4] w-full rounded-md bg-muted"
          aria-hidden
        />
      )}
      {hit.title != null ? (
        <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
          {hit.title}
        </p>
      ) : null}
      {hit.author != null ? (
        <p className="text-xs text-muted-foreground">{hit.author}</p>
      ) : null}
    </>
  );

  if (hit.biblio_id == null) {
    return (
      <article className="flex flex-col transition hover:-translate-y-0.5 hover:shadow-sm">
        {inner}
      </article>
    );
  }

  const href = `/catalog/${hit.biblio_id}?${serializeCatalogSearch(state)}`;
  return (
    <Link
      href={href}
      className="flex flex-col transition hover:-translate-y-0.5 hover:shadow-sm"
    >
      {inner}
    </Link>
  );
}

function ListRow({ hit, state }: { hit: CatalogHit; state: CatalogSearchState }) {
  return (
    <article className="rounded-lg border border-border bg-card px-4 py-3">
      <HitTitle
        hit={hit}
        state={state}
        className="font-medium text-primary hover:underline"
      />
      <dl className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {hit.author != null ? (
          <div>
            <dt className="sr-only">Author</dt>
            <dd>{hit.author}</dd>
          </div>
        ) : null}
        {hit.edition != null ? (
          <div>
            <dt className="sr-only">Edition</dt>
            <dd>{hit.edition}</dd>
          </div>
        ) : null}
        {hit.isbn != null ? (
          <div>
            <dt className="sr-only">ISBN</dt>
            <dd>{hit.isbn}</dd>
          </div>
        ) : null}
        {hit.item_type != null ? (
          <div>
            <dt className="sr-only">Item type</dt>
            <dd>{hit.item_type}</dd>
          </div>
        ) : null}
        {hit.publication_year != null ? (
          <div>
            <dt className="sr-only">Year</dt>
            <dd>{hit.publication_year}</dd>
          </div>
        ) : null}
        {hit.availability.label != null ? (
          <div>
            <dt className="sr-only">Availability</dt>
            <dd>{hit.availability.label}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

export function CatalogResults({
  hits,
  pending,
  view,
  sort,
  state,
}: CatalogResultsProps) {
  if (pending) {
    return (
      <p className="text-sm text-muted-foreground">Loading the catalog.</p>
    );
  }

  if (hits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No records matched this search.
      </p>
    );
  }

  const groups = titleGroups(hits, sort);

  if (view === "cover") {
    return (
      <div className="flex flex-col gap-6">
        {groups.map((group, groupIndex) => (
          <section key={group.letter ?? `group-${groupIndex}`}>
            {group.letter != null ? (
              <h3 className="mb-3 border-b border-border pb-1 text-sm font-medium text-foreground">
                {group.letter}
              </h3>
            ) : null}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.hits.map((hit, index) => (
                <CoverCard
                  key={hit.biblio_id ?? `${groupIndex}-${index}`}
                  hit={hit}
                  state={state}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, groupIndex) => (
        <section key={group.letter ?? `group-${groupIndex}`}>
          {group.letter != null ? (
            <h3 className="mb-3 border-b border-border pb-1 text-sm font-medium text-foreground">
              {group.letter}
            </h3>
          ) : null}
          <ul className="flex flex-col gap-3">
            {group.hits.map((hit, index) => (
              <li key={hit.biblio_id ?? `${groupIndex}-${index}`}>
                <ListRow hit={hit} state={state} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}