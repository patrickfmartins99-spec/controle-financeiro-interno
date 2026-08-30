import { getStore } from '@netlify/blobs';
import { NextResponse } from 'next/server';

import type { ControlData, Invoice, ModuleName } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const emptyData: ControlData = {
  periods: [],
  invoices: [],
  expenses: [],
  deposits: [],
};

const modules: ModuleName[] = ['invoices', 'expenses', 'deposits'];
const store = () =>
  getStore({ name: 'controle-financeiro-top-haus', consistency: 'strong' });
const timestamp = () => new Date().toISOString();

function validModule(value: unknown): value is ModuleName {
  return typeof value === 'string' && modules.includes(value as ModuleName);
}

async function readData(): Promise<ControlData> {
  return (
    ((await store().get('control-data', {
      type: 'json',
    })) as ControlData | null) ?? emptyData
  );
}

async function saveData(data: ControlData) {
  await store().setJSON('control-data', data);
  return data;
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function openPeriodFor(data: ControlData, module: ModuleName) {
  return data.periods.find(
    (period) => period.module === module && period.status === 'open',
  );
}

function recordCanChange(
  data: ControlData,
  module: ModuleName,
  periodId: string,
) {
  return data.periods.some(
    (period) =>
      period.id === periodId &&
      period.module === module &&
      period.status === 'open',
  );
}

function amountInCents(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
}

function invoiceAmountsInCents(value: unknown, dueDateCount: number) {
  if (!Array.isArray(value) || value.length !== dueDateCount) return null;
  const amounts = value.map((amount) => Number(amount));
  return amounts.every((amount) => Number.isInteger(amount) && amount > 0)
    ? amounts
    : null;
}

function updateRecordStatus(
  data: ControlData,
  module: ModuleName,
  periodId: string,
  status: 'open' | 'closed',
) {
  if (module === 'invoices') {
    data.invoices.forEach((item) => {
      if (item.periodId === periodId) item.periodStatus = status;
    });
  } else if (module === 'expenses') {
    data.expenses.forEach((item) => {
      if (item.periodId === periodId) item.periodStatus = status;
    });
  } else {
    data.deposits.forEach((item) => {
      if (item.periodId === periodId) item.periodStatus = status;
    });
  }
}

async function handleAction(body: Record<string, unknown>) {
  const data = await readData();

  switch (body.action) {
    case 'open_period': {
      if (
        !validModule(body.module) ||
        typeof body.label !== 'string' ||
        !body.label.trim()
      ) {
        return error('Informe o tipo e o nome do período.');
      }
      if (openPeriodFor(data, body.module)) {
        return error('Este relatório já possui um período aberto.', 409);
      }
      const now = timestamp();
      data.periods.unshift({
        id: crypto.randomUUID(),
        module: body.module,
        label: body.label.trim(),
        status: 'open',
        openedAt: now,
        closedAt: null,
        createdAt: now,
      });
      return NextResponse.json(await saveData(data));
    }

    case 'close_period': {
      if (typeof body.periodId !== 'string') return error('Período inválido.');
      const period = data.periods.find((item) => item.id === body.periodId);
      if (!period) return error('Período não encontrado.', 404);
      period.status = 'closed';
      period.closedAt = timestamp();
      updateRecordStatus(data, period.module, period.id, 'closed');
      return NextResponse.json(await saveData(data));
    }

    case 'reopen_period': {
      if (typeof body.periodId !== 'string') return error('Período inválido.');
      const period = data.periods.find((item) => item.id === body.periodId);
      if (!period) return error('Período não encontrado.', 404);
      if (
        data.periods.some(
          (item) =>
            item.module === period.module &&
            item.status === 'open' &&
            item.id !== period.id,
        )
      ) {
        return error(
          'Encerre o período atual deste relatório antes de reabrir o anterior.',
          409,
        );
      }
      period.status = 'open';
      period.closedAt = null;
      updateRecordStatus(data, period.module, period.id, 'open');
      return NextResponse.json(await saveData(data));
    }

    case 'add_invoice': {
      const period = openPeriodFor(data, 'invoices');
      if (!period)
        return error('Abra um período de notas fiscais primeiro.', 409);
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
      const installmentAmountsCents = invoiceAmountsInCents(
        body.installmentAmountsCents,
        dueDates.length,
      );
      if (!installmentAmountsCents) {
        return error(
          dueDates.length === 1
            ? 'Informe o valor total da nota.'
            : 'Informe o valor de todas as parcelas.',
        );
      }
      const invoice: Invoice = {
        id: crypto.randomUUID(),
        periodId: period.id,
        periodLabel: period.label,
        periodStatus: period.status,
        supplier: body.supplier.trim(),
        issueDate: body.issueDate,
        invoiceNumber: body.invoiceNumber.trim(),
        accessKey:
          typeof body.accessKey === 'string'
            ? body.accessKey.replace(/\D/g, '').slice(0, 44) || null
            : null,
        resentFromId: null,
        dueDates,
        installmentAmountsCents,
        createdAt: timestamp(),
      };
      data.invoices.unshift(invoice);
      return NextResponse.json(await saveData(data));
    }

    case 'update_invoice': {
      if (typeof body.invoiceId !== 'string') return error('Nota inválida.');
      const invoice = data.invoices.find((item) => item.id === body.invoiceId);
      if (!invoice) return error('Nota não encontrada.', 404);
      if (!recordCanChange(data, 'invoices', invoice.periodId)) {
        return error('Reabra o período antes de editar esta nota.', 409);
      }
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
      const installmentAmountsCents = invoiceAmountsInCents(
        body.installmentAmountsCents,
        dueDates.length,
      );
      if (!installmentAmountsCents) {
        return error(
          dueDates.length === 1
            ? 'Informe o valor total da nota.'
            : 'Informe o valor de todas as parcelas.',
        );
      }
      invoice.supplier = body.supplier.trim();
      invoice.issueDate = body.issueDate;
      invoice.invoiceNumber = body.invoiceNumber.trim();
      invoice.accessKey =
        typeof body.accessKey === 'string'
          ? body.accessKey.replace(/\D/g, '').slice(0, 44) || null
          : null;
      invoice.dueDates = dueDates;
      invoice.installmentAmountsCents = installmentAmountsCents;
      return NextResponse.json(await saveData(data));
    }

    case 'delete_invoice': {
      if (typeof body.invoiceId !== 'string') return error('Nota inválida.');
      const index = data.invoices.findIndex(
        (item) => item.id === body.invoiceId,
      );
      if (index < 0) return error('Nota não encontrada.', 404);
      if (!recordCanChange(data, 'invoices', data.invoices[index].periodId)) {
        return error('Reabra o período antes de excluir esta nota.', 409);
      }
      data.invoices.splice(index, 1);
      return NextResponse.json(await saveData(data));
    }

    case 'resend_invoice': {
      if (typeof body.invoiceId !== 'string') return error('Nota inválida.');
      const period = openPeriodFor(data, 'invoices');
      if (!period)
        return error('Abra um período de notas fiscais primeiro.', 409);
      const source = data.invoices.find(
        (invoice) => invoice.id === body.invoiceId,
      );
      if (!source) return error('Nota não encontrada.', 404);
      data.invoices.unshift({
        ...source,
        id: crypto.randomUUID(),
        periodId: period.id,
        periodLabel: period.label,
        periodStatus: 'open',
        resentFromId: source.id,
        createdAt: timestamp(),
      });
      return NextResponse.json(await saveData(data));
    }

    case 'add_expense': {
      const period = openPeriodFor(data, 'expenses');
      if (!period) return error('Abra um período de despesas primeiro.', 409);
      const amountCents = amountInCents(body.amount);
      if (
        typeof body.name !== 'string' ||
        !body.name.trim() ||
        typeof body.expenseDate !== 'string' ||
        !body.expenseDate ||
        !amountCents
      ) {
        return error('Preencha a despesa, a data e um valor válido.');
      }
      data.expenses.unshift({
        id: crypto.randomUUID(),
        periodId: period.id,
        periodLabel: period.label,
        periodStatus: period.status,
        name: body.name.trim(),
        expenseDate: body.expenseDate,
        amountCents,
        settledDate:
          typeof body.settledDate === 'string' && body.settledDate
            ? body.settledDate
            : null,
        createdAt: timestamp(),
      });
      return NextResponse.json(await saveData(data));
    }

    case 'update_expense': {
      if (typeof body.expenseId !== 'string') {
        return error('Despesa inválida.');
      }
      const expense = data.expenses.find((item) => item.id === body.expenseId);
      if (!expense) return error('Despesa não encontrada.', 404);
      if (!recordCanChange(data, 'expenses', expense.periodId)) {
        return error('Reabra o período antes de editar esta despesa.', 409);
      }
      const amountCents = amountInCents(body.amount);
      if (
        typeof body.name !== 'string' ||
        !body.name.trim() ||
        typeof body.expenseDate !== 'string' ||
        !body.expenseDate ||
        !amountCents
      ) {
        return error('Preencha a despesa, a data e um valor válido.');
      }
      expense.name = body.name.trim();
      expense.expenseDate = body.expenseDate;
      expense.amountCents = amountCents;
      expense.settledDate =
        typeof body.settledDate === 'string' && body.settledDate
          ? body.settledDate
          : null;
      return NextResponse.json(await saveData(data));
    }

    case 'delete_expense': {
      if (typeof body.expenseId !== 'string') {
        return error('Despesa inválida.');
      }
      const index = data.expenses.findIndex(
        (item) => item.id === body.expenseId,
      );
      if (index < 0) return error('Despesa não encontrada.', 404);
      if (!recordCanChange(data, 'expenses', data.expenses[index].periodId)) {
        return error('Reabra o período antes de excluir esta despesa.', 409);
      }
      data.expenses.splice(index, 1);
      return NextResponse.json(await saveData(data));
    }

    case 'add_deposit': {
      const period = openPeriodFor(data, 'deposits');
      if (!period) return error('Abra um período de depósitos primeiro.', 409);
      const amountCents = amountInCents(body.amount);
      if (
        typeof body.depositDate !== 'string' ||
        !body.depositDate ||
        !amountCents
      ) {
        return error('Preencha a data e um valor válido.');
      }
      data.deposits.unshift({
        id: crypto.randomUUID(),
        periodId: period.id,
        periodLabel: period.label,
        periodStatus: period.status,
        depositDate: body.depositDate,
        amountCents,
        depositor:
          typeof body.depositor === 'string' && body.depositor.trim()
            ? body.depositor.trim()
            : null,
        createdAt: timestamp(),
      });
      return NextResponse.json(await saveData(data));
    }

    case 'update_deposit': {
      if (typeof body.depositId !== 'string') {
        return error('Depósito inválido.');
      }
      const deposit = data.deposits.find((item) => item.id === body.depositId);
      if (!deposit) return error('Depósito não encontrado.', 404);
      if (!recordCanChange(data, 'deposits', deposit.periodId)) {
        return error('Reabra o período antes de editar este depósito.', 409);
      }
      const amountCents = amountInCents(body.amount);
      if (
        typeof body.depositDate !== 'string' ||
        !body.depositDate ||
        !amountCents
      ) {
        return error('Preencha a data e um valor válido.');
      }
      deposit.depositDate = body.depositDate;
      deposit.amountCents = amountCents;
      deposit.depositor =
        typeof body.depositor === 'string' && body.depositor.trim()
          ? body.depositor.trim()
          : null;
      return NextResponse.json(await saveData(data));
    }

    case 'delete_deposit': {
      if (typeof body.depositId !== 'string') {
        return error('Depósito inválido.');
      }
      const index = data.deposits.findIndex(
        (item) => item.id === body.depositId,
      );
      if (index < 0) return error('Depósito não encontrado.', 404);
      if (!recordCanChange(data, 'deposits', data.deposits[index].periodId)) {
        return error('Reabra o período antes de excluir este depósito.', 409);
      }
      data.deposits.splice(index, 1);
      return NextResponse.json(await saveData(data));
    }

    default:
      return error('Ação inválida.');
  }
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
    return await handleAction(
      (await request.json()) as Record<string, unknown>,
    );
  } catch (cause) {
    console.error(cause);
    return error(
      cause instanceof Error ? cause.message : 'Erro inesperado.',
      500,
    );
  }
}
