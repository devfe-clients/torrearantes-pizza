import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AuthPage } from "@/components/admin/AuthPage";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso restrito — Pizzaria Torre Arantes" },
      {
        name: "description",
        content: "Login da equipe da Pizzaria Torre Arantes para o painel de pedidos.",
      },
      { property: "og:title", content: "Acesso restrito — Pizzaria Torre Arantes" },
      { property: "og:description", content: "Login da equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <AuthPage />
    </ClientOnly>
  ),
});
