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

interface CustomerSelectorProps {
  value: string;
  onChange: (customerId: string) => void;
}

export function CustomerSelector({ value, onChange }: CustomerSelectorProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCustomers();
  }, []);

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
      <Select value={value} onValueChange={onChange} disabled={loading}>
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
