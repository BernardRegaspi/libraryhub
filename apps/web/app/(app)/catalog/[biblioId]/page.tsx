export const instant = false;

import { notFound } from "next/navigation";

import { RecordView } from "@/components/catalog/record-view";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

type CatalogRecordPageProps = {
  params: Promise<{ biblioId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function buildBackSearchString(
  raw: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    }
  }
  return params.toString();
}

export default async function CatalogRecordPage({
  params,
  searchParams,
}: CatalogRecordPageProps) {
  const { biblioId } = await params;
  const parsedId = Number.parseInt(biblioId, 10);
  if (!Number.isFinite(parsedId)) {
    notFound();
  }

  const gate = await gatePage("catalog.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const rawSearch = await searchParams;
  const backSearch = buildBackSearchString(rawSearch);

  return <RecordView biblioId={parsedId} searchParams={backSearch} />;
}