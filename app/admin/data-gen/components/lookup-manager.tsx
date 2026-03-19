"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/hooks/use-toast";

interface LookupOption {
  id: string;
  text: string;
  code?: string | null;
  orderIndex: number;
}

interface LookupField {
  attributeTypeId: string;
  fieldName: string;
  formName: string;
  formId: string;
  options: LookupOption[];
}

interface LookupManagerProps {
  customerId: string;
}

export function LookupManager({ customerId }: LookupManagerProps) {
  const [fields, setFields] = useState<LookupField[]>([]);
  const [loading, setLoading] = useState(true);
  const [formFilter, setFormFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addFieldId, setAddFieldId] = useState("");
  const [addText, setAddText] = useState("");
  const [addCode, setAddCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!customerId) {
      setFields([]);
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/data-gen/lookups?customerId=${encodeURIComponent(customerId)}`);
        if (res.ok) {
          const data = await res.json();
          setFields(data.fields ?? []);
        }
      } catch (e) {
        console.error(e);
        toast({ title: "Error", description: "Failed to load lookups", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId, toast]);

  const filtered = fields.filter((f) => {
    const matchForm = formFilter === "all" || f.formId === formFilter;
    const matchSearch = !search.trim() || f.fieldName.toLowerCase().includes(search.toLowerCase());
    return matchForm && matchSearch;
  });

  const forms = [...new Set(fields.map((f) => ({ id: f.formId, name: f.formName })))];
  const uniqueForms = forms.filter((f, i, a) => a.findIndex((x) => x.id === f.id) === i);

  const toggleExpand = (id: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleAdd = async () => {
    if (!addFieldId || !addText.trim() || !customerId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/data-gen/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attributeTypeId: addFieldId,
          text: addText.trim(),
          code: addCode.trim() || undefined,
          customerId,
        }),
      });
      if (!res.ok) throw new Error("Failed to add");
      toast({ title: "Added", description: `Added "${addText}" to field` });
      setAddOpen(false);
      setAddText("");
      setAddCode("");
      setAddFieldId("");
      const data = await fetch(`/api/admin/data-gen/lookups?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json());
      setFields(data.fields ?? []);
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (optionId: string) => {
    if (!confirm("Delete this option?") || !customerId) return;
    try {
      const res = await fetch(
        `/api/admin/data-gen/lookups?id=${encodeURIComponent(optionId)}&customerId=${encodeURIComponent(customerId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Deleted", description: "Option removed" });
      const data = await fetch(`/api/admin/data-gen/lookups?customerId=${encodeURIComponent(customerId)}`).then((r) => r.json());
      setFields(data.fields ?? []);
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Lookup Values</CardTitle>
        <CardDescription>
          Add or remove dropdown options for form fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!customerId && (
          <p className="text-sm text-muted-foreground">Select a customer above to manage lookup options.</p>
        )}
        <div className="flex flex-wrap gap-4">
          <Select value={formFilter} onValueChange={setFormFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Forms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Forms</SelectItem>
              {uniqueForms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[200px]"
          />
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Add New Option
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="border rounded-lg divide-y">
            {filtered.map((field) => {
              const isExp = expanded.has(field.attributeTypeId);
              return (
                <Collapsible
                  key={field.attributeTypeId}
                  open={isExp}
                  onOpenChange={() => toggleExpand(field.attributeTypeId)}
                >
                  <div className="flex items-center justify-between p-3 hover:bg-muted/50">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2">
                        {isExp ? (
                          <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4" />
                        )}
                        <span className="font-medium">{field.fieldName}</span>
                      </button>
                    </CollapsibleTrigger>
                    <span className="text-muted-foreground text-sm">
                      {field.formName} • {field.options.length} options
                    </span>
                  </div>
                  <CollapsibleContent>
                    <div className="px-6 pb-4 space-y-2">
                      {field.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <span>{opt.text}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(opt.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAddFieldId(field.attributeTypeId);
                          setAddOpen(true);
                        }}
                      >
                        + Add option to this field
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Lookup Option</DialogTitle>
              <DialogDescription>
                This change affects all data using this form globally.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Field</label>
                <Select value={addFieldId} onValueChange={setAddFieldId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.attributeTypeId} value={f.attributeTypeId}>
                        {f.fieldName} ({f.formName})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Text</label>
                <Input
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="Display text"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Code (optional)</label>
                <Input
                  value={addCode}
                  onChange={(e) => setAddCode(e.target.value)}
                  placeholder="Optional code"
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={!addFieldId || !addText.trim() || submitting}>
                Add Option
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
