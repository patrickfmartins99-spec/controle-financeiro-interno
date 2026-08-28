export type ModuleName = 'invoices' | 'expenses' | 'deposits';
export type ViewName = 'overview' | ModuleName | 'history';

export type Period = {
  id: string;
  module: ModuleName;
  label: string;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
};

export type Invoice = {
  id: string;
  periodId: string;
  periodLabel: string;
  periodStatus: 'open' | 'closed';
  supplier: string;
  issueDate: string;
  invoiceNumber: string;
  accessKey: string | null;
  resentFromId: string | null;
  dueDates: string[];
  createdAt: string;
};

export type Expense = {
  id: string;
  periodId: string;
  periodLabel: string;
  periodStatus: 'open' | 'closed';
  name: string;
  expenseDate: string;
  amountCents: number;
  settledDate: string | null;
  createdAt: string;
};

export type Deposit = {
  id: string;
  periodId: string;
  periodLabel: string;
  periodStatus: 'open' | 'closed';
  depositDate: string;
  amountCents: number;
  depositor: string | null;
  createdAt: string;
};

export type ControlData = {
  periods: Period[];
  invoices: Invoice[];
  expenses: Expense[];
  deposits: Deposit[];
};
