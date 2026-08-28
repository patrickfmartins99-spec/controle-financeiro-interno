import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const periods = sqliteTable(
  'periods',
  {
    id: text('id').primaryKey(),
    module: text('module', {
      enum: ['invoices', 'expenses', 'deposits'],
    }).notNull(),
    label: text('label').notNull(),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    openedAt: text('opened_at').notNull(),
    closedAt: text('closed_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('periods_module_status_idx').on(table.module, table.status),
  ],
);

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id),
    supplier: text('supplier').notNull(),
    issueDate: text('issue_date').notNull(),
    invoiceNumber: text('invoice_number').notNull(),
    accessKey: text('access_key'),
    resentFromId: text('resent_from_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('invoices_period_idx').on(table.periodId),
    index('invoices_search_idx').on(table.supplier, table.invoiceNumber),
  ],
);

export const invoiceDueDates = sqliteTable(
  'invoice_due_dates',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    dueDate: text('due_date').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [index('invoice_due_dates_invoice_idx').on(table.invoiceId)],
);

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id),
    name: text('name').notNull(),
    expenseDate: text('expense_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    settledDate: text('settled_date'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('expenses_period_idx').on(table.periodId)],
);

export const deposits = sqliteTable(
  'deposits',
  {
    id: text('id').primaryKey(),
    periodId: text('period_id')
      .notNull()
      .references(() => periods.id),
    depositDate: text('deposit_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    depositor: text('depositor'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('deposits_period_idx').on(table.periodId)],
);
