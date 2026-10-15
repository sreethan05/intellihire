import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "../components/ThemeToggle";

const mockSetTheme = vi.fn();
let currentTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: currentTheme,
    setTheme: mockSetTheme,
  }),
}));

describe("ThemeToggle Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTheme = "light";
  });

  it("renders light, dark, and system theme buttons", () => {
    render(<ThemeToggle />);

    expect(screen.getByTitle("Light Mode")).toBeInTheDocument();
    expect(screen.getByTitle("Dark Mode")).toBeInTheDocument();
    expect(screen.getByTitle("System Theme")).toBeInTheDocument();
  });

  it("switches theme when theme buttons are clicked", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByTitle("Dark Mode"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");

    fireEvent.click(screen.getByTitle("System Theme"));
    expect(mockSetTheme).toHaveBeenCalledWith("system");

    fireEvent.click(screen.getByTitle("Light Mode"));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
