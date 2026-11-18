export const instant = false;

import { Suspense } from "react";

import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function CatalogPage() {
  const gate = await gatePage("catalog.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <Suspense fallback={null}>
      <CatalogBrowser />
    </Suspense>
  );
}