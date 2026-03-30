// app/insights/new/components/CustomerSelector.tsx

"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  is_active: boolean;
}

export interface CustomersMeta {
  loading: boolean;
  count: number;
}

interface CustomerSelectorProps {
  value: string;
  onChange: (customerId: string) => void;
  /** When set, called after fetch progress / list size changes (for host UI, e.g. empty states). */
  onCustomersMetaChange?: (meta: CustomersMeta) => void;
}

export function CustomerSelector({
  value,
  onChange,
  onCustomersMetaChange,
}: CustomerSelectorProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    onCustomersMetaChange?.({ loading, count: customers.length });
  }, [loading, customers.length, onCustomersMetaChange]);

  useEffect(() => {
    if (loading || customers.length !== 1) return;
    const only = customers[0];
    if (value !== only.id) onChange(only.id);
  }, [loading, customers, value, onChange]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch("/api/customers");
      const data = await response.json();
      setCustomers(data.filter((c: Customer) => c.is_active));
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="customer" className="shrink-0">
        Customer
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={loading || customers.length === 1}
      >
        <SelectTrigger id="customer" className="w-full max-w-md">
          <SelectValue
            placeholder={loading ? "Loading..." : "Select a customer..."}
          />
        </SelectTrigger>
        <SelectContent>
          {customers.map((customer) => (
            <SelectItem key={customer.id} value={customer.id}>
              {customer.name} ({customer.customer_code})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
