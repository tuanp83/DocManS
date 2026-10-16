import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("chạy được test giao diện", () => {
  render(<p>xin chào</p>);
  expect(screen.getByText("xin chào")).toBeInTheDocument();
});
