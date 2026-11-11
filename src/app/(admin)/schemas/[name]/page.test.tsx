import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SensitivityLevel } from "@/types/schema";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { api } = await import("@/lib/api");
const { default: SchemaDetailPage } = await import("./page");

const SCHEMA = {
  name: "article",
  displayName: "Articles",
  isPubliclyDeliverable: true,
  icon: { name: "ic-coins" },
  fields: [
    { name: "Title", displayName: "Title", type: "string", isRequired: true },
    {
      name: "Salary",
      displayName: "Salary",
      type: "money",
      isRequired: false,
      sensitivity: SensitivityLevel.Sensitive,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/api/content-types") {
      return {
        data: { items: [SCHEMA], page: 1, pageSize: 20, totalItems: 1 },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
});

// One promise for every render. `use` suspends on a promise it has not seen, so a new one per render
// never settles and the page shows nothing.
const PARAMS = Promise.resolve({ name: "article" });

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Awaited, because the first render suspends on the params promise.
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <SchemaDetailPage params={PARAMS} />
        </Suspense>
      </QueryClientProvider>,
    );
  });
}

describe("the content type page", () => {
  it("no longer says fields are permanent, because fields can be added", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Articles" });

    expect(screen.queryByText(/fields are permanent/i)).toBeNull();
    expect(screen.queryByText(/no update or delete for them/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Add a field" })).toBeTruthy();
  });

  it("has the 44px icon button in the header", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Articles" });

    const button = screen.getByRole("button", { name: "Change icon" });
    expect(button.className).toContain("size-11");
  });

  it("shows each field with a sensitivity chip you can press", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Articles" });

    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("button", { name: /Title sensitivity: Public/ }),
    ).toBeTruthy();
    expect(
      within(table).getByRole("button", {
        name: /Salary sensitivity: Sensitive/,
      }),
    ).toBeTruthy();
  });

  it("offers no remove button for a field, because the API has no route for it", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "Articles" });

    expect(screen.queryByRole("button", { name: /remove|delete/i })).toBeNull();
  });
});
