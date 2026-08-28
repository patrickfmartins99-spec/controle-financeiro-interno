import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

import type { ModuleName } from '@/lib/types';

const modules: ModuleName[] = ['invoices', 'expenses', 'deposits'];
const timestamp = () => new Date().toISOString();

function validModule(value: unknown): value is ModuleName {
  return typeof value === 'string' && modules.includes(value as ModuleName);
}

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS periods (
      id TEXT PRIMARY KEY, module TEXT NOT NULL, label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', opened_at TEXT NOT NULL,
      closed_at TEXT, created_at TEXT NOT NULL)`),
    env.DB
      .prepare(`CREATE UNIQUE INDEX IF NOT EXISTS one_open_period_per_module_idx
      ON periods(module) WHERE status = 'open'`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES periods(id),
      supplier TEXT NOT NULL, issue_date TEXT NOT NULL, invoice_number TEXT NOT NULL,
      access_key TEXT, resent_from_id TEXT, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS invoice_due_dates (
      id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      due_date TEXT NOT NULL, position INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES periods(id),
      name TEXT NOT NULL, expense_date TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      settled_date TEXT, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY, period_id TEXT NOT NULL REFERENCES periods(id),
      deposit_date TEXT NOT NULL, amount_cents INTEGER NOT NULL,
      depositor TEXT, created_at TEXT NOT NULL)`),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS invoices_period_idx ON invoices(period_id)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS expenses_period_idx ON expenses(period_id)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS deposits_period_idx ON deposits(period_id)',
    ),
  ]);
}

