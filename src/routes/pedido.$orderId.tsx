import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { OrderStatusPage } from "@/components/order/OrderStatusPage";

export const Route = createFileRoute("/pedido/$orderId")({
  head: () => ({
    meta: [
      { title: "Acompanhe seu pedido — Pizzaria Torre Arantes" },
      {
        name: "description",
        content: "Acompanhe em tempo real o status do seu pedido na Pizzaria Torre Arantes.",
      },
      { property: "og:title", content: "Acompanhe seu pedido — Pizzaria Torre Arantes" },
      { property: "og:description", content: "Status do pedido em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { orderId } = Route.useParams();
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <OrderStatusPage orderId={orderId} />
    </ClientOnly>
  );
}
