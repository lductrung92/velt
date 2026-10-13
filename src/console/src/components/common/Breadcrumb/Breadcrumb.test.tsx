import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/app/i18n";
import { PageHeader } from "@/components/common/PageHeader";
import { Breadcrumb } from "./Breadcrumb";

beforeEach(async () => {
  await i18n.changeLanguage("vi");
});
afterEach(async () => {
  await i18n.changeLanguage("vi");
});

describe("Breadcrumb navigation", () => {
  it("takes the user to Overview from a single-page trail", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/cms/articles"]}>
        <Routes>
          <Route
            path="/cms/articles"
            element={<Breadcrumb items={[{ labelKey: "nav.cms_articles" }]} />}
          />
          <Route
            path="/dashboard"
            element={<h1>{i18n.t("dashboard.title")}</h1>}
          />
        </Routes>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", {
      name: i18n.t("common.breadcrumbs"),
    });
    expect(within(nav).getByText(i18n.t("nav.cms_articles"))).toHaveAttribute(
      "aria-current",
      "page",
    );
    await user.click(
      within(nav).getByRole("link", { name: i18n.t("dashboard.title") }),
    );
    expect(
      screen.getByRole("heading", { name: i18n.t("dashboard.title") }),
    ).toBeInTheDocument();
  });

  it("does not duplicate an explicit root and keeps the current page unlinked in English", async () => {
    await i18n.changeLanguage("en");
    render(
      <MemoryRouter>
        <Breadcrumb
          items={[
            { labelKey: "dashboard.title", to: "/dashboard" },
            { labelKey: "nav.cms_articles", to: "/cms/articles" },
          ]}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", {
      name: i18n.t("common.breadcrumbs"),
    });
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
    expect(
      within(nav).getByRole("link", { name: i18n.t("dashboard.title") }),
    ).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByText(i18n.t("nav.cms_articles"))).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("preserves the admin ancestor between Overview and the current page", () => {
    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <PageHeader
          title={i18n.t("nav.users")}
          breadcrumbs={[{ labelKey: "nav.users" }]}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", {
      name: i18n.t("common.breadcrumbs"),
    });
    expect(
      within(nav).getByRole("link", { name: i18n.t("dashboard.title") }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      within(nav).getByRole("link", { name: i18n.t("nav.admin") }),
    ).toHaveAttribute("href", "/admin");
    expect(within(nav).getByText(i18n.t("nav.users"))).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not render a trail when the caller has no breadcrumbs", () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
