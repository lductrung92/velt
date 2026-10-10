import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AvatarCard } from "../components/AvatarCard";

// Route-driven tabs: each tab is its own URL (deep-linkable + refresh-safe),
// unlike the in-tab view stack in layout.md §6. The Tabs primitive renders the
// bar; the active panel comes from <Outlet/> (the child route), not TabsContent.
const ACCOUNT_TABS = [
  {
    value: "profile",
    path: "/account/profile",
    labelKey: "account.tabs.profile",
  },
  {
    value: "password",
    path: "/account/password",
    labelKey: "account.tabs.password",
  },
  { value: "2fa", path: "/account/2fa", labelKey: "account.tabs.security" },
] as const;

export default function AccountLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const active =
    ACCOUNT_TABS.find((tab) => pathname.startsWith(tab.path))?.value ??
    "profile";

  return (
    <div className="space-y-3">
      <PageHeader title={t("account.title")} subtitle={t("account.subtitle")} />
      <div className="grid gap-5 md:grid-cols-3">
        {/* Left (1/3): avatar + identity */}
        <div className="md:col-span-1">
          <AvatarCard />
        </div>

        {/* Right (2/3): tab bar + active panel */}
        <div className="space-y-4 md:col-span-2">
          <Tabs
            value={active}
            onValueChange={(value) => {
              const tab = ACCOUNT_TABS.find((x) => x.value === value);
              if (tab) navigate(tab.path);
            }}
          >
            <TabsList>
              {ACCOUNT_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {t(tab.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