async function readData() {
  await ensureSchema();
  const [periods, invoices, dueDates, expenses, deposits] = await Promise.all([
    env.DB.prepare(`SELECT id, module, label, status, opened_at AS openedAt,
      closed_at AS closedAt, created_at AS createdAt FROM periods ORDER BY created_at DESC`).all(),
    env.DB.prepare(`SELECT i.id, i.period_id AS periodId, p.label AS periodLabel,
      p.status AS periodStatus, i.supplier, i.issue_date AS issueDate,
      i.invoice_number AS invoiceNumber, i.access_key AS accessKey,
      i.resent_from_id AS resentFromId, i.created_at AS createdAt
      FROM invoices i JOIN periods p ON p.id = i.period_id ORDER BY i.created_at DESC`).all(),
    env.DB.prepare(`SELECT invoice_id AS invoiceId, due_date AS dueDate, position
      FROM invoice_due_dates ORDER BY position ASC`).all(),
    env.DB.prepare(`SELECT e.id, e.period_id AS periodId, p.label AS periodLabel,
      p.status AS periodStatus, e.name, e.expense_date AS expenseDate,
      e.amount_cents AS amountCents, e.settled_date AS settledDate,
      e.created_at AS createdAt FROM expenses e JOIN periods p ON p.id = e.period_id
      ORDER BY e.created_at DESC`).all(),
    env.DB.prepare(`SELECT d.id, d.period_id AS periodId, p.label AS periodLabel,
      p.status AS periodStatus, d.deposit_date AS depositDate,
      d.amount_cents AS amountCents, d.depositor, d.created_at AS createdAt
      FROM deposits d JOIN periods p ON p.id = d.period_id ORDER BY d.created_at DESC`).all(),
  ]);
  const dueDatesByInvoice = new Map<string, string[]>();
  for (const row of dueDates.results as Array<{
    invoiceId: string;
    dueDate: string;
  }>) {
    dueDatesByInvoice.set(row.invoiceId, [
      ...(dueDatesByInvoice.get(row.invoiceId) ?? []),
      row.dueDate,
    ]);
  }
  return {
    periods: periods.results,
    invoices: (invoices.results as Array<Record<string, unknown>>).map(
      (invoice) => ({
        ...invoice,
        dueDates: dueDatesByInvoice.get(invoice.id as string) ?? [],
      }),
    ),
    expenses: expenses.results,
    deposits: deposits.results,
  };
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function openPeriod(body: Record<string, unknown>) {
  if (
    !validModule(body.module) ||
    typeof body.label !== 'string' ||
    !body.label.trim()
  ) {
    return error('Informe o tipo e o nome do período.');
  }
  const existing = await env.DB.prepare(
    `SELECT id FROM periods WHERE module = ? AND status = 'open' LIMIT 1`,
  )
    .bind(body.module)
    .first();
  if (existing)
    return error('Este relatório já possui um período aberto.', 409);
  const now = timestamp();
  await env.DB.prepare(`INSERT INTO periods
    (id, module, label, status, opened_at, created_at) VALUES (?, ?, ?, 'open', ?, ?)`)
    .bind(crypto.randomUUID(), body.module, body.label.trim(), now, now)
    .run();
  return NextResponse.json(await readData());
}

async function closePeriod(body: Record<string, unknown>) {
  if (typeof body.periodId !== 'string') return error('Período inválido.');
  await env.DB.prepare(`UPDATE periods SET status = 'closed', closed_at = ?
    WHERE id = ? AND status = 'open'`)
    .bind(timestamp(), body.periodId)
    .run();
  return NextResponse.json(await readData());
}

async function reopenPeriod(body: Record<string, unknown>) {
  if (typeof body.periodId !== 'string') return error('Período inválido.');
  const period = await env.DB.prepare('SELECT module FROM periods WHERE id = ?')
    .bind(body.periodId)
    .first<{ module: ModuleName }>();
  if (!period) return error('Período não encontrado.', 404);
  const existing = await env.DB.prepare(`SELECT id FROM periods
    WHERE module = ? AND status = 'open' AND id <> ? LIMIT 1`)
    .bind(period.module, body.periodId)
    .first();
  if (existing)
    return error(
      'Encerre o período atual deste relatório antes de reabrir o anterior.',
      409,
    );
  await env.DB.prepare(
    `UPDATE periods SET status = 'open', closed_at = NULL WHERE id = ?`,
  )
    .bind(body.periodId)
    .run();
  return NextResponse.json(await readData());
}

async function openPeriodFor(module: ModuleName) {
  return env.DB.prepare(
    `SELECT id FROM periods WHERE module = ? AND status = 'open' LIMIT 1`,
  )
    .bind(module)
    .first<{ id: string }>();
}

async function addInvoice(body: Record<string, unknown>) {
  const period = await openPeriodFor('invoices');
  if (!period) return error('Abra um período de notas fiscais primeiro.', 409);
  if (
    typeof body.supplier !== 'string' ||
    !body.supplier.trim() ||
    typeof body.issueDate !== 'string' ||
    !body.issueDate ||
    typeof body.invoiceNumber !== 'string' ||
    !body.invoiceNumber.trim() ||
    !Array.isArray(body.dueDates)
  ) {
    return error(
      'Preencha fornecedor, emissão, número e ao menos um vencimento.',
    );
  }
  const dueDates = body.dueDates.filter(
    (date): date is string => typeof date === 'string' && Boolean(date),
  );
  if (!dueDates.length) return error('Informe ao menos um vencimento.');
  const id = crypto.randomUUID();
  const accessKey =
    typeof body.accessKey === 'string'
      ? body.accessKey.replace(/\D/g, '').slice(0, 44)
      : '';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO invoices
      (id, period_id, supplier, issue_date, invoice_number, access_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
      id,
      period.id,
      body.supplier.trim(),
      body.issueDate,
      body.invoiceNumber.trim(),
      accessKey || null,
      timestamp(),
    ),
    ...dueDates.map((dueDate, position) =>
      env.DB.prepare(`INSERT INTO invoice_due_dates
      (id, invoice_id, due_date, position) VALUES (?, ?, ?, ?)`).bind(
        crypto.randomUUID(),
        id,
        dueDate,
        position,
      ),
    ),
  ]);
  return NextResponse.json(await readData());
}

