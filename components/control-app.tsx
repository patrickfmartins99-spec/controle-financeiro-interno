'use client';

import Image from 'next/image';
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  ArrowRight,
  BanknoteArrowDown,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  FileSearch,
  FileText,
  History,
  Keyboard,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  ControlData,
  Deposit,
  Expense,
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

type RecordTarget =
  | { module: 'invoices'; record: Invoice }
  | { module: 'expenses'; record: Expense }
  | { module: 'deposits'; record: Deposit };

const moduleInfo: Record<
  ModuleName,
  {
    title: string;
    shortTitle: string;
    singular: string;
    description: string;
    icon: typeof FileText;
  }
> = {
  invoices: {
    title: 'Notas fiscais',
    shortTitle: 'Notas',
    singular: 'nota fiscal',
    description: 'Confirme o recebimento e acompanhe os vencimentos.',
    icon: FileText,
  },
  expenses: {
    title: 'Despesas',
    shortTitle: 'Despesas',
    singular: 'despesa',
    description: 'Registre os gastos e a data da baixa.',
    icon: ReceiptText,
  },
  deposits: {
    title: 'Depósitos',
    shortTitle: 'Depósitos',
    singular: 'depósito',
    description: 'Controle os valores depositados no período.',
    icon: BanknoteArrowDown,
  },
};

const navItems: Array<{
  id: ViewName;
  label: string;
  mobileLabel: string;
  icon: typeof FileText;
}> = [
  {
    id: 'overview',
    label: 'Início',
    mobileLabel: 'Início',
    icon: LayoutDashboard,
  },
  {
    id: 'invoices',
    label: 'Notas fiscais',
    mobileLabel: 'Notas',
    icon: FileText,
  },
  {
    id: 'expenses',
    label: 'Despesas',
    mobileLabel: 'Despesas',
    icon: ReceiptText,
  },
  {
    id: 'deposits',
    label: 'Depósitos',
    mobileLabel: 'Depósitos',
    icon: BanknoteArrowDown,
  },
  {
    id: 'history',
    label: 'Histórico',
    mobileLabel: 'Histórico',
    icon: History,
  },
];

const currency = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );

function parseCurrencyDraft(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return null;
  const dotParts = cleaned.split('.');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : dotParts.length > 2 || dotParts.at(-1)?.length === 3
      ? cleaned.replace(/\./g, '')
      : cleaned;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100)
    : null;
}

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR').format(
        new Date(`${value.slice(0, 10)}T12:00:00`),
      )
    : 'Não informada';

function today() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function useAdvanceOnEnter(formRef: { current: HTMLFormElement | null }) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const advance = (event: KeyboardEvent) => advanceOnEnter(event, form);
    form.addEventListener('keydown', advance);
    return () => form.removeEventListener('keydown', advance);
  }, [formRef]);
}

function advanceOnEnter(event: KeyboardEvent, form: HTMLFormElement) {
  if (
    event.key !== 'Enter' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.target instanceof HTMLButtonElement
  ) {
    return;
  }

  const controls = Array.from(form.elements).filter(
    (
      element,
    ): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      !element.disabled &&
      element.type !== 'hidden',
  );
  const currentIndex = controls.indexOf(
    event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  );
  if (currentIndex < 0) return;

  event.preventDefault();
  const nextControl = controls[currentIndex + 1];
  if (nextControl) {
    nextControl.focus();
  } else {
    form.requestSubmit();
  }
}

