import { OrdersBoard } from "@/components/admin/OrdersBoard";
import { adminRestaurant } from "@/lib/admin";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { can } from "@/lib/permissions";

export const metadata = { title: "Commandes en cours" };

export default async function OrdersPage() {
  const { staff, current } = await adminRestaurant("orders.view");
  const printer = await db.printer.findFirst({ where: { restaurantId: current.id, method: "BROWSER", active: true } });
  const paper = printer?.paperWidth === "MM58" ? "58" : printer?.paperWidth === "A4" ? "A4" : "80";
  const config = await getConfig();
  return (
    <OrdersBoard restaurantId={current.id} canUpdate={can(staff.actor, "orders.update", current.id)} defaultPaper={paper} defaultCopies={printer?.copies ?? 1}
      deliveryCopies={config.printing.deliveryCopies} chimeRepeatSeconds={config.printing.chimeRepeatSeconds} />
  );
}
