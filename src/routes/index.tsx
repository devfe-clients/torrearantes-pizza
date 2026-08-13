import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { MenuPage } from "@/components/menu/MenuPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pizzaria Torre Arantes — Cardápio Digital e Delivery" },
      {
        name: "description",
        content:
          "Peça online na Pizzaria Torre Arantes: pizzas artesanais, esfihas e bebidas com entrega rápida. Pague por PIX, cartão ou dinheiro na entrega.",
      },
      { property: "og:title", content: "Pizzaria Torre Arantes — Cardápio Digital" },
      {
        property: "og:description",
        content: "Pizzas artesanais com entrega quentinha. Peça pelo cardápio digital.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <MenuPage />
    </ClientOnly>
  ),
});
