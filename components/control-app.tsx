'use client';

import Image from 'next/image';
import {
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArchiveRestore,
  BanknoteArrowDown,
  Camera,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ScanLine,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ControlData,
  Invoice,
  ModuleName,
  Period,
  ViewName,
} from '@/lib/types';

const emptyData: ControlData = {
  periods: [],
  invoices: [],
  expenses: [],
  deposits: [],
};

const moduleInfo: Record<
  ModuleName,
  { title: string; singular: string; icon: typeof FileText }
> = {
  invoices: { title: 'Notas fiscais', singular: 'nota fiscal', icon: FileText },
  expenses: { title: 'Despesas', singular: 'despesa', icon: ReceiptText },
  deposits: {
    title: 'Depósitos',
    singular: 'depósito',
    icon: BanknoteArrowDown,
  },
};

const navItems: Array<{ id: ViewName; label: string; icon: typeof FileText }> =
  [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'invoices', label: 'Notas fiscais', icon: FileText },
    { id: 'expenses', label: 'Despesas', icon: ReceiptText },
    { id: 'deposits', label: 'Depósitos', icon: BanknoteArrowDown },
    { id: 'history', label: 'Histórico', icon: History },
  ];

const formatDate = (date?: string | null) =>
  date
    ? new Intl.DateTimeFormat('pt-BR').format(
        new Date(`${date.slice(0, 10)}T12:00:00`),
      )
    : '—';

