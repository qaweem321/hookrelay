import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmButton, SubmitButton } from "./buttons";
import { HourlyChart } from "./HourlyChart";
import { StatusBadge } from "./ui";

describe("SubmitButton", () => {
  it("is disabled and says Saving... while pending", () => {
    const { rerender } = render(<SubmitButton pending={false}>Save</SubmitButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    rerender(<SubmitButton pending>Save</SubmitButton>);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});

describe("ConfirmButton", () => {
  it("asks before running a destructive action", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton
        label="Delete"
        title="Delete it?"
        message="Are you sure?"
        confirmLabel="Yes, delete"
        pending={false}
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete it?" })).toHaveTextContent("Are you sure?");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    render(
      <ConfirmButton
        label="Delete"
        title="Delete it?"
        message="Sure?"
        confirmLabel="Delete"
        pending={false}
        onConfirm={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("uses plain words", () => {
    render(<StatusBadge status="dead" count={3} />);
    expect(screen.getByText("3 Failed")).toBeInTheDocument();
  });
});

describe("HourlyChart", () => {
  it("labels each hour for screen readers and tooltips", () => {
    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: new Date(Date.UTC(2026, 9, 16, i)).toISOString(),
      events: i === 5 ? 4 : 0,
      succeeded: i === 5 ? 3 : 0,
      failed: i === 5 ? 1 : 0,
    }));
    render(<HourlyChart hourly={hourly} />);
    expect(screen.getByRole("img", { name: /last 24 hours/ })).toBeInTheDocument();
    expect(screen.getByText("05:00 UTC: 4 received, 3 delivered, 1 failed")).toBeInTheDocument();
  });
});
