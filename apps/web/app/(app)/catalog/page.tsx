export const instant = false;

import Link from "next/link";

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import { Button } from "@/components/ui/button";
import { gatePage } from "@/lib/auth/session";

export default async function CatalogPage() {
  const gate = await gatePage("catalog.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  return (
    <ModuleFrame
      eyebrow="Library"
      title="Catalog search"
      description="Search the Koha catalog. Results are fetched from Koha with pagination. The ULMS does not store a copy of the catalog."
      actions={
        <Button
          variant="outline"
          render={
            <Link
              href="https://library.usant.edu.ph/"
              target="_blank"
              rel="noopener"
            />
          }
        >
          Open Koha OPAC
        </Button>
      }
    />
  );
}