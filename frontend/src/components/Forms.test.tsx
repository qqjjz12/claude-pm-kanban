import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { KanbanCard } from "@/components/KanbanCard";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { NewCardForm } from "@/components/NewCardForm";
import { NewColumnForm } from "@/components/NewColumnForm";
import { initialData } from "@/test/fixtures";

describe("NewCardForm", () => {
  it("cancel closes the form and discards what was typed", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "draft");
    await userEvent.selectOptions(screen.getByLabelText("Priority"), "high");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onAdd).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(screen.getByPlaceholderText(/card title/i)).toHaveValue("");
    expect(screen.getByLabelText("Priority")).toHaveValue("none");
  });

  it("resets the fields after adding", async () => {
    const onAdd = vi.fn();
    render(<NewCardForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    await userEvent.type(screen.getByPlaceholderText(/card title/i), "one");
    await userEvent.type(screen.getByLabelText("Labels"), "a");
    await userEvent.click(screen.getByRole("button", { name: "Add card" }));
    expect(onAdd).toHaveBeenCalledWith("one", "", { priority: "none", dueDate: null, labels: ["a"] });
    await userEvent.click(screen.getByRole("button", { name: /add a card/i }));
    expect(screen.getByLabelText("Labels")).toHaveValue("");
  });
});

describe("NewColumnForm", () => {
  it("adds a trimmed title and closes", async () => {
    const onAdd = vi.fn();
    render(<NewColumnForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    await userEvent.type(screen.getByLabelText("New column title"), "  Blocked  {Enter}");
    expect(onAdd).toHaveBeenCalledWith("Blocked");
    expect(screen.getByRole("button", { name: /add a column/i })).toBeVisible();
  });

  it("ignores a blank title and can be cancelled", async () => {
    const onAdd = vi.fn();
    render(<NewColumnForm onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    await userEvent.type(screen.getByLabelText("New column title"), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /add a column/i })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    expect(screen.getByLabelText("New column title")).toHaveValue("");
  });
});

describe("KanbanCardPreview", () => {
  it("shows the title, details and badges", () => {
    render(
      <KanbanCardPreview
        card={{
          ...initialData.cards["card-1"],
          priority: "high",
          labels: ["x"],
        }}
      />
    );
    expect(screen.getByText("Align roadmap themes")).toBeVisible();
    expect(screen.getByText(/Draft quarterly themes/)).toBeVisible();
    expect(screen.getByText("high")).toBeVisible();
    expect(screen.getByText("x")).toBeVisible();
  });

  it("omits empty details", () => {
    render(<KanbanCardPreview card={{ ...initialData.cards["card-1"], details: "" }} />);
    expect(screen.queryByText(/Draft quarterly themes/)).not.toBeInTheDocument();
  });
});

const Harness = ({ onEdit }: { onEdit: () => void }) => {
  // Same activation distance as the board, so plain clicks are not treated as drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const card = initialData.cards["card-1"];
  return (
    <DndContext sensors={sensors}>
      <SortableContext items={[card.id]}>
        <KanbanCard card={card} onDelete={() => {}} onEdit={onEdit} onOpen={() => {}} />
      </SortableContext>
    </DndContext>
  );
};

describe("KanbanCard", () => {
  const renderCard = (onEdit = vi.fn()) => {
    render(<Harness onEdit={onEdit} />);
    return onEdit;
  };

  it("does not save a blank title", async () => {
    const onEdit = renderCard();
    await userEvent.click(screen.getByTitle("Edit card"));
    await userEvent.clear(screen.getByLabelText("Edit card title"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Edit card title")).toBeVisible();
  });
});
