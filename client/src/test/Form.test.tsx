import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from "../components/ui/form";
import { Input } from "../components/ui/input";

const schema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
});

type FormValues = z.infer<typeof schema>;

function TestFormComponent({ onSubmit }: { onSubmit: (data: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>Choose a unique handle.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

function InvalidUsageComponent() {
  useFormField();
  return null;
}

describe("Form Component", () => {
  it("renders labels, inputs, descriptions correctly", () => {
    render(<TestFormComponent onSubmit={() => {}} />);

    expect(screen.getByText("Username")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter username")).toBeInTheDocument();
    expect(screen.getByText("Choose a unique handle.")).toBeInTheDocument();
  });

  it("validates form input with zod and displays error message", async () => {
    render(<TestFormComponent onSubmit={() => {}} />);

    const input = screen.getByPlaceholderText("Enter username");
    const submitBtn = screen.getByText("Submit");

    // Enter invalid short input
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Username must be at least 3 characters")).toBeInTheDocument();
    });
  });

  it("submits valid form data successfully", async () => {
    let submittedData: FormValues | null = null;
    render(<TestFormComponent onSubmit={(data) => { submittedData = data; }} />);

    const input = screen.getByPlaceholderText("Enter username");
    const submitBtn = screen.getByText("Submit");

    fireEvent.change(input, { target: { value: "valid_user" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submittedData).toEqual({ username: "valid_user" });
    });
    expect(screen.queryByText("Username must be at least 3 characters")).not.toBeInTheDocument();
  });

  it("throws descriptive error when useFormField is used outside FormField", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<InvalidUsageComponent />);
    }).toThrow("useFormField should be used within <FormField>");

    consoleSpy.mockRestore();
  });
});
