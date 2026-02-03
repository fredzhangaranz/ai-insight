"use client";

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useMemo,
  ReactNode,
} from "react";

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  is_active: boolean;
}

/**
 * Defines the shape of the Customer context, providing state and actions
 * for managing the selected customer across the application.
 */
interface CustomerContextType {
  /** A list of all active customers. */
  customers: Customer[];
  /** The unique ID of the currently selected customer. */
  selectedCustomerId: string | null;
  /** Function to update the selected customer ID. */
  setSelectedCustomerId: (customerId: string | null) => void;
  /** The full object of the currently selected customer. */
  selectedCustomer: Customer | null;
  /** Whether customers are being loaded. */
  loading: boolean;
  /** Error message if customer fetch fails. */
  error: string | null;
  /** Refresh the customer list. */
  refreshCustomers: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(
  undefined,
);

/**
 * Provides the Customer context to its children. It handles state management,
 * including persisting the user's selection to localStorage.
 */
export const CustomerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerIdState] = useState<
    string | null
  >(() => {
    // On initial load, try to get the customer from localStorage.
    if (typeof window !== "undefined") {
      const storedCustomerId = localStorage.getItem("customer_selection");
      if (storedCustomerId) {
        return storedCustomerId;
      }
    }
    return null;
  });

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/customers");
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }
      const data = await response.json();
      const activeCustomers = data.filter((c: Customer) => c.is_active);
      setCustomers(activeCustomers);

      // Auto-select first customer if none selected and customers are available
      if (!selectedCustomerId && activeCustomers.length > 0) {
        setSelectedCustomerIdState(activeCustomers[0].id);
      }
    } catch (err: any) {
      console.error("Failed to fetch customers:", err);
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  // Fetch customers on mount
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Persist the selection to localStorage whenever it changes.
  useEffect(() => {
    if (selectedCustomerId && typeof window !== "undefined") {
      localStorage.setItem("customer_selection", selectedCustomerId);
    } else if (selectedCustomerId === null && typeof window !== "undefined") {
      localStorage.removeItem("customer_selection");
    }
  }, [selectedCustomerId]);

  // Validate selected customer is still in the list
  useEffect(() => {
    if (
      selectedCustomerId &&
      customers.length > 0 &&
      !customers.some((c) => c.id === selectedCustomerId)
    ) {
      // Selected customer no longer exists or is inactive, select first available
      if (customers.length > 0) {
        setSelectedCustomerIdState(customers[0].id);
      } else {
        setSelectedCustomerIdState(null);
      }
    }
  }, [customers, selectedCustomerId]);

  const setSelectedCustomerId = (customerId: string | null) => {
    setSelectedCustomerIdState(customerId);
  };

  // Memoize the selected customer object to avoid re-computation.
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  const refreshCustomers = async () => {
    await fetchCustomers();
  };

  const value = {
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    loading,
    error,
    refreshCustomers,
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};

/**
 * Custom hook to easily access the Customer context.
 * Throws an error if used outside of a CustomerProvider.
 */
export const useCustomer = (): CustomerContextType => {
  const context = useContext(CustomerContext);
  if (context === undefined) {
    throw new Error("useCustomer must be used within a CustomerProvider");
  }
  return context;
};
