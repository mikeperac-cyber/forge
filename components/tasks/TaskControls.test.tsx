// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DeleteTaskButton, TaskForm, TaskStatusButton } from "./TaskControls";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/tasks",
}));

const createTaskAction = vi.fn<
  (data: FormData) => Promise<{ ok: boolean; error?: string }>
>(async () => ({ ok: true }));
const setTaskStatusAction = vi.fn<
  (id: string, status: string) => Promise<{ ok: boolean }>
>(async () => ({ ok: true }));
const deleteTaskAction = vi.fn<(id: string) => Promise<{ ok: boolean }>>(
  async () => ({ ok: true }),
);
const browsePathsAction = vi.fn<(target: string | null) => Promise<unknown>>(
  async () => listing(),
);
vi.mock("@/actions/tasks", () => ({
  createTaskAction: (data: FormData) => createTaskAction(data),
  setTaskStatusAction: (id: string, status: string) =>
    setTaskStatusAction(id, status),
  deleteTaskAction: (id: string) => deleteTaskAction(id),
  browsePathsAction: (target: string | null) => browsePathsAction(target),
}));

function listing(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    listing: {
      dir: "C:\\work",
      parent: "C:\\",
      roots: ["C:\\Users\\me", "C:\\"],
      truncated: false,
      entries: [
        { name: "src", path: "C:\\work\\src", kind: "folder" as const },
        { name: "notes.md", path: "C:\\work\\notes.md", kind: "file" as const },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  browsePathsAction.mockResolvedValue(listing());
});

afterEach(cleanup);

describe("TaskStatusButton", () => {
  it("marks an open task done", async () => {
    render(<TaskStatusButton task={{ id: "t1", status: "open" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark task done" }));

    await waitFor(() =>
      expect(setTaskStatusAction).toHaveBeenCalledWith("t1", "done"),
    );
  });

  it("reopens a done task", async () => {
    render(<TaskStatusButton task={{ id: "t2", status: "done" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Reopen task" }));

    await waitFor(() =>
      expect(setTaskStatusAction).toHaveBeenCalledWith("t2", "open"),
    );
  });
});

describe("DeleteTaskButton", () => {
  it("deletes the task it belongs to", async () => {
    render(<DeleteTaskButton taskId="t3" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));

    await waitFor(() => expect(deleteTaskAction).toHaveBeenCalledWith("t3"));
  });
});

describe("TaskForm", () => {
  it("submits the typed title and the goal", async () => {
    render(<TaskForm goals={[{ id: "g1", title: "Ship it" }]} />);

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Fix the build" },
    });
    fireEvent.change(screen.getByDisplayValue("Not counted"), {
      target: { value: "g1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(1));
    const formData = createTaskAction.mock.calls[0][0];
    expect(formData.get("title")).toBe("Fix the build");
    expect(formData.get("goalId")).toBe("g1");
    expect(formData.get("path")).toBe("");
  });

  it("adds no goal picker when there are no goals", () => {
    render(<TaskForm goals={[]} />);
    expect(screen.queryByDisplayValue("Not counted")).toBeNull();
  });

  it("shows the action's error and keeps the form open", async () => {
    createTaskAction.mockResolvedValueOnce({
      ok: false as never,
      error: "Give the task a title",
    } as never);

    render(<TaskForm goals={[]} />);
    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByText("Give the task a title")).toBeTruthy();
  });
});

describe("path picker", () => {
  it("opens at the listing and navigates into a folder", async () => {
    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );

    expect(await screen.findByText("src")).toBeTruthy();
    expect(browsePathsAction).toHaveBeenCalledWith(null);

    browsePathsAction.mockResolvedValueOnce(
      listing({
        dir: "C:\\work\\src",
        parent: "C:\\work",
        entries: [
          { name: "index.ts", path: "C:\\work\\src\\index.ts", kind: "file" },
        ],
      }),
    );
    fireEvent.click(screen.getByText("src"));

    await waitFor(() =>
      expect(browsePathsAction).toHaveBeenLastCalledWith("C:\\work\\src"),
    );
    expect(await screen.findByText("index.ts")).toBeTruthy();
  });

  it("picks a file and carries it into the form", async () => {
    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );
    fireEvent.click(await screen.findByText("notes.md"));

    const form = screen
      .getByRole("button", { name: "Add task" })
      .closest("form")!;
    const path = form.querySelector<HTMLInputElement>('input[name="path"]')!;
    const kind = form.querySelector<HTMLInputElement>(
      'input[name="pathKind"]',
    )!;
    expect(path.value).toBe("C:\\work\\notes.md");
    expect(kind.value).toBe("file");

    fireEvent.change(screen.getByPlaceholderText("What needs doing?"), {
      target: { value: "Read the notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => expect(createTaskAction).toHaveBeenCalledTimes(1));
    const formData = createTaskAction.mock.calls[0][0];
    expect(formData.get("path")).toBe("C:\\work\\notes.md");
    expect(formData.get("pathKind")).toBe("file");
  });

  it("uses the current folder as the target", async () => {
    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use this folder" }),
    );

    const form = screen
      .getByRole("button", { name: "Add task" })
      .closest("form")!;
    expect(
      form.querySelector<HTMLInputElement>('input[name="path"]')!.value,
    ).toBe("C:\\work");
    expect(
      form.querySelector<HTMLInputElement>('input[name="pathKind"]')!.value,
    ).toBe("folder");
  });

  it("clears a chosen target", async () => {
    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );
    fireEvent.click(await screen.findByText("notes.md"));

    fireEvent.click(screen.getByRole("button", { name: "Remove target" }));

    const form = screen
      .getByRole("button", { name: "Add task" })
      .closest("form")!;
    expect(
      form.querySelector<HTMLInputElement>('input[name="path"]')!.value,
    ).toBe("");
    expect(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    ).toBeTruthy();
  });

  it("surfaces a permission error from the server", async () => {
    browsePathsAction.mockResolvedValueOnce({
      ok: false as const,
      error: "No permission to read that folder",
    });

    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );

    expect(
      await screen.findByText("No permission to read that folder"),
    ).toBeTruthy();
  });

  it("closes on Escape", async () => {
    render(<TaskForm goals={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Attach a file or folder/i }),
    );
    await screen.findByText("src");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("src")).toBeNull());
  });
});