async function resendInvoice(body: Record<string, unknown>) {
  if (typeof body.invoiceId !== 'string') return error('Nota inválida.');
  const period = await openPeriodFor('invoices');
  if (!period) return error('Abra um período de notas fiscais primeiro.', 409);
  const source = await env.DB.prepare(`SELECT supplier, issue_date AS issueDate,
    invoice_number AS invoiceNumber, access_key AS accessKey FROM invoices WHERE id = ?`)
    .bind(body.invoiceId)
    .first<Record<string, string | null>>();
  if (!source) return error('Nota não encontrada.', 404);
  const dueDates =
    await env.DB.prepare(`SELECT due_date AS dueDate FROM invoice_due_dates
    WHERE invoice_id = ? ORDER BY position`)
      .bind(body.invoiceId)
      .all<{ dueDate: string }>();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO invoices
      (id, period_id, supplier, issue_date, invoice_number, access_key, resent_from_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id,
      period.id,
      source.supplier,
      source.issueDate,
      source.invoiceNumber,
      source.accessKey,
      body.invoiceId,
      timestamp(),
    ),
    ...dueDates.results.map((row, position) =>
      env.DB.prepare(`INSERT INTO invoice_due_dates
      (id, invoice_id, due_date, position) VALUES (?, ?, ?, ?)`).bind(
        crypto.randomUUID(),
        id,
        row.dueDate,
        position,
      ),
    ),
  ]);
  return NextResponse.json(await readData());
}

function amountInCents(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
}

async function addExpense(body: Record<string, unknown>) {
  const period = await openPeriodFor('expenses');
  if (!period) return error('Abra um período de despesas primeiro.', 409);
  const amount = amountInCents(body.amount);
  if (
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    typeof body.expenseDate !== 'string' ||
    !body.expenseDate ||
    !amount
  ) {
    return error('Preencha a despesa, a data e um valor válido.');
  }
  await env.DB.prepare(`INSERT INTO expenses
    (id, period_id, name, expense_date, amount_cents, settled_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      period.id,
      body.name.trim(),
      body.expenseDate,
      amount,
      typeof body.settledDate === 'string' && body.settledDate
        ? body.settledDate
        : null,
      timestamp(),
    )
    .run();
  return NextResponse.json(await readData());
}

async function addDeposit(body: Record<string, unknown>) {
  const period = await openPeriodFor('deposits');
  if (!period) return error('Abra um período de depósitos primeiro.', 409);
  const amount = amountInCents(body.amount);
  if (typeof body.depositDate !== 'string' || !body.depositDate || !amount) {
    return error('Preencha a data e um valor válido.');
  }
  await env.DB.prepare(`INSERT INTO deposits
    (id, period_id, deposit_date, amount_cents, depositor, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      period.id,
      body.depositDate,
      amount,
      typeof body.depositor === 'string' && body.depositor.trim()
        ? body.depositor.trim()
        : null,
      timestamp(),
    )
    .run();
  return NextResponse.json(await readData());
}

export async function GET() {
  try {
    return NextResponse.json(await readData());
  } catch (cause) {
    console.error(cause);
    return error('Não foi possível carregar os dados.', 500);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = (await request.json()) as Record<string, unknown>;
    switch (body.action) {
      case 'open_period':
        return openPeriod(body);
      case 'close_period':
        return closePeriod(body);
      case 'reopen_period':
        return reopenPeriod(body);
      case 'add_invoice':
        return addInvoice(body);
      case 'resend_invoice':
        return resendInvoice(body);
      case 'add_expense':
        return addExpense(body);
      case 'add_deposit':
        return addDeposit(body);
      default:
        return error('Ação inválida.');
    }
  } catch (cause) {
    console.error(cause);
    return error(
      cause instanceof Error ? cause.message : 'Erro inesperado.',
      500,
    );
  }
}
