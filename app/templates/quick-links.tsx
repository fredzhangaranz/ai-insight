"use client";

export default function QuickLinks() {
  const handleViewDrafts = () => {
    const event = new CustomEvent("template-filter", {
      detail: { status: "Draft" },
    });
    window.dispatchEvent(event);
  };

  const handleViewApproved = () => {
    const event = new CustomEvent("template-filter", {
      detail: { status: "Approved" },
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="flex items-center justify-between rounded-md border bg-card p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Quick Links</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={handleViewDrafts}
            className="underline-offset-4 hover:underline text-left"
          >
            View Drafts
          </button>
          <button
            onClick={handleViewApproved}
            className="underline-offset-4 hover:underline text-left"
          >
            View Approved
          </button>
          <a
            href="/docs/template-authoring-guide.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline"
          >
            Authoring Guide
          </a>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        Stage 5 • Draft creation
      </div>
    </div>
  );
}
