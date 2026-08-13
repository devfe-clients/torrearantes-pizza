import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel de pedidos — Pizzaria Torre Arantes" },
      {
        name: "description",
        content: "Gestão de pedidos, cardápio e impressão automática da Pizzaria Torre Arantes.",
      },
      { property: "og:title", content: "Painel de pedidos — Pizzaria Torre Arantes" },
      { property: "og:description", content: "Área administrativa da pizzaria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <AdminPage />
    </ClientOnly>
  ),
});
