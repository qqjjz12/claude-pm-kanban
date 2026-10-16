import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailModal } from "@/components/CardDetailModal";
import * as api from "@/lib/api";
import { initialData } from "@/test/fixtures";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);
const card = initialData.cards["card-1"];

const detail = (overrides: Partial<api.CardDetail> = {}): api.CardDetail => ({
  comments: [],
  checklist: [],
  ...overrides,
});

const renderModal = async (initial = detail()) => {
  mocked.getCardDetail.mockResolvedValue(initial);
  const onClose = vi.fn();
  const onSummary = vi.fn();
  render(<CardDetailModal card={card} onClose={onClose} onSummary={onSummary} />);
  await screen.findByRole("region", { name: "Checklist" });
  return { onClose, onSummary };
};

describe("CardDetailModal", () => {
  beforeEach(() => vi.resetAllMocks());

  it("loads and shows the card, empty checklist and comments", async () => {
    await renderModal();
    expect(screen.getByRole("dialog", { name: "Card details" })).toBeVisible();
    expect(screen.getByRole("heading", { name: card.title })).toBeVisible();
    expect(screen.getByText("No comments yet.")).toBeVisible();
    expect(mocked.getCardDetail).toHaveBeenCalledWith("card-1");
  });

  it("shows an error when the details cannot load", async () => {
    mocked.getCardDetail.mockRejectedValue(new Error("down"));
    render(<CardDetailModal card={card} onClose={() => {}} onSummary={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("adds a checklist item and reports the new summary", async () => {
    const { onSummary } = await renderModal();
    mocked.addChecklistItem.mockResolvedValue(
      detail({ checklist: [{ id: 1, text: "Write spec", done: false }] })
    );
    await userEvent.type(screen.getByLabelText("New checklist item"), "Write spec");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByLabelText("Write spec")).not.toBeChecked();
    expect(mocked.addChecklistItem).toHaveBeenCalledWith("card-1", "Write spec");
    expect(onSummary).toHaveBeenCalledWith("card-1", 0, { done: 0, total: 1 });
    expect(screen.getByLabelText("New checklist item")).toHaveValue("");
  });

  it("toggles and removes checklist items and shows progress", async () => {
    const { onSummary } = await renderModal(
      detail({
        checklist: [
          { id: 1, text: "A", done: false },
          { id: 2, text: "B", done: true },
        ],
      })
    );
    expect(screen.getByText("1/2 done")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

    mocked.updateChecklistItem.mockResolvedValue(
      detail({
        checklist: [
          { id: 1, text: "A", done: true },
          { id: 2, text: "B", done: true },
        ],
      })
    );
    await userEvent.click(screen.getByLabelText("A"));
    expect(mocked.updateChecklistItem).toHaveBeenCalledWith(1, { done: true });
    expect(await screen.findByText("2/2 done")).toBeVisible();
    expect(onSummary).toHaveBeenLastCalledWith("card-1", 0, { done: 2, total: 2 });

    mocked.deleteChecklistItem.mockResolvedValue(
      detail({ checklist: [{ id: 2, text: "B", done: true }] })
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove A" }));
    expect(mocked.deleteChecklistItem).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByLabelText("A")).not.toBeInTheDocument());
  });

  it("adds and deletes comments", async () => {
    const { onSummary } = await renderModal();
    const added = detail({
      comments: [{ id: 5, author: "alice", body: "Looks good", createdAt: "2030-01-01 10:00:00" }],
    });
    mocked.addComment.mockResolvedValue(added);
    await userEvent.type(screen.getByLabelText("New comment"), "  Looks good ");
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByText("Looks good")).toBeVisible();
    expect(screen.getByText("alice")).toBeVisible();
    expect(mocked.addComment).toHaveBeenCalledWith("card-1", "Looks good");
    expect(onSummary).toHaveBeenCalledWith("card-1", 1, { done: 0, total: 0 });

    mocked.deleteComment.mockResolvedValue(detail());
    await userEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(mocked.deleteComment).toHaveBeenCalledWith(5);
    expect(await screen.findByText("No comments yet.")).toBeVisible();
  });

  it("ignores blank input", async () => {
    await renderModal();
    await userEvent.type(screen.getByLabelText("New comment"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await userEvent.type(screen.getByLabelText("New checklist item"), "  ");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(mocked.addComment).not.toHaveBeenCalled();
    expect(mocked.addChecklistItem).not.toHaveBeenCalled();
  });

  it("keeps the text and shows an error when saving fails", async () => {
    await renderModal();
    mocked.addComment.mockRejectedValue(new Error("nope"));
    await userEvent.type(screen.getByLabelText("New comment"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    expect(screen.getByLabelText("New comment")).toHaveValue("Hello");
  });

  it("closes with the button, Escape and a click on the backdrop", async () => {
    const { onClose } = await renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Close details" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("does not close when clicking inside the dialog", async () => {
    const { onClose } = await renderModal();
    await userEvent.click(screen.getByRole("heading", { name: card.title }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps text typed while the previous item is still being saved", async () => {
    await renderModal();
    let finish: (value: api.CardDetail) => void = () => {};
    mocked.addChecklistItem.mockReturnValueOnce(
      new Promise<api.CardDetail>((resolve) => {
        finish = resolve;
      })
    );
    await userEvent.type(screen.getByLabelText("New checklist item"), "first{Enter}");
    await userEvent.type(screen.getByLabelText("New checklist item"), "second");
    finish(detail({ checklist: [{ id: 1, text: "first", done: false }] }));
    await screen.findByLabelText("first");
    expect(screen.getByLabelText("New checklist item")).toHaveValue("second");
  });

  it("puts the text back when a save fails", async () => {
    await renderModal();
    mocked.addChecklistItem.mockRejectedValue(new Error("nope"));
    await userEvent.type(screen.getByLabelText("New checklist item"), "keep me{Enter}");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("New checklist item")).toHaveValue("keep me");
  });
});
