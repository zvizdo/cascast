import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Select } from "@/components/shared/Select";

describe("Select", () => {
  const options = [
    { value: "base", label: "Base" },
    { value: "mid", label: "Mid" },
    { value: "summit", label: "Summit" },
  ];

  it("renders a native select with the aria-label and current value selected", () => {
    render(
      <Select
        ariaLabel="Elevation band"
        value="summit"
        onChange={() => {}}
        options={options}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Elevation band" });
    expect(select.tagName).toBe("SELECT");
    expect((select as HTMLSelectElement).value).toBe("summit");
  });

  it("renders an option per item", () => {
    render(<Select value="base" onChange={() => {}} options={options} />);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("calls onChange with the chosen value", () => {
    const onChange = vi.fn();
    render(
      <Select ariaLabel="Elevation band" value="summit" onChange={onChange} options={options} />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Elevation band" }), {
      target: { value: "base" },
    });
    expect(onChange).toHaveBeenCalledWith("base");
  });
});
