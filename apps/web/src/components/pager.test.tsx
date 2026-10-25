import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberedPager, pageNumbers } from "./pager";

describe("pageNumbers", () => {
  it("shows each page when there are 7 pages or less", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows the first page, the pages next to the current one, and the last page, with a gap between them", () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]);
    expect(pageNumbers(6, 10)).toEqual([1, "gap", 5, 6, 7, "gap", 10]);
    expect(pageNumbers(10, 10)).toEqual([1, "gap", 6, 7, 8, 9, 10]);
  });
});

describe("NumberedPager", () => {
  it("marks the current page, and a click on a number or on Next opens that page", async () => {
    const onPage = vi.fn();
    render(<NumberedPager label="User pages" page={2} pageCount={3} onPage={onPage} />);
    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Page 3" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPage.mock.calls).toEqual([[3], [3], [1]]);
  });

  it("shows nothing for a list with one page", () => {
    const { container } = render(<NumberedPager label="User pages" page={1} pageCount={1} onPage={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