const formatMoney = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function ControlApp() {
  const [view, setView] = useState<ViewName>('overview');
  const [data, setData] = useState<ControlData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [periodModal, setPeriodModal] = useState<ModuleName | null>(null);

  async function load() {
    try {
      const response = await fetch('/api/control', { cache: 'no-store' });
      const result = (await response.json()) as ControlData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível carregar os dados.');
      setData(result);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível carregar os dados.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);

  async function act(
    payload: Record<string, unknown>,
    successMessage?: string,
  ) {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ControlData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível concluir a ação.');
      setData(result);
      setPeriodModal(null);
      if (successMessage) setMessage(successMessage);
      return true;
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir a ação.',
      );
      return false;
    } finally {
      setWorking(false);
    }
  }

  const openPeriods = useMemo(
    () =>
      Object.fromEntries(
        (['invoices', 'expenses', 'deposits'] as ModuleName[]).map((module) => [
          module,
          data.periods.find(
            (period) => period.module === module && period.status === 'open',
          ) ?? null,
        ]),
      ) as Record<ModuleName, Period | null>,
    [data.periods],
  );

  return (
    <div className="min-h-screen bg-[#f4f2ef] text-zinc-950">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black text-white lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Image
            src="/logo-top-haus.jpg"
            alt="Top Haus"
            width={90}
            height={56}
            className="h-11 w-auto"
            priority
          />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            Controle interno
          </span>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-black text-white lg:flex">
        <div className="border-b border-white/10 px-7 py-7">
          <Image
            src="/logo-top-haus.jpg"
            alt="Top Haus"
            width={150}
            height={94}
            className="h-20 w-auto"
            priority
          />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
            Controle financeiro
          </p>
        </div>
        <nav
          className="flex-1 space-y-1 px-3 py-6"
          aria-label="Navegação principal"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${active ? 'bg-[#765541] text-white' : 'text-white/65 hover:bg-white/7 hover:text-white'}`}
              >
                <Icon className="size-4" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-7 py-5 text-xs leading-relaxed text-white/45">
          Os períodos de cada relatório funcionam de forma independente.
        </div>
      </aside>

      <main className="lg:ml-64">
        <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
          <div className="mb-6 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${view === item.id ? 'bg-[#765541] text-white' : 'bg-white text-zinc-600'}`}
                >
                  <Icon className="size-4" /> {item.label}
                </button>
              );
            })}
          </div>

          {message && (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-[#765541]/25 bg-[#efe7e1] px-4 py-3 text-sm text-[#4b3427]">
              <span>{message}</span>
              <button
                onClick={() => setMessage(null)}
                aria-label="Fechar aviso"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : (
            <>
              {view === 'overview' && (
                <Overview
                  data={data}
                  openPeriods={openPeriods}
                  onNavigate={setView}
                  onOpen={setPeriodModal}
                />
              )}
              {view === 'invoices' && (
                <InvoiceView
                  data={data}
                  period={openPeriods.invoices}
                  working={working}
                  act={act}
                  onOpen={() => setPeriodModal('invoices')}
                />
              )}
              {view === 'expenses' && (
                <ExpenseView
                  data={data}
                  period={openPeriods.expenses}
                  working={working}
                  act={act}
                  onOpen={() => setPeriodModal('expenses')}
                />
              )}
              {view === 'deposits' && (
                <DepositView
                  data={data}
                  period={openPeriods.deposits}
                  working={working}
                  act={act}
                  onOpen={() => setPeriodModal('deposits')}
                />
              )}
              {view === 'history' && (
                <HistoryView
                  data={data}
                  working={working}
                  act={act}
                  openInvoicePeriod={openPeriods.invoices}
                />
              )}
            </>
          )}
        </div>
      </main>

      {periodModal && (
        <OpenPeriodModal
          module={periodModal}
          working={working}
          onClose={() => setPeriodModal(null)}
          act={act}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-500">
      <Loader2 className="mr-2 size-5 animate-spin" /> Carregando controle
      interno…
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[#765541]">
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function Overview({
  data,
  openPeriods,
  onNavigate,
  onOpen,
}: {
  data: ControlData;
  openPeriods: Record<ModuleName, Period | null>;
  onNavigate: (view: ViewName) => void;
  onOpen: (module: ModuleName) => void;
}) {
  const currentExpenses = openPeriods.expenses
    ? data.expenses.filter((item) => item.periodId === openPeriods.expenses?.id)
    : [];
  const currentDeposits = openPeriods.deposits
    ? data.deposits.filter((item) => item.periodId === openPeriods.deposits?.id)
    : [];
  const currentInvoices = openPeriods.invoices
    ? data.invoices.filter((item) => item.periodId === openPeriods.invoices?.id)
    : [];
  return (
    <>
      <PageTitle
        eyebrow="Top Haus"
        title="Controle financeiro interno"
        description="Acompanhe o que está aberto hoje e encerre cada relatório no momento certo, sem misturar períodos."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <ModuleCard
          module="invoices"
          period={openPeriods.invoices}
          count={currentInvoices.length}
          onNavigate={onNavigate}
          onOpen={onOpen}
        />
        <ModuleCard
          module="expenses"
          period={openPeriods.expenses}
          count={currentExpenses.length}
          total={currentExpenses.reduce(
            (sum, item) => sum + item.amountCents,
            0,
          )}
          onNavigate={onNavigate}
          onOpen={onOpen}
        />
        <ModuleCard
          module="deposits"
          period={openPeriods.deposits}
          count={currentDeposits.length}
          total={currentDeposits.reduce(
            (sum, item) => sum + item.amountCents,
            0,
          )}
          onNavigate={onNavigate}
          onOpen={onOpen}
        />
      </div>
      <section className="mt-6 grid gap-5 rounded-2xl border border-zinc-200 bg-white p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#efe7e1] text-[#765541]">
            <Search className="size-5" />
          </div>
          <h2 className="text-lg font-semibold">
            Precisa localizar uma nota antiga?
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            A busca percorre todos os períodos encerrados e permite reenviar a
            nota para o período atual.
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => onNavigate('history')}
          className="bg-black px-5 hover:bg-zinc-800"
        >
          Abrir histórico <ChevronRight />
        </Button>
      </section>
    </>
  );
}

function ModuleCard({
  module,
  period,
  count,
  total,
  onNavigate,
  onOpen,
}: {
  module: ModuleName;
  period: Period | null;
  count: number;
  total?: number;
  onNavigate: (view: ViewName) => void;
  onOpen: (module: ModuleName) => void;
}) {
  const info = moduleInfo[module];
  const Icon = info.icon;
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]">
      <div className="flex items-start justify-between">
        <div className="flex size-11 items-center justify-center rounded-xl bg-black text-white">
          <Icon className="size-5" />
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${period ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
        >
          {period ? 'Período aberto' : 'Sem período'}
        </span>
      </div>
      <h2 className="mt-5 text-xl font-semibold">{info.title}</h2>
      <p className="mt-1 min-h-5 text-sm text-zinc-500">
        {period?.label ?? 'Abra um período para começar os lançamentos.'}
      </p>
      <div className="mt-6 flex items-end justify-between border-t border-zinc-100 pt-5">
        <div>
          <p className="text-2xl font-semibold">
            {total === undefined ? count : formatMoney(total)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {total === undefined
              ? `${count} registro${count === 1 ? '' : 's'}`
              : `${count} lançamento${count === 1 ? '' : 's'} no período`}
          </p>
        </div>
        <Button
          variant={period ? 'outline' : 'default'}
          onClick={() => (period ? onNavigate(module) : onOpen(module))}
        >
          {period ? 'Ver relatório' : 'Abrir período'}
        </Button>
      </div>
    </article>
  );
}

function PeriodBar({
  module: _module,
  period,
  count,
  total,
  working,
  act,
  onOpen,
}: {
  module: ModuleName;
  period: Period | null;
  count: number;
  total?: number;
  working: boolean;
  act: (payload: Record<string, unknown>, message?: string) => Promise<boolean>;
  onOpen: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl bg-black p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
          Período atual
        </p>
        <p className="mt-1 text-xl font-semibold">
          {period?.label ?? 'Nenhum período aberto'}
        </p>
        <p className="mt-1 text-xs text-white/50">
          {period
            ? `Aberto em ${formatDate(period.openedAt)}`
            : 'Os lançamentos ficam disponíveis após a abertura.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-lg font-semibold">
            {total === undefined
              ? `${count} item${count === 1 ? '' : 's'}`
              : formatMoney(total)}
          </p>
          <p className="text-xs text-white/45">somente neste período</p>
        </div>
        {period ? (
          <Button
            disabled={working}
            variant="secondary"
            onClick={() =>
              act(
                { action: 'close_period', periodId: period.id },
                'Período encerrado e guardado no histórico.',
              )
            }
          >
            <ArchiveRestore /> Encerrar período
          </Button>
        ) : (
          <Button
            disabled={working}
            onClick={onOpen}
            className="bg-[#8a6954] hover:bg-[#765541]"
          >
            <Plus /> Abrir período
          </Button>
        )}
      </div>
    </div>
  );
}

function InvoiceView({ data, period, working, act, onOpen }: ViewProps) {
  const current = period
    ? data.invoices.filter((item) => item.periodId === period.id)
    : [];
  const [dueDates, setDueDates] = useState([today()]);
  const [accessKey, setAccessKey] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: 'add_invoice',
        supplier: form.get('supplier'),
        issueDate: form.get('issueDate'),
        invoiceNumber: form.get('invoiceNumber'),
        accessKey: form.get('accessKey'),
        dueDates,
      },
      'Nota fiscal registrada.',
    );
    if (ok) {
      event.currentTarget.reset();
      setDueDates([today()]);
      setAccessKey('');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="Relatório"
        title="Notas fiscais"
        description="Registre o recebimento da nota e todos os vencimentos. O valor não é necessário neste controle."
      />
      <PeriodBar
        module="invoices"
        period={period}
        count={current.length}
        working={working}
        act={act}
        onOpen={onOpen}
      />
      <div className="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <FormCard
          title="Registrar nota"
          subtitle="Campos essenciais para confirmar o recebimento."
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Fornecedor">
              <Input name="supplier" required disabled={!period || working} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data de emissão">
                <Input
                  name="issueDate"
                  type="date"
                  defaultValue={today()}
                  required
                  disabled={!period || working}
                />
              </Field>
              <Field label="Número da nota">
                <Input
                  name="invoiceNumber"
                  required
                  disabled={!period || working}
                />
              </Field>
            </div>
            <Field label="Chave de acesso / código de barras" hint="opcional">
              <div className="flex gap-2">
                <Input
                  name="accessKey"
                  inputMode="numeric"
                  maxLength={44}
                  placeholder="44 dígitos"
                  value={accessKey}
                  onChange={(event) =>
                    setAccessKey(
                      event.target.value.replace(/\D/g, '').slice(0, 44),
                    )
                  }
                  disabled={!period || working}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={!period || working}
                  onClick={() => setScannerOpen(true)}
                  title="Ler código com a câmera"
                >
                  <Camera /> <span className="hidden sm:inline">Ler</span>
                </Button>
              </div>
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">
                  Vencimento{dueDates.length > 1 ? 's' : ''}
                </label>
                <button
                  type="button"
                  onClick={() => setDueDates([...dueDates, today()])}
                  className="text-xs font-semibold text-[#765541]"
                  disabled={!period}
                >
                  + adicionar vencimento
                </button>
              </div>
              <div className="space-y-2">
                {dueDates.map((date, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="date"
                      value={date}
                      onChange={(event) =>
                        setDueDates(
                          dueDates.map((item, i) =>
                            i === index ? event.target.value : item,
                          ),
                        )
                      }
                      required
                      disabled={!period || working}
                    />
                    {dueDates.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setDueDates(dueDates.filter((_, i) => i !== index))
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!period || working}
              className="w-full bg-black hover:bg-zinc-800"
            >
              {working ? <Loader2 className="animate-spin" /> : <Plus />}{' '}
              Registrar nota
            </Button>
            {!period && <FormDisabled />}
          </form>
        </FormCard>
        <DataPanel title="Notas do período" count={current.length}>
          {current.length ? (
            <InvoiceTable invoices={current} />
          ) : (
            <EmptyTable text="Nenhuma nota registrada neste período." />
          )}
        </DataPanel>
      </div>
      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onRead={(value) => {
            setAccessKey(value.replace(/\D/g, '').slice(0, 44));
            setScannerOpen(false);
          }}
        />
      )}
    </>
  );
}

function ExpenseView({ data, period, working, act, onOpen }: ViewProps) {
  const current = period
    ? data.expenses.filter((item) => item.periodId === period.id)
    : [];
  const total = current.reduce((sum, item) => sum + item.amountCents, 0);
  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: 'add_expense',
        name: form.get('name'),
        expenseDate: form.get('expenseDate'),
        amount: form.get('amount'),
        settledDate: form.get('settledDate'),
      },
      'Despesa registrada.',
    );
    if (ok) event.currentTarget.reset();
  }
  return (
    <>
      <PageTitle
        eyebrow="Relatório"
        title="Despesas"
        description="A soma considera apenas os lançamentos do período que está aberto agora."
      />
      <PeriodBar
        module="expenses"
        period={period}
        count={current.length}
        total={total}
        working={working}
        act={act}
        onOpen={onOpen}
      />
      <div className="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <FormCard
          title="Registrar despesa"
          subtitle="A data da baixa pode ficar em branco."
        >
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome da despesa">
              <Input name="name" required disabled={!period || working} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data da despesa">
                <Input
                  name="expenseDate"
                  type="date"
                  defaultValue={today()}
                  required
                  disabled={!period || working}
                />
              </Field>
              <Field label="Valor">
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  required
                  disabled={!period || working}
                />
              </Field>
            </div>
            <Field label="Data da baixa" hint="opcional">
              <Input
                name="settledDate"
                type="date"
                disabled={!period || working}
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              disabled={!period || working}
              className="w-full bg-black hover:bg-zinc-800"
            >
              {working ? <Loader2 className="animate-spin" /> : <Plus />}{' '}
              Registrar despesa
            </Button>
            {!period && <FormDisabled />}
          </form>
        </FormCard>
        <DataPanel title="Despesas do período" count={current.length}>
          {current.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Despesa</Th>
                    <Th>Data</Th>
                    <Th>Valor</Th>
                    <Th>Baixa</Th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-100">
                      <Td strong>{item.name}</Td>
                      <Td>{formatDate(item.expenseDate)}</Td>
                      <Td strong>{formatMoney(item.amountCents)}</Td>
                      <Td>{formatDate(item.settledDate)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyTable text="Nenhuma despesa registrada neste período." />
          )}
        </DataPanel>
      </div>
    </>
  );
}

function DepositView({ data, period, working, act, onOpen }: ViewProps) {
  const current = period
    ? data.deposits.filter((item) => item.periodId === period.id)
    : [];
  const total = current.reduce((sum, item) => sum + item.amountCents, 0);
  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await act(
      {
        action: 'add_deposit',
        depositDate: form.get('depositDate'),
        amount: form.get('amount'),
        depositor: form.get('depositor'),
      },
      'Depósito registrado.',
    );
    if (ok) event.currentTarget.reset();
  }
  return (
    <>
      <PageTitle
        eyebrow="Relatório"
        title="Depósitos"
        description="Acompanhe somente a data, o valor e, quando necessário, quem fez o depósito."
      />
      <PeriodBar
        module="deposits"
        period={period}
        count={current.length}
        total={total}
        working={working}
        act={act}
        onOpen={onOpen}
      />
      <div className="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <FormCard
          title="Registrar depósito"
          subtitle="O nome do depositante é opcional."
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data do depósito">
                <Input
                  name="depositDate"
                  type="date"
                  defaultValue={today()}
                  required
                  disabled={!period || working}
                />
              </Field>
              <Field label="Valor">
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0,00"
                  required
                  disabled={!period || working}
                />
              </Field>
            </div>
            <Field label="Depositante" hint="opcional">
              <Input name="depositor" disabled={!period || working} />
            </Field>
            <Button
              type="submit"
              size="lg"
              disabled={!period || working}
              className="w-full bg-black hover:bg-zinc-800"
            >
              {working ? <Loader2 className="animate-spin" /> : <Plus />}{' '}
              Registrar depósito
            </Button>
            {!period && <FormDisabled />}
          </form>
        </FormCard>
        <DataPanel title="Depósitos do período" count={current.length}>
          {current.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Depositante</Th>
                    <Th>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((item) => (
                    <tr key={item.id} className="border-t border-zinc-100">
                      <Td>{formatDate(item.depositDate)}</Td>
                      <Td strong>{item.depositor ?? 'Não informado'}</Td>
                      <Td strong>{formatMoney(item.amountCents)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyTable text="Nenhum depósito registrado neste período." />
          )}
        </DataPanel>
      </div>
    </>
  );
}

function HistoryView({
  data,
  working,
  act,
  openInvoicePeriod,
}: {
  data: ControlData;
  working: boolean;
  act: ViewProps['act'];
  openInvoicePeriod: Period | null;
}) {
  const [query, setQuery] = useState('');
  const [module, setModule] = useState<'all' | ModuleName>('all');
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const invoices = data.invoices.filter(
    (item) =>
      !normalized ||
      `${item.supplier} ${item.invoiceNumber} ${item.periodLabel} ${item.accessKey ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalized),
  );
  const periods = data.periods.filter(
    (period) =>
      period.status === 'closed' &&
      (module === 'all' || period.module === module),
  );
  return (
    <>
      <PageTitle
        eyebrow="Consulta"
        title="Histórico e pesquisa"
        description="Localize notas em qualquer período e reabra um relatório encerrado quando o financeiro solicitar uma correção."
      />
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por fornecedor, número da nota, chave ou período…"
            className="h-11 pl-10"
          />
        </div>
        <div className="mt-5">
          <h2 className="mb-3 text-sm font-semibold">Notas encontradas</h2>
          {invoices.length ? (
            <div className="space-y-2">
              {invoices.slice(0, 30).map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{invoice.supplier}</p>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                        NF {invoice.invoiceNumber}
                      </span>
                      {invoice.resentFromId && (
                        <span className="rounded-full bg-[#efe7e1] px-2 py-0.5 text-[11px] text-[#765541]">
                          Reenviada
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {invoice.periodLabel} · emissão{' '}
                      {formatDate(invoice.issueDate)} · vencimento
                      {invoice.dueDates.length > 1 ? 's' : ''}{' '}
                      {invoice.dueDates.map(formatDate).join(', ')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={
                      working ||
                      !openInvoicePeriod ||
                      invoice.periodId === openInvoicePeriod?.id
                    }
                    onClick={() =>
                      act(
                        { action: 'resend_invoice', invoiceId: invoice.id },
                        'Nota incluída no período atual para reenvio.',
                      )
                    }
                  >
                    <RotateCcw /> Reenviar
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyTable text="Nenhuma nota encontrada." />
          )}
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Períodos encerrados</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Reabrir só é possível quando não existe outro período aberto do
              mesmo relatório.
            </p>
          </div>
          <select
            value={module}
            onChange={(event) => setModule(event.target.value as typeof module)}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="all">Todos os relatórios</option>
            <option value="invoices">Notas fiscais</option>
            <option value="expenses">Despesas</option>
            <option value="deposits">Depósitos</option>
          </select>
        </div>
        <div className="space-y-2">
          {periods.length ? (
            periods.map((period) => {
              const Icon = moduleInfo[period.module].icon;
              return (
                <div
                  key={period.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-100">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{period.label}</p>
                      <p className="text-xs text-zinc-500">
                        {moduleInfo[period.module].title} · encerrado em{' '}
                        {formatDate(period.closedAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    disabled={working}
                    onClick={() =>
                      act(
                        { action: 'reopen_period', periodId: period.id },
                        'Período reaberto com todos os registros preservados.',
                      )
                    }
                  >
                    <ArchiveRestore /> Reabrir
                  </Button>
                </div>
              );
            })
          ) : (
            <EmptyTable text="Nenhum período encerrado neste filtro." />
          )}
        </div>
      </div>
    </>
  );
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <Th>Fornecedor</Th>
            <Th>Emissão</Th>
            <Th>Número</Th>
            <Th>Vencimento(s)</Th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((item) => (
            <tr key={item.id} className="border-t border-zinc-100">
              <Td strong>
                {item.supplier}
                {item.resentFromId && (
                  <span className="ml-2 rounded-full bg-[#efe7e1] px-2 py-0.5 text-[10px] text-[#765541]">
                    Reenvio
                  </span>
                )}
              </Td>
              <Td>{formatDate(item.issueDate)}</Td>
              <Td>{item.invoiceNumber}</Td>
              <Td>{item.dueDates.map(formatDate).join(', ')}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenPeriodModal({
  module,
  working,
  onClose,
  act,
}: {
  module: ModuleName;
  working: boolean;
  onClose: () => void;
  act: ViewProps['act'];
}) {
  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(
      { action: 'open_period', module, label: form.get('label') },
      `Período de ${moduleInfo[module].title.toLocaleLowerCase('pt-BR')} aberto.`,
    );
  }
  const suggestion = `${moduleInfo[module].title} · ${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())}`;
  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex h-full w-full max-w-none items-center justify-center bg-black/45 p-4"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#efe7e1] text-[#765541]">
            <CalendarRange className="size-5" />
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X className="size-5 text-zinc-400" />
          </button>
        </div>
        <h2 className="mt-5 text-xl font-semibold">
          Abrir período de {moduleInfo[module].title.toLocaleLowerCase('pt-BR')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          O período é independente dos outros relatórios e continuará aberto até
          você encerrá-lo.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Nome do período">
            <Input name="label" defaultValue={suggestion} required autoFocus />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={working}
              className="bg-black hover:bg-zinc-800"
            >
              {working ? <Loader2 className="animate-spin" /> : <Plus />} Abrir
              período
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

function BarcodeScanner({
  onClose,
  onRead,
}: {
  onClose: () => void;
  onRead: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scannerMessage, setScannerMessage] = useState(
    'Aponte a câmera para o código de barras da DANFE.',
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrame = 0;
    let stopped = false;

    async function start() {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (
              source: CanvasImageSource,
            ) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;
      if (!Detector) {
        setScannerMessage(
          'Este navegador não oferece leitura direta. Digite a chave de 44 dígitos no campo.',
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({
          formats: ['code_128', 'qr_code', 'ean_13'],
        });
        const scan = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue;
            if (value) {
              onRead(value);
              return;
            }
          } catch {
            /* continua tentando enquanto a câmera estiver aberta */
          }
          animationFrame = requestAnimationFrame(scan);
        };
        animationFrame = requestAnimationFrame(scan);
      } catch {
        setScannerMessage(
          'Não foi possível acessar a câmera. Verifique a permissão ou digite a chave manualmente.',
        );
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onRead]);

  return (
    <dialog
      open
      className="fixed inset-0 z-[60] flex h-full w-full max-w-none items-center justify-center bg-black/75 p-4"
      aria-modal="true"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between p-4">
          <div>
            <h2 className="font-semibold">Ler código da nota</h2>
            <p className="mt-1 text-xs text-zinc-500">
              A leitura preenche a chave; fornecedor e datas continuam para
              conferência.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70">
            <ScanLine className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white" />
          </div>
        </div>
        <div className="p-4 text-center text-sm text-zinc-600">
          {scannerMessage}
        </div>
      </div>
    </dialog>
  );
}

type ViewProps = {
  data: ControlData;
  period: Period | null;
  working: boolean;
  act: (payload: Record<string, unknown>, message?: string) => Promise<boolean>;
  onOpen: () => void;
};
function FormCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-5 mt-1 text-xs text-zinc-500">{subtitle}</p>
      {children}
    </section>
  );
}
function DataPanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-medium">
        {label}
        {hint && <small className="font-normal text-zinc-400">({hint})</small>}
      </span>
      {children}
    </label>
  );
}
function FormDisabled() {
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-zinc-400">
      <CalendarRange className="size-3.5" /> Abra um período para liberar o
      formulário.
    </p>
  );
}
function EmptyTable({ text }: { text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-5 text-center">
      <CheckCircle2 className="mb-2 size-6 text-zinc-300" />
      <p className="text-sm text-zinc-400">{text}</p>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
      {children}
    </th>
  );
}
function Td({
  children,
  strong,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-5 py-4 text-zinc-600 ${strong ? 'font-semibold text-zinc-900' : ''}`}
    >
      {children}
    </td>
  );
}
