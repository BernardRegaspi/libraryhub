export const instant = false;

import { AccessDenied, ModuleFrame } from "@/components/layout/module-frame";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { gatePage } from "@/lib/auth/session";

const INVENTORY_DESCRIPTION =
  "Plan a stocktake session by department, scan barcodes, and review exceptions.";

export default async function InventoryPage() {
  const gate = await gatePage("inventory.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }

  const { me } = gate;
  const needsDepartment = me.active_department_id === null;

  return (
    <>
      <ModuleFrame
        eyebrow="Library"
        title="Inventory & stocktaking"
        description={INVENTORY_DESCRIPTION}
        hideModuleSentence={needsDepartment}
      />
      {needsDepartment ? (
        <div className="flex justify-center px-6 pb-8 lg:px-8">
          <Card className="w-full max-w-md text-center">
            <CardHeader className="items-center">
              <CardTitle className="text-base font-semibold">
                Choose a department
              </CardTitle>
              <CardDescription className="text-balance">
                Inventory sessions run against one department at a time. Use
                the department selector in the top bar.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      ) : null}
    </>
  );
}