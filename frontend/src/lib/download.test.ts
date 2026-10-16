import { downloadJson, fileSlug } from "@/lib/download";

describe("fileSlug", () => {
  it("makes a safe lowercase file name", () => {
    expect(fileSlug("Q4 plan / drafts")).toBe("q4-plan-drafts");
    expect(fileSlug("  My Board!! ")).toBe("my-board");
    expect(fileSlug("../../etc/passwd")).toBe("etc-passwd");
  });

  it("falls back when nothing usable is left", () => {
    expect(fileSlug("???")).toBe("board");
    expect(fileSlug("")).toBe("board");
  });
});

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

describe("downloadJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a temporary link with the file name and releases the object URL", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob | MediaSource) => {
      blob = value as Blob;
      return "blob:fake";
    });
    URL.revokeObjectURL = vi.fn();
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });

    downloadJson("board.json", { a: 1 });

    expect(clicked).toEqual([{ href: "blob:fake", download: "board.json" }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(JSON.parse(await readText(blob!))).toEqual({ a: 1 });
    expect(blob!.type).toBe("application/json");
  });
});