export function ControlApp() {
  const [view, setView] = useState<ViewName>('overview');
  const [data, setData] = useState<ControlData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [periodModal, setPeriodModal] = useState<ModuleName | null>(null);
  const [coverPeriodId, setCoverPeriodId] = useState<string | null>(null);
  const [periodToClose, setPeriodToClose] = useState<Period | null>(null);
  const [recordToEdit, setRecordToEdit] = useState<RecordTarget | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<RecordTarget | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/control', { cache: 'no-store' });
      const result = (await response.json()) as ControlData & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Não foi possível carregar os dados.');
      setData(result);
    } catch (cause) {
      setNotice({
        text:
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar os dados.',
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function act(payload: Record<string, unknown>, success: string) {
    setWorking(true);
    setNotice(null);
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
      setNotice({ text: success, error: false });
      return true;
    } catch (cause) {
      setNotice({
        text:
          cause instanceof Error
            ? cause.message
            : 'Não foi possível concluir a ação.',
        error: true,
      });
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

  function navigate(next: ViewName) {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => {
      const firstEntry = document.querySelector<HTMLElement>(
        '#main-content [data-entry-field]:not(:disabled)',
      );
      (
        firstEntry ?? document.querySelector<HTMLElement>('#main-content h1')
      )?.focus();
    });
  }

  async function confirmClosePeriod() {
    if (!periodToClose) return;

    const period = periodToClose;
    const success = await act(
      { action: 'close_period', periodId: period.id },
      'Período encerrado. A capa está pronta para impressão.',
    );
    if (success) {
      setPeriodToClose(null);
      setCoverPeriodId(period.id);
    }
  }

  async function confirmDeleteRecord() {
    if (!recordToDelete) return;

    const payload =
      recordToDelete.module === 'invoices'
        ? {
            action: 'delete_invoice',
            invoiceId: recordToDelete.record.id,
          }
        : recordToDelete.module === 'expenses'
          ? {
              action: 'delete_expense',
              expenseId: recordToDelete.record.id,
            }
          : {
              action: 'delete_deposit',
              depositId: recordToDelete.record.id,
            };
    const success = await act(payload, 'Lançamento excluído com sucesso.');
    if (success) setRecordToDelete(null);
  }

  return (
    <>
      <div className="app-shell min-h-dvh bg-[#efede9] text-[#171717]">
        <a
          href="#main-content"
          className="fixed left-4 top-0 z-[90] -translate-y-full rounded-lg bg-black px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-4"
        >
          Pular para o conteúdo
        </a>
        <DesktopSidebar view={view} onNavigate={navigate} />
        <MobileHeader />

        <main id="main-content" className="pb-28 lg:ml-[252px] lg:pb-10">
          <div className="mx-auto max-w-[1360px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            {notice && (
              <Notice notice={notice} onClose={() => setNotice(null)} />
            )}
            {loading ? (
              <Loading />
            ) : (
              <>
                {view === 'overview' && (
                  <Overview
                    data={data}
                    periods={openPeriods}
                    onNavigate={navigate}
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
                    onClosePeriod={setPeriodToClose}
                    onEdit={(record) =>
                      setRecordToEdit({ module: 'invoices', record })
                    }
                    onDelete={(record) =>
                      setRecordToDelete({ module: 'invoices', record })
                    }
                  />
                )}
                {view === 'expenses' && (
                  <ExpenseView
                    data={data}
                    period={openPeriods.expenses}
                    working={working}
                    act={act}
                    onOpen={() => setPeriodModal('expenses')}
                    onClosePeriod={setPeriodToClose}
                    onEdit={(record) =>
                      setRecordToEdit({ module: 'expenses', record })
                    }
                    onDelete={(record) =>
                      setRecordToDelete({ module: 'expenses', record })
                    }
                  />
                )}
                {view === 'deposits' && (
                  <DepositView
                    data={data}
                    period={openPeriods.deposits}
                    working={working}
                    act={act}
                    onOpen={() => setPeriodModal('deposits')}
                    onClosePeriod={setPeriodToClose}
                    onEdit={(record) =>
                      setRecordToEdit({ module: 'deposits', record })
                    }
                    onDelete={(record) =>
                      setRecordToDelete({ module: 'deposits', record })
                    }
                  />
                )}
                {view === 'history' && (
                  <HistoryView
                    data={data}
                    currentInvoicePeriod={openPeriods.invoices}
                    working={working}
                    act={act}
                    onPrint={setCoverPeriodId}
                  />
                )}
              </>
            )}
          </div>
        </main>

        <MobileNavigation view={view} onNavigate={navigate} />
        {periodModal && (
          <OpenPeriodModal
            module={periodModal}
            working={working}
            onClose={() => setPeriodModal(null)}
            act={act}
          />
        )}
        <AlertDialog
          open={Boolean(periodToClose)}
          onOpenChange={(open) => {
            if (!open && !working) setPeriodToClose(null);
          }}
        >
          <AlertDialogContent className="max-w-md overflow-hidden p-5 sm:p-6">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-[#eee5df] text-[#765541]">
                <Archive />
              </AlertDialogMedia>
              <AlertDialogTitle className="font-heading text-lg font-extrabold">
                Encerrar este período?
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-6">
                {periodToClose
                  ? `O período “${periodToClose.label}” será fechado e enviado ao histórico. Você poderá reabri-lo depois, se precisar corrigir algum lançamento.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2">
              <AlertDialogCancel disabled={working} className="h-11">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={working}
                onClick={() => void confirmClosePeriod()}
                className="h-11 bg-black text-white hover:bg-zinc-800"
              >
                {working ? <Loader2 className="animate-spin" /> : <Archive />}
                Confirmar encerramento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {recordToEdit && (
          <EditRecordModal
            target={recordToEdit}
            working={working}
            act={act}
            onClose={() => setRecordToEdit(null)}
          />
        )}
        <AlertDialog
          open={Boolean(recordToDelete)}
          onOpenChange={(open) => {
            if (!open && !working) setRecordToDelete(null);
          }}
        >
          <AlertDialogContent className="max-w-md overflow-hidden p-5 sm:p-6">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-red-50 text-red-700">
                <Trash2 />
              </AlertDialogMedia>
              <AlertDialogTitle className="font-heading text-lg font-extrabold">
                Excluir este lançamento?
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-6">
                Essa ação retira o lançamento do período e atualiza os totais. A
                exclusão não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2">
              <AlertDialogCancel disabled={working} className="h-11">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={working}
                onClick={() => void confirmDeleteRecord()}
                className="h-11 bg-red-700 text-white hover:bg-red-800"
              >
                {working ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Excluir lançamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {coverPeriodId && (
        <PrintCover
          data={data}
          periodId={coverPeriodId}
          onClose={() => setCoverPeriodId(null)}
        />
      )}
    </>
  );
}

function DesktopSidebar({
  view,
  onNavigate,
}: {
  view: ViewName;
  onNavigate: (view: ViewName) => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col bg-black text-white lg:flex">
      <div className="px-7 pb-6 pt-7">
        <Image
          src="/logo-top-haus.jpg"
          alt="Top Haus"
          width={142}
          height={88}
          className="h-[72px] w-auto"
          priority
        />
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
          Controle financeiro
        </p>
      </div>
      <div className="mx-5 h-px bg-white/10" />
      <nav
        className="flex-1 space-y-1 px-3 py-5"
        aria-label="Navegação principal"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === view;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold transition-colors ${active ? 'bg-white text-black' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="m-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
          <LockKeyhole className="size-4" /> Controle interno
        </div>
        <p className="mt-2 text-[11px] leading-5 text-white/45">
          Cada relatório possui seu próprio período e histórico.
        </p>
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/8 bg-white/95 backdrop-blur lg:hidden">
      <div className="flex h-[68px] items-center justify-between px-4">
        <div className="rounded-lg bg-black px-3 py-1.5">
          <Image
            src="/logo-top-haus.jpg"
            alt="Top Haus"
            width={72}
            height={45}
            className="h-9 w-auto"
            priority
          />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold">Controle financeiro</p>
          <p className="mt-0.5 text-[10px] text-zinc-400">Uso interno</p>
        </div>
      </div>
    </header>
  );
}

function MobileNavigation({
  view,
  onNavigate,
}: {
  view: ViewName;
  onNavigate: (view: ViewName) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-1 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
      aria-label="Navegação principal"
    >
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors ${active ? 'text-black' : 'text-zinc-400'}`}
            >
              <span
                className={`flex h-7 w-10 items-center justify-center rounded-full ${active ? 'bg-black text-white' : ''}`}
              >
                <Icon className="size-[18px]" />
              </span>
              {item.mobileLabel}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function Notice({
  notice,
  onClose,
}: {
  notice: { text: string; error: boolean };
  onClose: () => void;
}) {
  return (
    <output
      className={`mb-5 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${notice.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
    >
      <div className="flex items-center gap-2">
        {notice.error ? (
          <CircleHelp className="size-4 shrink-0" />
        ) : (
          <Check className="size-4 shrink-0" />
        )}
        <span>{notice.text}</span>
      </div>
      <button onClick={onClose} aria-label="Fechar aviso">
        <X className="size-4" />
      </button>
    </output>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-sm text-zinc-500">
      <Loader2 className="mr-2 size-5 animate-spin" /> Carregando seu controle…
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6 border-l-4 border-[#765541] pl-4 sm:mb-8 sm:pl-5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#765541]">
        {eyebrow}
      </p>
      <h1
        tabIndex={-1}
        className="font-heading text-[28px] font-extrabold leading-tight tracking-[-0.03em] outline-none sm:text-4xl"
      >
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500 sm:text-[15px]">
        {description}
      </p>
    </header>
  );
}

function Overview({
  data,
  periods,
  onNavigate,
  onOpen,
}: {
  data: ControlData;
  periods: Record<ModuleName, Period | null>;
  onNavigate: (view: ViewName) => void;
  onOpen: (module: ModuleName) => void;
}) {
  const entries = {
    invoices: periods.invoices
      ? data.invoices.filter((item) => item.periodId === periods.invoices?.id)
      : [],
    expenses: periods.expenses
      ? data.expenses.filter((item) => item.periodId === periods.expenses?.id)
      : [],
    deposits: periods.deposits
      ? data.deposits.filter((item) => item.periodId === periods.deposits?.id)
      : [],
  };

  return (
    <>
      <PageHeading
        eyebrow="Visão geral"
        title="O que você quer registrar hoje?"
        description="Escolha um relatório abaixo. Você verá somente os lançamentos do período que está aberto."
      />
      <div className="grid gap-3 lg:grid-cols-3 lg:gap-5">
        {(Object.keys(moduleInfo) as ModuleName[]).map((module) => (
          <OverviewCard
            key={module}
            module={module}
            period={periods[module]}
            count={entries[module].length}
            total={
              module === 'expenses'
                ? (entries.expenses as Expense[]).reduce(
                    (sum, item) => sum + item.amountCents,
                    0,
                  )
                : module === 'deposits'
                  ? (entries.deposits as Deposit[]).reduce(
                      (sum, item) => sum + item.amountCents,
                      0,
                    )
                  : undefined
            }
            onClick={() =>
              periods[module] ? onNavigate(module) : onOpen(module)
            }
          />
        ))}
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-black/15 bg-white p-5 shadow-[0_14px_35px_rgba(0,0,0,0.06)] sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#765541]">
                Como funciona
              </p>
              <h2 className="font-heading mt-1 text-xl font-bold">
                Um fluxo simples em três passos
              </h2>
            </div>
            <CircleHelp className="size-6 text-zinc-300" />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <GuideStep
              number="1"
              title="Abra o período"
              text="Cada relatório abre e fecha separadamente."
            />
            <GuideStep
              number="2"
              title="Registre"
              text="Inclua somente as informações essenciais."
            />
            <GuideStep
              number="3"
              title="Encerre"
              text="O período sai da tela atual e vai para o histórico."
            />
          </div>
        </div>
        <button
          onClick={() => onNavigate('history')}
          className="group flex min-h-[180px] flex-col justify-between rounded-2xl bg-[#17120f] p-6 text-left text-white transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <FileSearch className="size-7 text-[#c6a891]" />
            <ArrowRight className="size-5 text-white/40 transition-transform group-hover:translate-x-1" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold">
              Localizar uma nota antiga
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-white/55">
              Pesquise por fornecedor ou número e reenvie para o período atual
              quando necessário.
            </p>
          </div>
        </button>
      </section>
    </>
  );
}

function OverviewCard({
  module,
  period,
  count,
  total,
  onClick,
}: {
  module: ModuleName;
  period: Period | null;
  count: number;
  total?: number;
  onClick: () => void;
}) {
  const info = moduleInfo[module];
  const Icon = info.icon;
  return (
    <button
      onClick={onClick}
      aria-label={`${period ? 'Abrir' : 'Iniciar'} relatório de ${info.title.toLocaleLowerCase('pt-BR')}`}
      className="group relative flex min-h-[184px] flex-col overflow-hidden rounded-2xl border border-black/15 bg-white p-5 text-left shadow-[0_14px_35px_rgba(0,0,0,0.07)] transition hover:-translate-y-1 hover:border-[#765541]/60 hover:shadow-[0_18px_40px_rgba(0,0,0,0.1)]"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-1.5 ${period ? 'bg-[#765541]' : 'bg-black'}`}
      />
      <div className="flex w-full items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[#765541] text-white shadow-sm">
          <Icon className="size-5" />
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em] ${period ? 'bg-emerald-700 text-white' : 'bg-zinc-900 text-white'}`}
        >
          {period ? 'Aberto' : 'Fechado'}
        </span>
      </div>
      <div className="mt-5 flex w-full flex-1 items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">{info.title}</h2>
          <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
            {period?.label ?? 'Toque para abrir um período'}
          </p>
          <p className="mt-3 text-base font-extrabold">
            {total === undefined
              ? `${count} registro${count === 1 ? '' : 's'}`
              : currency(total)}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition group-hover:border-[#765541] group-hover:text-[#765541]">
          <ChevronRight className="size-4" />
        </span>
      </div>
    </button>
  );
}

function GuideStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 sm:block">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
        {number}
      </span>
      <div className="sm:mt-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{text}</p>
      </div>
    </div>
  );
}

type ModuleProps = {
  data: ControlData;
  period: Period | null;
  working: boolean;
  act: (payload: Record<string, unknown>, success: string) => Promise<boolean>;
  onOpen: () => void;
  onClosePeriod: (period: Period) => void;
};

type RecordActionsProps<T> = {
  onEdit: (record: T) => void;
  onDelete: (record: T) => void;
};

function PeriodStep({
  module,
  period,
  count,
  total,
  working,
  onClosePeriod,
  onOpen,
}: {
  module: ModuleName;
  period: Period | null;
  count: number;
  total?: number;
  working: boolean;
  onClosePeriod: ModuleProps['onClosePeriod'];
  onOpen: () => void;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-black bg-[#17120f] p-4 text-white shadow-[0_14px_35px_rgba(0,0,0,0.12)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <StepNumber number="1" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/50">
              Confirme o período
            </p>
            <h2 className="font-heading mt-1 text-lg font-bold">
              {period?.label ?? 'Nenhum período aberto'}
            </h2>
            <p className="mt-1 text-xs text-white/60">
              {period
                ? `Aberto em ${dateLabel(period.openedAt)} · ${count} lançamento${count === 1 ? '' : 's'}`
                : `Abra um período de ${moduleInfo[module].title.toLocaleLowerCase('pt-BR')} para começar.`}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-4 sm:border-0 sm:pt-0">
          {total !== undefined && period && (
            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
                Total aberto
              </p>
              <p className="mt-0.5 text-lg font-bold">{currency(total)}</p>
            </div>
          )}
          {period ? (
            <Button
              disabled={working}
              variant="outline"
              onClick={() => onClosePeriod(period)}
              className="h-11 border-white bg-white px-4 text-black hover:bg-zinc-200 hover:text-black"
            >
              <Archive /> Encerrar
            </Button>
          ) : (
            <Button
              disabled={working}
              onClick={onOpen}
              className="h-11 bg-white px-4 text-black hover:bg-zinc-200"
            >
              <Plus /> Abrir período
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function InvoiceView({
  data,
  period,
  working,
  act,
  onOpen,
  onClosePeriod,
  onEdit,
  onDelete,
}: ModuleProps & RecordActionsProps<Invoice>) {
  const records = period
    ? data.invoices.filter((item) => item.periodId === period.id)
    : [];
  const [dueDates, setDueDates] = useState([today()]);
  const [installmentAmounts, setInstallmentAmounts] = useState<
    Array<number | null>
  >([null]);
  const [accessKey, setAccessKey] = useState('');
  const [scanner, setScanner] = useState(false);
  const supplierRef = useRef<HTMLInputElement>(null);
  const invoiceFormRef = useRef<HTMLFormElement>(null);
  const activeInvoicePeriodId = period?.id;
  useAdvanceOnEnter(invoiceFormRef);

  useEffect(() => {
    if (activeInvoicePeriodId) supplierRef.current?.focus();
  }, [activeInvoicePeriodId]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const success = await act(
      {
        action: 'add_invoice',
        supplier: form.get('supplier'),
        issueDate: form.get('issueDate'),
        invoiceNumber: form.get('invoiceNumber'),
        accessKey,
        dueDates,
        installmentAmountsCents: installmentAmounts,
      },
      'Nota fiscal registrada com sucesso.',
    );
    if (success) {
      formElement.reset();
      setAccessKey('');
      setDueDates([today()]);
      setInstallmentAmounts([null]);
      supplierRef.current?.focus();
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="Relatório"
        title="Notas fiscais"
        description="Registre a confirmação de recebimento e informe todos os vencimentos da nota."
      />
      <PeriodStep
        module="invoices"
        period={period}
        count={records.length}
        working={working}
        onClosePeriod={onClosePeriod}
        onOpen={onOpen}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <FormSection
          title="Preencha os dados da nota"
          description="O valor da nota não é necessário neste controle."
        >
          <form
            ref={invoiceFormRef}
            onSubmit={submit}
            aria-label="Cadastro de nota fiscal"
            className="space-y-4"
          >
            <Field label="Fornecedor">
              <Input
                ref={supplierRef}
                data-entry-field
                name="supplier"
                placeholder="Ex.: Distribuidora Central"
                required
                disabled={!period || working}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Data de emissão" hint="DD/MM/AAAA">
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
                  placeholder="Ex.: 15842"
                  required
                  disabled={!period || working}
                />
              </Field>
            </div>
            <Field label="Chave de acesso" hint="opcional">
              <div className="flex gap-2">
                <Input
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
                  onClick={() => setScanner(true)}
                  disabled={!period || working}
                  className="h-11 shrink-0 px-3"
                >
                  <Camera />
                  <span className="sr-only sm:not-sr-only">Ler</span>
                </Button>
              </div>
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold">
                  Vencimento{dueDates.length > 1 ? 's' : ''}
                  <span className="ml-2 text-xs font-normal text-zinc-400">
                    (DD/MM/AAAA)
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!period}
                  onClick={() => {
                    setDueDates([...dueDates, today()]);
                    setInstallmentAmounts([...installmentAmounts, null]);
                  }}
                  className="text-xs font-bold text-[#765541]"
                >
                  + outro vencimento
                </button>
              </div>
              <div className="space-y-2">
                {dueDates.map((date, index) => (
                  <div key={`due-date-${index}`} className="flex gap-2">
                    <Input
                      type="date"
                      value={date}
                      onChange={(event) =>
                        setDueDates(
                          dueDates.map((item, current) =>
                            current === index ? event.target.value : item,
                          ),
                        )
                      }
                      required
                      disabled={!period || working}
                    />
                    {dueDates.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDueDates(
                            dueDates.filter((_, current) => current !== index),
                          );
                          setInstallmentAmounts(
                            installmentAmounts.filter(
                              (_, current) => current !== index,
                            ),
                          );
                        }}
                        className="h-11 w-11"
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[#d8c9bf] bg-[#f8f4f1] p-3">
              <p className="mb-3 text-sm font-bold text-[#5f4333]">
                {dueDates.length === 1
                  ? 'Valor total da nota'
                  : 'Valor de cada parcela'}
              </p>
              <div className="space-y-3">
                {installmentAmounts.map((amount, index) => (
                  <Field
                    key={`invoice-amount-${index}`}
                    label={
                      dueDates.length === 1 ? 'Valor' : `Parcela ${index + 1}`
                    }
                    hint={`vencimento ${dateLabel(dueDates[index])}`}
                  >
                    <CurrencyInput
                      valueCents={amount}
                      onValueChange={(value) =>
                        setInstallmentAmounts(
                          installmentAmounts.map((item, current) =>
                            current === index ? value : item,
                          ),
                        )
                      }
                      disabled={!period || working}
                      ariaLabel={
                        dueDates.length === 1
                          ? 'Valor total da nota'
                          : `Valor da parcela ${index + 1}`
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
            <SubmitButton disabled={!period || working} working={working}>
              Registrar nota
            </SubmitButton>
            {!period && <DisabledHint />}
          </form>
        </FormSection>
        <RecordsSection
          title="Confira as notas do período"
          count={records.length}
        >
          {records.length ? (
            <InvoiceRecords
              records={records}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <EmptyRecords text="As notas registradas neste período aparecerão aqui." />
          )}
        </RecordsSection>
      </div>
      {scanner && (
        <BarcodeScanner
          onClose={() => setScanner(false)}
          onRead={(value) => {
            setAccessKey(value.replace(/\D/g, '').slice(0, 44));
            setScanner(false);
          }}
        />
      )}
    </>
  );
}

function ExpenseView({
  data,
  period,
  working,
  act,
  onOpen,
  onClosePeriod,
  onEdit,
  onDelete,
}: ModuleProps & RecordActionsProps<Expense>) {
  const records = period
    ? data.expenses.filter((item) => item.periodId === period.id)
    : [];
  const total = records.reduce((sum, item) => sum + item.amountCents, 0);
  const nameRef = useRef<HTMLInputElement>(null);
  const expenseFormRef = useRef<HTMLFormElement>(null);
  const activeExpensePeriodId = period?.id;
  useAdvanceOnEnter(expenseFormRef);

  useEffect(() => {
    if (activeExpensePeriodId) nameRef.current?.focus();
  }, [activeExpensePeriodId]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await act(
        {
          action: 'add_expense',
          name: form.get('name'),
          expenseDate: form.get('expenseDate'),
          amount: form.get('amount'),
          settledDate: form.get('settledDate'),
        },
        'Despesa registrada com sucesso.',
      )
    ) {
      formElement.reset();
      nameRef.current?.focus();
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Relatório"
        title="Despesas"
        description="O total abaixo considera exclusivamente o período que está aberto."
      />
      <PeriodStep
        module="expenses"
        period={period}
        count={records.length}
        total={total}
        working={working}
        onClosePeriod={onClosePeriod}
        onOpen={onOpen}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <FormSection
          title="Preencha os dados da despesa"
          description="A data da baixa pode ser informada depois."
        >
          <form
            ref={expenseFormRef}
            onSubmit={submit}
            aria-label="Cadastro de despesa"
            className="space-y-4"
          >
            <Field label="Nome da despesa">
              <Input
                ref={nameRef}
                data-entry-field
                name="name"
                placeholder="Ex.: Material de limpeza"
                required
                disabled={!period || working}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Data da despesa" hint="DD/MM/AAAA">
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
            <Field label="Data da baixa" hint="opcional · DD/MM/AAAA">
              <Input
                name="settledDate"
                type="date"
                disabled={!period || working}
              />
            </Field>
            <SubmitButton disabled={!period || working} working={working}>
              Registrar despesa
            </SubmitButton>
            {!period && <DisabledHint />}
          </form>
        </FormSection>
        <RecordsSection
          title="Confira as despesas do período"
          count={records.length}
        >
          {records.length ? (
            <ExpenseRecords
              records={records}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <EmptyRecords text="As despesas registradas neste período aparecerão aqui." />
          )}
        </RecordsSection>
      </div>
    </>
  );
}

function DepositView({
  data,
  period,
  working,
  act,
  onOpen,
  onClosePeriod,
  onEdit,
  onDelete,
}: ModuleProps & RecordActionsProps<Deposit>) {
  const records = period
    ? data.deposits.filter((item) => item.periodId === period.id)
    : [];
  const total = records.reduce((sum, item) => sum + item.amountCents, 0);
  const depositDateRef = useRef<HTMLInputElement>(null);
  const depositFormRef = useRef<HTMLFormElement>(null);
  const activeDepositPeriodId = period?.id;
  useAdvanceOnEnter(depositFormRef);

  useEffect(() => {
    if (activeDepositPeriodId) depositDateRef.current?.focus();
  }, [activeDepositPeriodId]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await act(
        {
          action: 'add_deposit',
          depositDate: form.get('depositDate'),
          amount: form.get('amount'),
          depositor: form.get('depositor'),
        },
        'Depósito registrado com sucesso.',
      )
    ) {
      formElement.reset();
      depositDateRef.current?.focus();
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Relatório"
        title="Depósitos"
        description="Registre o valor, a data e o depositante somente quando for necessário."
      />
      <PeriodStep
        module="deposits"
        period={period}
        count={records.length}
        total={total}
        working={working}
        onClosePeriod={onClosePeriod}
        onOpen={onOpen}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <FormSection
          title="Preencha os dados do depósito"
          description="O nome do depositante é opcional."
        >
          <form
            ref={depositFormRef}
            onSubmit={submit}
            aria-label="Cadastro de depósito"
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Data do depósito" hint="DD/MM/AAAA">
                <Input
                  ref={depositDateRef}
                  data-entry-field
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
              <Input
                name="depositor"
                placeholder="Nome de quem depositou"
                disabled={!period || working}
              />
            </Field>
            <SubmitButton disabled={!period || working} working={working}>
              Registrar depósito
            </SubmitButton>
            {!period && <DisabledHint />}
          </form>
        </FormSection>
        <RecordsSection
          title="Confira os depósitos do período"
          count={records.length}
        >
          {records.length ? (
            <DepositRecords
              records={records}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ) : (
            <EmptyRecords text="Os depósitos registrados neste período aparecerão aqui." />
          )}
        </RecordsSection>
      </div>
    </>
  );
}

function HistoryView({
  data,
  currentInvoicePeriod,
  working,
  act,
  onPrint,
}: {
  data: ControlData;
  currentInvoicePeriod: Period | null;
  working: boolean;
  act: ModuleProps['act'];
  onPrint: (periodId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | ModuleName>('all');
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const notes = data.invoices.filter(
    (invoice) =>
      !normalized ||
      `${invoice.supplier} ${invoice.invoiceNumber} ${invoice.periodLabel} ${invoice.accessKey ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalized),
  );
  const periods = data.periods.filter(
    (period) =>
      period.status === 'closed' &&
      (filter === 'all' || period.module === filter),
  );

  return (
    <>
      <PageHeading
        eyebrow="Consulta"
        title="Histórico"
        description="Localize notas antigas ou reabra um período quando precisar corrigir uma informação."
      />
      <section className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <StepNumber number="1" />
          <div className="flex-1">
            <h2 className="font-heading text-lg font-bold">
              Procure uma nota fiscal
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Busque por fornecedor, número, chave de acesso ou nome do período.
            </p>
          </div>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite para pesquisar…"
            className="pl-10"
          />
        </div>
        <div className="mt-4 space-y-2">
          {notes.length ? (
            notes.slice(0, 30).map((invoice) => (
              <article
                key={invoice.id}
                className="rounded-xl border border-zinc-200 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{invoice.supplier}</h3>
                      <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-semibold">
                        NF {invoice.invoiceNumber}
                      </span>
                      {invoice.resentFromId && (
                        <span className="rounded-md bg-[#eee5df] px-2 py-1 text-[11px] font-semibold text-[#765541]">
                          Reenviada
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      {invoice.periodLabel} · Emissão{' '}
                      {dateLabel(invoice.issueDate)}
                    </p>
                    <InvoiceDueValues invoice={invoice} className="mt-1" />
                  </div>
                  <Button
                    variant="outline"
                    disabled={
                      working ||
                      !currentInvoicePeriod ||
                      invoice.periodId === currentInvoicePeriod.id
                    }
                    onClick={() =>
                      void act(
                        { action: 'resend_invoice', invoiceId: invoice.id },
                        'Nota incluída no período atual para reenvio.',
                      )
                    }
                    className="h-11 shrink-0"
                  >
                    <RotateCcw /> Reenviar
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <EmptyRecords text="Nenhuma nota encontrada com essa busca." />
          )}
        </div>
      </section>
      <section className="mt-5 rounded-2xl border border-black/8 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <StepNumber number="2" />
            <div>
              <h2 className="font-heading text-lg font-bold">
                Períodos encerrados
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Para reabrir, primeiro encerre qualquer período atual do mesmo
                relatório.
              </p>
            </div>
          </div>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="all">Todos os relatórios</option>
            <option value="invoices">Notas fiscais</option>
            <option value="expenses">Despesas</option>
            <option value="deposits">Depósitos</option>
          </select>
        </div>
        <div className="mt-4 space-y-2">
          {periods.length ? (
            periods.map((period) => {
              const Icon = moduleInfo[period.module].icon;
              return (
                <article
                  key={period.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{period.label}</h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {moduleInfo[period.module].title} · encerrado em{' '}
                        {dateLabel(period.closedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button
                      onClick={() => onPrint(period.id)}
                      className="h-11 bg-black hover:bg-zinc-800"
                    >
                      <Printer /> Imprimir capa
                    </Button>
                    <Button
                      variant="outline"
                      disabled={working}
                      onClick={() =>
                        void act(
                          { action: 'reopen_period', periodId: period.id },
                          'Período reaberto com todos os registros preservados.',
                        )
                      }
                      className="h-11"
                    >
                      <RotateCcw /> Reabrir
                    </Button>
                  </div>
                </article>
              );
            })
          ) : (
            <EmptyRecords text="Nenhum período encerrado neste filtro." />
          )}
        </div>
      </section>
    </>
  );
}

function PrintCover({
  data,
  periodId,
  onClose,
}: {
  data: ControlData;
  periodId: string;
  onClose: () => void;
}) {
  const period = data.periods.find((item) => item.id === periodId);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  if (!period) return null;

  const invoices = data.invoices.filter((item) => item.periodId === period.id);
  const expenses = data.expenses.filter((item) => item.periodId === period.id);
  const deposits = data.deposits.filter((item) => item.periodId === period.id);
  const records =
    period.module === 'invoices'
      ? invoices
      : period.module === 'expenses'
        ? expenses
        : deposits;
  const total =
    period.module === 'expenses'
      ? expenses.reduce((sum, item) => sum + item.amountCents, 0)
      : period.module === 'deposits'
        ? deposits.reduce((sum, item) => sum + item.amountCents, 0)
        : null;
  const invoiceColumnCount =
    period.module === 'invoices'
      ? invoices.length > 24
        ? 3
        : invoices.length > 12
          ? 2
          : 1
      : 1;
  const landscapeInvoices = invoiceColumnCount > 1;
  const invoicesPerColumn = Math.ceil(invoices.length / invoiceColumnCount);
  const invoiceGroups = Array.from({ length: invoiceColumnCount }, (_, index) =>
    invoices.slice(index * invoicesPerColumn, (index + 1) * invoicesPerColumn),
  );
  const printDensity =
    period.module === 'invoices'
      ? ''
      : records.length > 60
        ? 'print-density-ultra'
        : records.length > 40
          ? 'print-density-tight'
          : records.length > 22
            ? 'print-density-compact'
            : '';

  return (
    <dialog
      open
      className="print-cover-shell fixed inset-0 z-[100] h-full w-full max-w-none overflow-y-auto border-0 bg-zinc-200 px-3 py-4 sm:px-6 sm:py-6"
      aria-modal="true"
      aria-label="Capa do período encerrado"
    >
      <div
        className={`print-actions sticky top-0 z-10 mx-auto mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-lg sm:p-4 ${landscapeInvoices ? 'max-w-[297mm]' : 'max-w-[210mm]'}`}
      >
        <div>
          <p className="text-sm font-bold">Capa pronta</p>
          <p className="text-xs text-zinc-500">
            Confira as informações antes de imprimir.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            aria-label="Fechar capa"
            className="h-11"
          >
            <X /> <span className="hidden sm:inline">Fechar</span>
          </Button>
          <Button
            onClick={() => window.print()}
            className="h-11 bg-black hover:bg-zinc-800"
          >
            <Printer /> Imprimir
          </Button>
        </div>
      </div>

      <article
        className={`print-document ${printDensity} ${landscapeInvoices ? 'print-invoice-landscape min-h-[210mm] max-w-[297mm]' : 'min-h-[297mm] max-w-[210mm]'} mx-auto w-full bg-white p-6 text-black shadow-2xl sm:p-10`}
      >
        <header className="print-document-header flex items-center justify-between gap-6 border-b-2 border-black bg-black px-6 py-4 text-white">
          <Image
            src="/logo-top-haus.jpg"
            alt="Top Haus"
            width={142}
            height={88}
            className="print-cover-logo h-12 w-auto"
          />
          <div className="text-right">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/60">
              Controle interno
            </p>
            <h1 className="mt-1 text-lg font-extrabold">
              Relatório de {moduleInfo[period.module].title.toLowerCase()}
            </h1>
          </div>
        </header>

        <section className="print-summary border-x border-b border-black/15 px-6 py-5">
          <h2 className="print-summary-title text-xl font-extrabold">
            {period.label}
          </h2>

          <div className="print-meta-grid mt-4 grid grid-cols-3 gap-3">
            <PrintMeta label="Abertura" value={dateLabel(period.openedAt)} />
            <PrintMeta label="Fechamento" value={dateLabel(period.closedAt)} />
            <PrintMeta
              label="Lançamentos"
              value={`${records.length} ${records.length === 1 ? 'item' : 'itens'}`}
            />
          </div>

          {total !== null && (
            <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-xl bg-[#eee5df] px-5 py-4 sm:flex-row sm:items-end sm:gap-6">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#765541]">
                  {period.module === 'expenses'
                    ? 'Total de despesas'
                    : 'Total depositado'}
                </p>
                <p className="mt-1 text-xs text-[#765541]">
                  Somente os lançamentos deste período
                </p>
              </div>
              <p className="text-2xl font-extrabold">{currency(total)}</p>
            </div>
          )}
        </section>

        <section className="print-records-section mt-5">
          <div className="print-records-heading mb-2 flex items-end justify-between gap-4">
            <h3 className="text-base font-extrabold">Lançamentos do período</h3>
            <p className="text-xs font-bold text-zinc-500">
              {records.length} {records.length === 1 ? 'registro' : 'registros'}
            </p>
          </div>

          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500">
              Este período foi encerrado sem lançamentos.
            </div>
          ) : period.module === 'invoices' ? (
            landscapeInvoices ? (
              <div
                className={`print-invoice-grid grid grid-cols-1 gap-4 ${invoiceColumnCount === 3 ? 'print-invoice-columns-3 lg:grid-cols-3' : 'print-invoice-columns-2 lg:grid-cols-2'}`}
              >
                {invoiceGroups.map((group, index) => (
                  <PrintInvoiceCards
                    key={`invoice-column-${index}`}
                    records={group}
                  />
                ))}
              </div>
            ) : (
              <PrintInvoiceTable records={invoices} />
            )
          ) : period.module === 'expenses' ? (
            <PrintExpenseTable records={expenses} />
          ) : (
            <PrintDepositTable records={deposits} />
          )}
        </section>
      </article>
    </dialog>
  );
}

function PrintMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-3 py-3">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-zinc-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function PrintInvoiceTable({ records }: { records: Invoice[] }) {
  return (
    <div className="print-table overflow-hidden rounded-xl border border-zinc-300">
      <table className="w-full table-fixed text-left text-[10px]">
        <thead className="bg-black text-white">
          <tr>
            <PrintTh className="w-[34%]">Fornecedor</PrintTh>
            <PrintTh className="w-[15%]">Emissão</PrintTh>
            <PrintTh className="w-[16%]">Nota</PrintTh>
            <PrintTh className="w-[35%]">Vencimento(s) e valor(es)</PrintTh>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id} className="border-t border-zinc-200 align-top">
              <PrintTd strong>{item.supplier}</PrintTd>
              <PrintTd>{dateLabel(item.issueDate)}</PrintTd>
              <PrintTd>{item.invoiceNumber}</PrintTd>
              <PrintTd>
                <InvoiceDueValues invoice={item} />
              </PrintTd>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintInvoiceCards({ records }: { records: Invoice[] }) {
  return (
    <div className="print-invoice-column overflow-hidden rounded-lg border border-zinc-400 bg-white">
      {records.map((item) => (
        <article
          key={item.id}
          className="print-invoice-item border-b border-zinc-300 px-3 py-2 last:border-b-0"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-extrabold text-black">{item.supplier}</p>
            <p className="shrink-0 font-extrabold text-black">
              NF {item.invoiceNumber}
            </p>
          </div>
          <p className="mt-0.5 font-semibold text-zinc-800">
            Emissão: {dateLabel(item.issueDate)}
          </p>
          <InvoiceDueValues
            invoice={item}
            className="mt-0.5 font-semibold text-zinc-900"
          />
        </article>
      ))}
    </div>
  );
}

function PrintExpenseTable({ records }: { records: Expense[] }) {
  return (
    <div className="print-table overflow-hidden rounded-xl border border-zinc-300">
      <table className="w-full table-fixed text-left text-[10px]">
        <thead className="bg-black text-white">
          <tr>
            <PrintTh className="w-[38%]">Despesa</PrintTh>
            <PrintTh className="w-[20%]">Data</PrintTh>
            <PrintTh className="w-[22%]">Valor</PrintTh>
            <PrintTh className="w-[20%]">Baixa</PrintTh>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id} className="border-t border-zinc-200 align-top">
              <PrintTd strong>{item.name}</PrintTd>
              <PrintTd>{dateLabel(item.expenseDate)}</PrintTd>
              <PrintTd strong>{currency(item.amountCents)}</PrintTd>
              <PrintTd>{dateLabel(item.settledDate)}</PrintTd>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintDepositTable({ records }: { records: Deposit[] }) {
  return (
    <div className="print-table overflow-hidden rounded-xl border border-zinc-300">
      <table className="w-full table-fixed text-left text-[10px]">
        <thead className="bg-black text-white">
          <tr>
            <PrintTh className="w-[28%]">Data</PrintTh>
            <PrintTh className="w-[44%]">Depositante</PrintTh>
            <PrintTh className="w-[28%]">Valor</PrintTh>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id} className="border-t border-zinc-200 align-top">
              <PrintTd>{dateLabel(item.depositDate)}</PrintTd>
              <PrintTd strong>{item.depositor ?? 'Não informado'}</PrintTd>
              <PrintTd strong>{currency(item.amountCents)}</PrintTd>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintTh({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-3 font-extrabold uppercase tracking-[0.08em] ${className}`}
    >
      {children}
    </th>
  );
}

function PrintTd({
  children,
  strong,
  className = '',
}: {
  children: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-normal px-3 py-3 leading-4 text-zinc-600 ${strong ? 'font-bold text-black' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/15 bg-white shadow-[0_14px_35px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3 bg-[#17120f] p-4 text-white sm:p-5">
        <StepNumber number="2" />
        <div>
          <h2 className="font-heading text-lg font-extrabold">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-white/60">{description}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#d2b8a7]">
            <Keyboard className="size-3.5" /> Tab avança · Enter confirma o
            campo
          </p>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function RecordsSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-black/15 bg-white shadow-[0_14px_35px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-4 border-b border-black/10 bg-[#eee9e5] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <StepNumber number="3" />
          <div>
            <h2 className="font-heading text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Somente o período aberto aparece nesta lista.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-500">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function StepNumber({ number }: { number: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#765541] text-xs font-bold text-white">
      {number}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {label}
        {hint && <small className="font-normal text-zinc-400">({hint})</small>}
      </span>
      {children}
    </label>
  );
}

function CurrencyInput({
  valueCents,
  onValueChange,
  disabled = false,
  ariaLabel,
}: {
  valueCents: number | null;
  onValueChange: (value: number | null) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(
    valueCents === null
      ? ''
      : new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(valueCents / 100),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(
        valueCents === null
          ? ''
          : new Intl.NumberFormat('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(valueCents / 100),
      );
    }
  }, [valueCents]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">
        R$
      </span>
      <Input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onValueChange(parseCurrencyDraft(event.target.value));
        }}
        onBlur={() => {
          setDraft(
            valueCents === null
              ? ''
              : new Intl.NumberFormat('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(valueCents / 100),
          );
        }}
        placeholder="0,00"
        aria-label={ariaLabel}
        required
        disabled={disabled}
        className="pl-10 text-right tabular-nums"
      />
    </div>
  );
}

function SubmitButton({
  children,
  disabled,
  working,
}: {
  children: ReactNode;
  disabled: boolean;
  working: boolean;
}) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      className="h-12 w-full bg-black text-sm font-bold hover:bg-zinc-800"
    >
      {working ? <Loader2 className="animate-spin" /> : <Plus />}
      {children}
    </Button>
  );
}

function DisabledHint() {
  return (
    <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-zinc-400">
      <CalendarDays className="size-4 shrink-0" /> Abra o período acima para
      liberar o cadastro.
    </p>
  );
}

function EmptyRecords({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-300">
        <Check className="size-5" />
      </span>
      <p className="mt-3 max-w-xs text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}

function InvoiceDueValues({
  invoice,
  className = '',
}: {
  invoice: Invoice;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 leading-5 ${className}`}>
      {invoice.dueDates.map((dueDate, index) => {
        const amount = invoice.installmentAmountsCents?.[index];
        return (
          <div key={`${invoice.id}-due-${index}`}>
            {invoice.dueDates.length > 1 && `${index + 1}ª parcela: `}
            {dateLabel(dueDate)} ·{' '}
            <span className="font-bold text-current">
              {typeof amount === 'number'
                ? currency(amount)
                : 'Valor não informado'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InvoiceRecords({
  records,
  onEdit,
  onDelete,
}: { records: Invoice[] } & RecordActionsProps<Invoice>) {
  return (
    <>
      <div className="divide-y divide-zinc-100 md:hidden">
        {records.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{item.supplier}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  NF {item.invoiceNumber}
                </p>
              </div>
              {item.resentFromId && (
                <span className="rounded-md bg-[#eee5df] px-2 py-1 text-[10px] font-bold text-[#765541]">
                  Reenvio
                </span>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-xs">
              <div>
                <dt className="text-zinc-400">Emissão</dt>
                <dd className="mt-1 font-semibold">
                  {dateLabel(item.issueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">Vencimento(s)</dt>
                <dd className="mt-1 font-semibold">
                  <InvoiceDueValues invoice={item} />
                </dd>
              </div>
            </dl>
            <RecordButtons record={item} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Fornecedor</Th>
              <Th>Emissão</Th>
              <Th>Número</Th>
              <Th>Vencimento(s) e valor(es)</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id} className="border-t border-zinc-100">
                <Td strong>
                  {item.supplier}
                  {item.resentFromId && (
                    <span className="ml-2 rounded bg-[#eee5df] px-2 py-1 text-[10px] text-[#765541]">
                      Reenvio
                    </span>
                  )}
                </Td>
                <Td>{dateLabel(item.issueDate)}</Td>
                <Td>{item.invoiceNumber}</Td>
                <Td>
                  <InvoiceDueValues invoice={item} />
                </Td>
                <Td>
                  <RecordButtons
                    record={item}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compact
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExpenseRecords({
  records,
  onEdit,
  onDelete,
}: { records: Expense[] } & RecordActionsProps<Expense>) {
  return (
    <>
      <div className="divide-y divide-zinc-100 md:hidden">
        {records.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{item.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {dateLabel(item.expenseDate)}
                </p>
              </div>
              <p className="font-bold">{currency(item.amountCents)}</p>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Baixa:{' '}
              <span className="font-semibold text-zinc-700">
                {dateLabel(item.settledDate)}
              </span>
            </p>
            <RecordButtons record={item} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Despesa</Th>
              <Th>Data</Th>
              <Th>Valor</Th>
              <Th>Baixa</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id} className="border-t border-zinc-100">
                <Td strong>{item.name}</Td>
                <Td>{dateLabel(item.expenseDate)}</Td>
                <Td strong>{currency(item.amountCents)}</Td>
                <Td>{dateLabel(item.settledDate)}</Td>
                <Td>
                  <RecordButtons
                    record={item}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compact
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DepositRecords({
  records,
  onEdit,
  onDelete,
}: { records: Deposit[] } & RecordActionsProps<Deposit>) {
  return (
    <>
      <div className="divide-y divide-zinc-100 md:hidden">
        {records.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {item.depositor ?? 'Depositante não informado'}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {dateLabel(item.depositDate)}
                </p>
              </div>
              <p className="font-bold">{currency(item.amountCents)}</p>
            </div>
            <RecordButtons record={item} onEdit={onEdit} onDelete={onDelete} />
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Depositante</Th>
              <Th>Valor</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id} className="border-t border-zinc-100">
                <Td>{dateLabel(item.depositDate)}</Td>
                <Td strong>{item.depositor ?? 'Não informado'}</Td>
                <Td strong>{currency(item.amountCents)}</Td>
                <Td>
                  <RecordButtons
                    record={item}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    compact
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RecordButtons<T>({
  record,
  onEdit,
  onDelete,
  compact = false,
}: RecordActionsProps<T> & { record: T; compact?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 ${compact ? '' : 'mt-3 border-t border-zinc-100 pt-3'}`}
    >
      <Button
        type="button"
        variant="outline"
        onClick={() => onEdit(record)}
        className={compact ? 'h-9 w-9 px-0' : 'h-10 flex-1'}
        aria-label="Editar lançamento"
        title="Editar lançamento"
      >
        <Pencil /> <span className={compact ? 'sr-only' : ''}>Editar</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => onDelete(record)}
        className={`${compact ? 'h-9 w-9 px-0' : 'h-10 flex-1'} border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800`}
        aria-label="Excluir lançamento"
        title="Excluir lançamento"
      >
        <Trash2 /> <span className={compact ? 'sr-only' : ''}>Excluir</span>
      </Button>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
      {children}
    </th>
  );
}
function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-5 py-4 text-zinc-600 ${strong ? 'font-semibold text-zinc-900' : ''}`}
    >
      {children}
    </td>
  );
}

function EditRecordModal({
  target,
  working,
  act,
  onClose,
}: {
  target: RecordTarget;
  working: boolean;
  act: ModuleProps['act'];
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, working]);

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="edit-record-title"
      className="fixed inset-0 z-[70] flex h-full w-full max-w-none items-start justify-center overflow-y-auto border-0 bg-black/60 p-3 sm:items-center sm:p-6"
    >
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-[#17120f] p-5 text-white">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#d2b8a7]">
              <Pencil className="size-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                Corrigir lançamento
              </p>
              <h2
                id="edit-record-title"
                className="font-heading mt-1 text-lg font-extrabold"
              >
                Editar {moduleInfo[target.module].singular}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            aria-label="Fechar edição"
            className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="p-5">
          {target.module === 'invoices' ? (
            <EditInvoiceForm
              record={target.record}
              working={working}
              act={act}
              onClose={onClose}
            />
          ) : target.module === 'expenses' ? (
            <EditExpenseForm
              record={target.record}
              working={working}
              act={act}
              onClose={onClose}
            />
          ) : (
            <EditDepositForm
              record={target.record}
              working={working}
              act={act}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

function EditInvoiceForm({
  record,
  working,
  act,
  onClose,
}: {
  record: Invoice;
  working: boolean;
  act: ModuleProps['act'];
  onClose: () => void;
}) {
  const [dueDates, setDueDates] = useState(
    record.dueDates.length ? record.dueDates : [today()],
  );
  const [installmentAmounts, setInstallmentAmounts] = useState<
    Array<number | null>
  >(
    record.dueDates.map(
      (_, index) => record.installmentAmountsCents?.[index] ?? null,
    ),
  );
  const [accessKey, setAccessKey] = useState(record.accessKey ?? '');
  const formRef = useRef<HTMLFormElement>(null);
  const supplierRef = useRef<HTMLInputElement>(null);
  useAdvanceOnEnter(formRef);

  useEffect(() => {
    supplierRef.current?.focus();
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await act(
        {
          action: 'update_invoice',
          invoiceId: record.id,
          supplier: form.get('supplier'),
          issueDate: form.get('issueDate'),
          invoiceNumber: form.get('invoiceNumber'),
          accessKey,
          dueDates,
          installmentAmountsCents: installmentAmounts,
        },
        'Nota fiscal corrigida com sucesso.',
      )
    ) {
      onClose();
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <Field label="Fornecedor">
        <Input
          ref={supplierRef}
          name="supplier"
          defaultValue={record.supplier}
          required
          disabled={working}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data de emissão" hint="DD/MM/AAAA">
          <Input
            name="issueDate"
            type="date"
            defaultValue={record.issueDate}
            required
            disabled={working}
          />
        </Field>
        <Field label="Número da nota">
          <Input
            name="invoiceNumber"
            defaultValue={record.invoiceNumber}
            required
            disabled={working}
          />
        </Field>
      </div>
      <Field label="Chave de acesso" hint="opcional">
        <Input
          inputMode="numeric"
          maxLength={44}
          value={accessKey}
          onChange={(event) =>
            setAccessKey(event.target.value.replace(/\D/g, '').slice(0, 44))
          }
          disabled={working}
        />
      </Field>
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Vencimento(s)</span>
          <button
            type="button"
            onClick={() => {
              setDueDates([...dueDates, today()]);
              setInstallmentAmounts([...installmentAmounts, null]);
            }}
            disabled={working}
            className="text-xs font-bold text-[#765541]"
          >
            + outro vencimento
          </button>
        </div>
        <div className="space-y-2">
          {dueDates.map((date, index) => (
            <div key={`edit-due-date-${index}`} className="flex gap-2">
              <Input
                type="date"
                value={date}
                onChange={(event) =>
                  setDueDates(
                    dueDates.map((item, current) =>
                      current === index ? event.target.value : item,
                    ),
                  )
                }
                required
                disabled={working}
              />
              {dueDates.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setDueDates(
                      dueDates.filter((_, current) => current !== index),
                    );
                    setInstallmentAmounts(
                      installmentAmounts.filter(
                        (_, current) => current !== index,
                      ),
                    );
                  }}
                  className="h-11 w-11"
                  aria-label="Remover vencimento"
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-[#d8c9bf] bg-[#f8f4f1] p-3">
        <p className="mb-3 text-sm font-bold text-[#5f4333]">
          {dueDates.length === 1
            ? 'Valor total da nota'
            : 'Valor de cada parcela'}
        </p>
        <div className="space-y-3">
          {installmentAmounts.map((amount, index) => (
            <Field
              key={`edit-invoice-amount-${index}`}
              label={dueDates.length === 1 ? 'Valor' : `Parcela ${index + 1}`}
              hint={`vencimento ${dateLabel(dueDates[index])}`}
            >
              <CurrencyInput
                valueCents={amount}
                onValueChange={(value) =>
                  setInstallmentAmounts(
                    installmentAmounts.map((item, current) =>
                      current === index ? value : item,
                    ),
                  )
                }
                disabled={working}
                ariaLabel={
                  dueDates.length === 1
                    ? 'Valor total da nota'
                    : `Valor da parcela ${index + 1}`
                }
              />
            </Field>
          ))}
        </div>
      </div>
      <EditFormActions working={working} onClose={onClose} />
    </form>
  );
}

function EditExpenseForm({
  record,
  working,
  act,
  onClose,
}: {
  record: Expense;
  working: boolean;
  act: ModuleProps['act'];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useAdvanceOnEnter(formRef);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await act(
        {
          action: 'update_expense',
          expenseId: record.id,
          name: form.get('name'),
          expenseDate: form.get('expenseDate'),
          amount: form.get('amount'),
          settledDate: form.get('settledDate'),
        },
        'Despesa corrigida com sucesso.',
      )
    ) {
      onClose();
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <Field label="Nome da despesa">
        <Input
          ref={nameRef}
          name="name"
          defaultValue={record.name}
          required
          disabled={working}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data da despesa" hint="DD/MM/AAAA">
          <Input
            name="expenseDate"
            type="date"
            defaultValue={record.expenseDate}
            required
            disabled={working}
          />
        </Field>
        <Field label="Valor">
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={(record.amountCents / 100).toFixed(2)}
            required
            disabled={working}
          />
        </Field>
      </div>
      <Field label="Data da baixa" hint="opcional · DD/MM/AAAA">
        <Input
          name="settledDate"
          type="date"
          defaultValue={record.settledDate ?? ''}
          disabled={working}
        />
      </Field>
      <EditFormActions working={working} onClose={onClose} />
    </form>
  );
}

function EditDepositForm({
  record,
  working,
  act,
  onClose,
}: {
  record: Deposit;
  working: boolean;
  act: ModuleProps['act'];
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  useAdvanceOnEnter(formRef);

  useEffect(() => {
    dateRef.current?.focus();
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      await act(
        {
          action: 'update_deposit',
          depositId: record.id,
          depositDate: form.get('depositDate'),
          amount: form.get('amount'),
          depositor: form.get('depositor'),
        },
        'Depósito corrigido com sucesso.',
      )
    ) {
      onClose();
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data do depósito" hint="DD/MM/AAAA">
          <Input
            ref={dateRef}
            name="depositDate"
            type="date"
            defaultValue={record.depositDate}
            required
            disabled={working}
          />
        </Field>
        <Field label="Valor">
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={(record.amountCents / 100).toFixed(2)}
            required
            disabled={working}
          />
        </Field>
      </div>
      <Field label="Depositante" hint="opcional">
        <Input
          name="depositor"
          defaultValue={record.depositor ?? ''}
          disabled={working}
        />
      </Field>
      <EditFormActions working={working} onClose={onClose} />
    </form>
  );
}

function EditFormActions({
  working,
  onClose,
}: {
  working: boolean;
  onClose: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        disabled={working}
        className="h-11"
      >
        Cancelar
      </Button>
      <Button
        type="submit"
        disabled={working}
        className="h-11 bg-black text-white hover:bg-zinc-800"
      >
        {working ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar correção
      </Button>
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
  act: ModuleProps['act'];
}) {
  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act(
      { action: 'open_period', module, label: form.get('label') },
      `Período de ${moduleInfo[module].title.toLocaleLowerCase('pt-BR')} aberto.`,
    );
  }
  const suggestion = `${moduleInfo[module].shortTitle} · ${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())}`;
  return (
    <dialog
      open
      aria-modal="true"
      className="fixed inset-0 z-50 flex h-full w-full max-w-none items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="flex items-start justify-between">
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#eee5df] text-[#765541]">
            <CalendarDays className="size-5" />
          </span>
          <button onClick={onClose} aria-label="Fechar">
            <X className="size-5 text-zinc-400" />
          </button>
        </div>
        <h2 className="font-heading mt-5 text-xl font-bold">
          Abrir período de {moduleInfo[module].title.toLocaleLowerCase('pt-BR')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Ele será independente dos outros relatórios e permanecerá aberto até
          você encerrá-lo.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <Field label="Como deseja identificar este período?">
            <Input name="label" defaultValue={suggestion} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-12"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={working}
              className="h-12 bg-black hover:bg-zinc-800"
            >
              {working ? <Loader2 className="animate-spin" /> : <Plus />} Abrir
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
  const [message, setMessage] = useState(
    'Aponte a câmera para o código de barras da DANFE.',
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
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
        setMessage(
          'Este navegador não oferece leitura pela câmera. Digite a chave manualmente.',
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
            const value = (await detector.detect(video))[0]?.rawValue;
            if (value) {
              onRead(value);
              return;
            }
          } catch {
            /* mantém a leitura ativa */
          }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch {
        setMessage(
          'Não foi possível acessar a câmera. Verifique a permissão ou digite a chave manualmente.',
        );
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onRead]);

  return (
    <dialog
      open
      aria-modal="true"
      className="fixed inset-0 z-[60] flex h-full w-full max-w-none items-center justify-center bg-black/80 p-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between p-4">
          <div>
            <h2 className="font-heading font-bold">Ler código da nota</h2>
            <p className="mt-1 text-xs text-zinc-500">
              A chave será preenchida automaticamente.
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
        <p className="p-4 text-center text-sm leading-6 text-zinc-600">
          {message}
        </p>
      </div>
    </dialog>
  );
}
