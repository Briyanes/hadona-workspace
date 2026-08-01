export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: number;
  tax: number;
  status: string;
  items: InvoiceItem[];
  notes: string | null;
  paid_date: string | null;
  created_at: string;
  client?: { name: string };
}