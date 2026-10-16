import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePaging, type PaginationTemplate } from "@/hooks/usePaging";

import { ListPager } from "./list-pager";

// The pager reads the two app.* settings through the public-config query; the
// query itself is covered elsewhere, so here it is simply answered.
const config = vi.hoisted(() => ({
  value: {} as { pageSize?: number; paginationTemplate?: string },
}));
vi.mock("@/app/useAppConfig", () => ({
  useAppConfig: () => ({ data: config.value }),
}));

// jsdom has no IntersectionObserver. This one hands its callback back so a test
// can say "the sentinel came into view".
const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
class FakeIO {
  constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
    observers.push(cb);
  }
  observe() {}
  disconnect() {}
}

/** The list, reduced to what a pager needs: a row count and the paging state. */
function Harness({ total }: { total: number }) {
  const paging = usePaging();
  return (
    <>
      <span data-testid="asked">
        {paging.page}:{paging.pageSize}
      </span>
      <ListPager paging={paging} total={total} />
    </>
  );
}

function setup(template: PaginationTemplate, pageSize = 10) {
  config.value = { pageSize, paginationTemplate: template };
}

beforeEach(() => {
  observers.length = 0;
  config.value = {};
  vi.stubGlobal("IntersectionObserver", FakeIO);
});

describe("ListPager", () => {
  it("defaults to numbered pages when the setting is missing or unknown", () => {
    config.value = { paginationTemplate: "carousel" };
    render(<Harness total={45} />);
    // 10 rows a page, the console's built-in default.
    expect(screen.getByTestId("asked")).toHaveTextContent("1:10");
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
  });

  it("asks for the configured number of rows", () => {
    setup("numbered", 25);
    render(<Harness total={100} />);
    expect(screen.getByTestId("asked")).toHaveTextContent("1:25");
  });

  it("numbered: moving to a page asks for that page", async () => {
    setup("numbered");
    const user = userEvent.setup();
    render(<Harness total={45} />);
    await user.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByTestId("asked")).toHaveTextContent("3:10");
  });

  it("prev_next: no page numbers, just the two steps", async () => {
    setup("prev_next");
    const user = userEvent.setup();
    render(<Harness total={45} />);
    expect(screen.queryByRole("button", { name: "3" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sau|next/i }));
    expect(screen.getByTestId("asked")).toHaveTextContent("2:10");
  });

  it("load_more: the window grows instead of the page moving", async () => {
    setup("load_more");
    const user = userEvent.setup();
    render(<Harness total={45} />);
    expect(screen.getByTestId("asked")).toHaveTextContent("1:10");
    await user.click(screen.getByRole("button", { name: /xem thêm|load more/i }));
    // Still page one: one query describes the whole view.
    expect(screen.getByTestId("asked")).toHaveTextContent("1:20");
  });

  it("load_more: nothing to offer once the window holds everything", () => {
    setup("load_more", 50);
    render(<Harness total={45} />);
    expect(screen.queryByTestId("list-pager")).not.toBeInTheDocument();
  });

  it("infinite: reaching the sentinel grows the window", () => {
    setup("infinite");
    render(<Harness total={45} />);
    expect(observers).toHaveLength(1);
    act(() => observers[0]([{ isIntersecting: true }]));
    expect(screen.getByTestId("asked")).toHaveTextContent("1:20");
  });

  it("says so at the ceiling instead of offering a button that does nothing", async () => {
    // 100 rows is what every admin list endpoint clamps to.
    setup("load_more", 50);
    const user = userEvent.setup();
    render(<Harness total={500} />);
    await user.click(screen.getByRole("button", { name: /xem thêm|load more/i }));
    expect(screen.getByTestId("asked")).toHaveTextContent("1:100");
    expect(
      screen.queryByRole("button", { name: /xem thêm|load more/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tối đa 100|at most 100/i)).toBeInTheDocument();
  });
});
