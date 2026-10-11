import { Tabs } from "@/components/ui";

export function FinesTabs({ current }: { current: string }) {
  return (
    <Tabs
      current={current}
      items={[
        { href: "/boder", label: "Bødekassen" },
        { href: "/boder/udfordringer", label: "Udfordringer" },
        { href: "/boder/katalog", label: "Bødekatalog" },
      ]}
    />
  );
}
