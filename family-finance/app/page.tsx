"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
  Pencil,
  CreditCard,
  Landmark,
  List,
} from "lucide-react";

const LEDGER_TITLES = ["Настя", "Глеб", "Еда", "ВБ", "Кредиты"];

type Category = {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  ledger_id: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
      HapticFeedback?: any;
    };
  }
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [activeTab, setActiveTab] = useState("Настя");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Транзакции
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [comment, setComment] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [catTxOpen, setCatTxOpen] = useState(false);

  // Категории
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [catDrawerOpen, setCatDrawerOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catType, setCatType] = useState<"income" | "expense">("expense");
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  // Кредиты/карты
  const [creditDrawerOpen, setCreditDrawerOpen] = useState(false);
  const [creditName, setCreditName] = useState("");
  const [creditDebt, setCreditDebt] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditTransferLimit, setCreditTransferLimit] = useState("");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [creditType, setCreditType] = useState<"loan" | "credit_card">("loan");
  const [editingCredit, setEditingCredit] = useState<any | null>(null);

  // Модалки
  const [selectedCat, setSelectedCat] = useState<{ name: string; id: string | null; type: string } | null>(null);
  const [allTxOpen, setAllTxOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTable, setDeleteTable] = useState<"transactions" | "credit_items" | "categories" | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      initApp();
    }
  }, []);

  async function initApp() {
    try {
      setLoading(true);

      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      const tgUser = tg?.initDataUnsafe?.user || {
        id: 464444608,
        first_name: "Глеб (демо)",
      };

      let { data: currProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("telegram_id", tgUser.id)
        .maybeSingle();

      if (!currProfile) {
        const { data: family } = await supabase
          .from("families")
          .insert({ name: `${tgUser.first_name}'s Family` })
          .select()
          .single();

        if (family?.id) {
          const { data: newProfile } = await supabase
            .from("profiles")
            .insert({
              telegram_id: tgUser.id,
              family_id: family.id,
              display_name: tgUser.first_name,
              role: "admin",
            })
            .select()
            .single();

          currProfile = newProfile;
        }
      }

      setProfile(currProfile);

      if (!currProfile?.family_id) {
        console.error("Нет family_id");
        return;
      }

      let { data: currLedgers } = await supabase
        .from("ledgers")
        .select("*")
        .eq("family_id", currProfile.family_id);

      if (!currLedgers?.length) {
        const inserts = LEDGER_TITLES.map((title) => ({
          family_id: currProfile.family_id,
          title,
          type: title === "Кредиты" ? "credit" : "standard",
        }));

        const { data: created } = await supabase
          .from("ledgers")
          .insert(inserts)
          .select();

        currLedgers = created || [];
      }

      setLedgers(currLedgers);
      await refreshData(currLedgers.map((l: any) => l.id));
    } catch (e) {
      console.error("Init error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshData(ledgerIds: string[]) {
    if (!ledgerIds?.length) return;

    const { data: tx } = await supabase
      .from("transactions")
      .select("*")
      .in("ledger_id", ledgerIds)
      .order("transaction_date", { ascending: false });

    const { data: cr } = await supabase
      .from("credit_items")
      .select("*")
      .in("ledger_id", ledgerIds);

    const { data: cats } = await supabase
      .from("categories")
      .select("*")
      .in("ledger_id", ledgerIds);

    setTransactions(tx || []);
    setCredits(cr || []);
    setCategories(cats || []);
  }

  const currentLedger = ledgers.find((l: any) => l.title === activeTab);

  const pageData = useMemo(() => {
    if (!currentLedger) return null;

    const filtered = transactions.filter(
      (t: any) =>
        t.ledger_id === currentLedger.id &&
        t.transaction_date?.startsWith(selectedMonth)
    );

    const incomeTx = filtered.filter((t: any) => t.transaction_type === "income");
    const expenseTx = filtered.filter((t: any) => t.transaction_type === "expense");

    const income = incomeTx.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);
    const expense = expenseTx.reduce((acc: number, t: any) => acc + (Number(t.amount) || 0), 0);

    const group = (items: any[]) => {
      const map: Record<string, { name: string; total: number; type: string; icon: string | null }> = {};
      items.forEach((t: any) => {
        const catId = t.category_id;
        const fallback = t.comment || "Без категории";
        const key = catId || fallback;

        if (!map[key]) {
          const cat = categories.find((c: Category) => c.id === catId);
          map[key] = {
            name: cat ? cat.name : fallback,
            total: 0,
            type: t.transaction_type,
            icon: cat?.icon || null,
          };
        }
        map[key].total += Number(t.amount) || 0;
      });
      return Object.values(map);
    };

    return {
      ledger: currentLedger,
      incomeGroups: group(incomeTx),
      expenseGroups: group(expenseTx),
      balance: income - expense,
      income,
      expense,
      credits: credits.filter((c: any) => c.ledger_id === currentLedger.id),
    };
  }, [activeTab, transactions, credits, categories, selectedMonth, ledgers]);

  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  // Добавление/редактирование транзакции
  const handleTxSubmit = useCallback(async () => {
    if (!amount || !currentLedger || !supabase) return;
    const num = parseFloat(amount);
    if (isNaN(num)) return;

    const payload = {
      ledger_id: currentLedger.id,
      profile_id: profile?.id,
      amount: num,
      transaction_type: type,
      category_id: selectedCategoryId || null,
      comment: comment.trim() || null,
      transaction_date: new Date().toISOString(),
    };

    let error;
    if (editingTx) {
      ({ error } = await supabase.from("transactions").update(payload).eq("id", editingTx.id));
    } else {
      ({ error } = await supabase.from("transactions").insert(payload));
    }

    if (error) {
      console.error("Ошибка:", error);
      return;
    }

    setAmount("");
    setComment("");
    setSelectedCategoryId(null);
    setEditingTx(null);
    setTxDialogOpen(false);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    refreshData(ledgers.map((l: any) => l.id));
  }, [amount, currentLedger, supabase, type, selectedCategoryId, comment, editingTx, profile, ledgers]);

  // Добавление/редактирование категории
  const handleCategorySubmit = useCallback(async () => {
    if (!catName || !currentLedger || !supabase) return;

    const payload = {
      ledger_id: currentLedger.id,
      name: catName,
      icon: catIcon || null,
      type: catType,
    };

    let error;
    if (editingCat) {
      ({ error } = await supabase.from("categories").update(payload).eq("id", editingCat.id));
    } else {
      ({ error } = await supabase.from("categories").insert(payload));
    }

    if (error) {
      console.error("Ошибка:", error);
      return;
    }

    setCatName("");
    setCatIcon("");
    setCatType("expense");
    setEditingCat(null);
    setCatDrawerOpen(false);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    refreshData(ledgers.map((l: any) => l.id));
  }, [catName, catIcon, catType, editingCat, currentLedger, supabase, ledgers]);

  // Добавление/редактирование кредита/карты
  const handleCreditSubmit = useCallback(async () => {
    if (!creditName || !currentLedger || !supabase) return;

    const payload = {
      ledger_id: currentLedger.id,
      name: creditName,
      total_debt: parseFloat(creditDebt) || 0,
      credit_limit: creditType === "credit_card" ? parseFloat(creditLimit) || 0 : 0,
      transfer_limit: creditType === "credit_card" ? parseFloat(creditTransferLimit) || 0 : 0,
      due_date: creditDueDate || null,
      item_type: creditType,
    };

    let error;
    if (editingCredit) {
      ({ error } = await supabase.from("credit_items").update(payload).eq("id", editingCredit.id));
    } else {
      ({ error } = await supabase.from("credit_items").insert(payload));
    }

    if (error) {
      console.error("Ошибка:", error);
      return;
    }

    setCreditName("");
    setCreditDebt("");
    setCreditLimit("");
    setCreditTransferLimit("");
    setCreditDueDate("");
    setCreditType("loan");
    setEditingCredit(null);
    setCreditDrawerOpen(false);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    refreshData(ledgers.map((l: any) => l.id));
  }, [creditName, creditDebt, creditLimit, creditTransferLimit, creditDueDate, creditType, editingCredit, currentLedger, supabase, ledgers]);

  // Удаление
  const handleDelete = useCallback(async (id: string, table: "transactions" | "credit_items" | "categories") => {
    if (!confirm("Удалить?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) {
      refreshData(ledgers.map((l: any) => l.id));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    }
    setDeleteDialogOpen(false);
    setDeleteId(null);
    setDeleteTable(null);
  }, [supabase, ledgers]);

  // Открытие редактирования категории
  const openEditCategory = useCallback((cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon || "");
    setCatType(cat.type as "income" | "expense");
    setCatDrawerOpen(true);
  }, []);

  const transactionsByCategory = useMemo(() => {
    if (!selectedCat || !currentLedger) return [];
    return transactions
      .filter(
        (t: any) =>
          t.ledger_id === currentLedger.id &&
          t.category_id === selectedCat.id &&
          t.transaction_date?.startsWith(selectedMonth)
      )
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [selectedCat, transactions, currentLedger, selectedMonth]);

  const allTransactions = useMemo(() => {
    if (!currentLedger) return [];
    return transactions
      .filter((t: any) => t.ledger_id === currentLedger.id && t.transaction_date?.startsWith(selectedMonth))
      .sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [transactions, currentLedger, selectedMonth]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-t-indigo-500 border-zinc-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentLedger) return <div className="p-10 text-center text-2xl text-white">Раздел не найден</div>;

  const isCredit = activeTab === "Кредиты";

  return (
    <main className="min-h-screen bg-black text-white pb-32 px-4">
      {/* Header */}
      <div className="flex justify-between items-center py-6">
        <h1 className="text-3xl font-bold">PNL Finance</h1>
        <div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800">
          <Calendar size={18} />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      {/* Баланс */}
      {!isCredit && pageData && (
        <Card className="mb-8 bg-zinc-900 border-zinc-800 rounded-xl p-6">
          <p className="text-sm text-zinc-400 mb-2">{activeTab} • Баланс</p>
          <div className="text-4xl font-bold mb-6">{pageData.balance.toLocaleString("ru-RU")} ₽</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-950/30 p-4 rounded-lg border border-emerald-900/50">
              <p className="text-emerald-400 font-medium">+{pageData.income.toLocaleString("ru-RU")}</p>
            </div>
            <div className="bg-red-950/30 p-4 rounded-lg border border-red-900/50">
              <p className="text-red-400 font-medium">-{pageData.expense.toLocaleString("ru-RU")}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Контент */}
      {!isCredit ? (
        <div className="space-y-10">
          {/* Доходы */}
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-300 mb-4">
              <ArrowUpCircle size={24} /> Доходы
            </h2>

            {pageData?.incomeGroups.length ? (
              pageData.incomeGroups.map((g, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "income" })}
                  className="bg-zinc-900 p-5 rounded-xl mb-4 border border-zinc-800 hover:border-emerald-700 cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {g.icon && <span className="text-3xl">{g.icon}</span>}
                      <span className="font-medium">{g.name}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">+{g.total.toLocaleString("ru-RU")}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                Нет доходов за месяц
              </div>
            )}
          </section>

          {/* Расходы */}
          <section>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-red-300 mb-4">
              <ArrowDownCircle size={24} /> Расходы
            </h2>

            {pageData?.expenseGroups.length ? (
              pageData.expenseGroups.map((g, i) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "expense" })}
                  className="bg-zinc-900 p-5 rounded-xl mb-4 border border-zinc-800 hover:border-red-700 cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {g.icon && <span className="text-3xl">{g.icon}</span>}
                      <span className="font-medium">{g.name}</span>
                    </div>
                    <span className="text-red-400 font-bold">-{g.total.toLocaleString("ru-RU")}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                Нет расходов за месяц
              </div>
            )}
          </section>

          {/* Кнопки внизу */}
          <div className="fixed bottom-28 left-0 right-0 px-4 z-40 flex justify-center gap-4">
            <Button
              variant="outline"
              className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 flex-1 max-w-xs"
              onClick={() => setCatManagerOpen(true)}
            >
              Категории
            </Button>
            <Button
              variant="outline"
              className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 flex-1 max-w-xs"
              onClick={() => setAllTxOpen(true)}
            >
              Все транзакции
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-center text-purple-300">Кредитные обязательства</h2>

          {/* Кредиты */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-purple-300 flex items-center gap-3">
                <Landmark size={24} /> Кредиты
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingCredit(null);
                  setCreditName("");
                  setCreditDebt("");
                  setCreditDueDate("");
                  setCreditType("loan");
                  setCreditDrawerOpen(true);
                }}
              >
                + Кредит
              </Button>
            </div>
            {pageData?.credits.filter((c) => c.item_type === "loan").length ? (
              pageData.credits
                .filter((c) => c.item_type === "loan")
                .map((c) => (
                  <Card key={c.id} className="bg-zinc-900 border-zinc-800 rounded-xl p-6 mb-4">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-xl font-bold">{c.name}</h4>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingCredit(c);
                          setCreditName(c.name);
                          setCreditDebt(c.total_debt);
                          setCreditDueDate(c.due_date || "");
                          setCreditType("loan");
                          setCreditDrawerOpen(true);
                        }}>
                          <Pencil size={18} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeleteId(c.id);
                            setDeleteTable("credit_items");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-purple-300 mb-3">
                      {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                    </p>
                    {c.due_date && (
                      <p className="text-sm text-zinc-400 flex items-center gap-2">
                        <Calendar size={16} /> Платёж: {c.due_date}
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                Нет кредитов
              </div>
            )}
          </section>

          {/* Кредитные карты */}
          <section>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl font-bold text-pink-300 flex items-center gap-3">
                <CreditCard size={24} /> Кредитные карты
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingCredit(null);
                  setCreditName("");
                  setCreditDebt("");
                  setCreditLimit("");
                  setCreditTransferLimit("");
                  setCreditDueDate("");
                  setCreditType("credit_card");
                  setCreditDrawerOpen(true);
                }}
              >
                + Карта
              </Button>
            </div>
            {pageData?.credits.filter((c) => c.item_type === "credit_card").length ? (
              pageData.credits
                .filter((c) => c.item_type === "credit_card")
                .map((c) => (
                  <Card key={c.id} className="bg-zinc-900 border-zinc-800 rounded-xl p-6 mb-4">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-xl font-bold">{c.name}</h4>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditingCredit(c);
                          setCreditName(c.name);
                          setCreditDebt(c.total_debt);
                          setCreditLimit(c.credit_limit);
                          setCreditTransferLimit(c.transfer_limit);
                          setCreditDueDate(c.due_date || "");
                          setCreditType("credit_card");
                          setCreditDrawerOpen(true);
                        }}>
                          <Pencil size={18} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeleteId(c.id);
                            setDeleteTable("credit_items");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-zinc-400">Задолженность</p>
                        <p className="text-2xl font-bold text-pink-300">
                          {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">Остаток лимита</p>
                        <p className="text-2xl font-bold text-teal-300">
                          {Number(c.credit_limit - c.total_debt || 0).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-zinc-400">Лимит</p>
                        <p className="font-medium">{Number(c.credit_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-400">Лимит переводов</p>
                        <p className="font-medium">{Number(c.transfer_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                    </div>

                    {c.due_date && (
                      <p className="mt-4 text-sm text-zinc-400 flex items-center gap-2">
                        <Calendar size={16} /> Платёж: {c.due_date}
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                Нет кредитных карт
              </div>
            )}
          </section>
        </div>
      )}

      {/* Навигация */}
      <div className="fixed bottom-8 left-4 right-4 z-50">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5">
            {LEDGER_TITLES.map((name) => (
              <TabsTrigger
                key={name}
                value={name}
                className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-sm font-medium"
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Кнопка добавления транзакции */}
      <Button
        className="fixed bottom-28 right-6 w-16 h-16 rounded-full bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 transition-colors z-50 flex items-center justify-center"
        onClick={() => {
          setEditingTx(null);
          setAmount("");
          setComment("");
          setSelectedCategoryId(null);
          setType("expense");
          setTxDialogOpen(true);
        }}
      >
        <Plus size={32} strokeWidth={3} />
      </Button>

      {/* Dialog для транзакций */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="text-2xl font-bold text-center">
              {editingTx ? "Редактировать" : "Новая"} запись
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="flex gap-3">
              <Button
                variant={type === "expense" ? "default" : "outline"}
                className={`flex-1 ${type === "expense" ? "bg-red-600 hover:bg-red-700" : "border-zinc-700 hover:bg-zinc-800"}`}
                onClick={() => setType("expense")}
              >
                Расход
              </Button>
              <Button
                variant={type === "income" ? "default" : "outline"}
                className={`flex-1 ${type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "border-zinc-700 hover:bg-zinc-800"}`}
                onClick={() => setType("income")}
              >
                Доход
              </Button>
            </div>

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Сумма</label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-12 bg-zinc-800 border-zinc-700 text-xl text-center pr-10"
                  autoFocus
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">₽</span>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Категория</label>
              <select
                value={selectedCategoryId || ""}
                onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                className="w-full h-11 bg-zinc-800 border border-zinc-700 rounded-md px-4 text-base"
              >
                <option value="">Без категории</option>
                {categories
                  .filter((c) => c.type === type && c.ledger_id === currentLedger?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? c.icon + " " : ""}{c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Комментарий</label>
              <Input
                placeholder="Необязательно"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="h-11 bg-zinc-800 border-zinc-700 rounded-md px-4"
              />
            </div>

            <div className="flex gap-3 pt-3">
              <Button
                onClick={handleTxSubmit}
                disabled={!amount.trim()}
                className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50"
              >
                {editingTx ? "Сохранить" : "Добавить"}
              </Button>

              {editingTx && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingTx(null);
                    setTxDialogOpen(false);
                  }}
                  className="flex-1 h-12 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer управления категориями */}
      <Drawer open={catManagerOpen} onOpenChange={setCatManagerOpen}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700/50 text-white max-h-[90vh]">
          <DrawerHeader className="border-b border-zinc-700/50 pb-5">
            <DrawerTitle className="text-3xl font-bold text-center">
              Категории {activeTab}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categories
                .filter((c) => c.ledger_id === currentLedger.id)
                .map((c) => (
                  <div
                    key={c.id}
                    className="bg-zinc-900 p-4 rounded-xl flex justify-between items-center border border-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      {c.icon && <span className="text-2xl">{c.icon}</span>}
                      <div>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-zinc-500 block">
                          {c.type === "income" ? "Доход" : "Расход"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEditCategory(c)}>
                        <Pencil size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDeleteId(c.id);
                          setDeleteTable("categories");
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>

            <Button
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl"
              onClick={() => {
                setEditingCat(null);
                setCatName("");
                setCatIcon("");
                setCatType("expense");
                setCatDrawerOpen(true);
              }}
            >
              + Добавить категорию
            </Button>
          </div>

          <DrawerFooter className="border-t border-zinc-700/50 pt-5">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Закрыть
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Drawer добавления/редактирования категории */}
      <Drawer open={catDrawerOpen} onOpenChange={(open) => {
        setCatDrawerOpen(open);
        if (!open) setEditingCat(null);
      }}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700/50 text-white max-h-[70vh]">
          <DrawerHeader className="border-b border-zinc-700/50 pb-5">
            <DrawerTitle className="text-3xl font-bold text-center">
              {editingCat ? "Редактировать категорию" : "Новая категория"}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Название</label>
              <Input
                placeholder="Например: Зарплата"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Иконка (эмодзи)</label>
              <Input
                placeholder="💰"
                value={catIcon}
                onChange={(e) => setCatIcon(e.target.value)}
                className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
              />
            </div>

            <div className="flex gap-3">
              <Button
                className={`flex-1 h-11 ${catType === "expense" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-400"}`}
                onClick={() => setCatType("expense")}
              >
                Расход
              </Button>
              <Button
                className={`flex-1 h-11 ${catType === "income" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400"}`}
                onClick={() => setCatType("income")}
              >
                Доход
              </Button>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCategorySubmit}
                disabled={!catName}
                className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
              >
                {editingCat ? "Сохранить" : "Добавить"}
              </Button>

              {editingCat && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCat(null);
                    setCatDrawerOpen(false);
                  }}
                  className="flex-1 h-12"
                >
                  Отмена
                </Button>
              )}
            </div>

            {editingCat && (
              <Button
                variant="destructive"
                className="w-full h-12"
                onClick={() => {
                  if (editingCat) {
                    setDeleteId(editingCat.id);
                    setDeleteTable("categories");
                    setDeleteDialogOpen(true);
                  }
                }}
              >
                Удалить категорию
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Drawer для кредитов/карт */}
      <Drawer open={creditDrawerOpen} onOpenChange={(open) => {
        setCreditDrawerOpen(open);
        if (!open) setEditingCredit(null);
      }}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700/50 text-white max-h-[90vh]">
          <DrawerHeader className="border-b border-zinc-700/50 pb-5">
            <DrawerTitle className="text-3xl font-bold text-center">
              {editingCredit ? "Редактировать" : "Добавить"} {creditType === "loan" ? "кредит" : "карту"}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-5">
            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Название</label>
              <Input
                placeholder="Например: Ипотека Сбер"
                value={creditName}
                onChange={(e) => setCreditName(e.target.value)}
                className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">
                {creditType === "loan" ? "Общий долг" : "Задолженность"}
              </label>
              <Input
                type="number"
                placeholder="0"
                value={creditDebt}
                onChange={(e) => setCreditDebt(e.target.value)}
                className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
              />
            </div>

            {creditType === "credit_card" && (
              <>
                <div>
                  <label className="block text-sm mb-1.5 text-zinc-400">Лимит карты</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1.5 text-zinc-400">Лимит переводов</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={creditTransferLimit}
                    onChange={(e) => setCreditTransferLimit(e.target.value)}
                    className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm mb-1.5 text-zinc-400">Дата платежа</label>
              <Input
                type="date"
                value={creditDueDate}
                onChange={(e) => setCreditDueDate(e.target.value)}
                className="h-11 bg-zinc-900 border-zinc-700 rounded-md px-4"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCreditSubmit}
                disabled={!creditName}
                className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:brightness-110"
              >
                {editingCredit ? "Сохранить" : "Добавить"}
              </Button>

              {editingCredit && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCredit(null);
                    setCreditDrawerOpen(false);
                  }}
                  className="flex-1 h-12"
                >
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Список всех транзакций */}
      <Drawer open={allTxOpen} onOpenChange={setAllTxOpen}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700/50 text-white max-h-[90vh]">
          <DrawerHeader className="border-b border-zinc-700/50 pb-5">
            <DrawerTitle className="text-3xl font-bold text-center">
              Все транзакции {activeTab}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-4 overflow-y-auto">
            {allTransactions.length ? (
              allTransactions.map((t) => (
                <div
                  key={t.id}
                  className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{t.comment || "Без комментария"}</p>
                      <p className="text-sm text-zinc-500 mt-1 flex items-center gap-2">
                        <Calendar size={14} />
                        {formatDate(t.transaction_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={`font-bold text-lg ${t.transaction_type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                        {t.transaction_type === "income" ? "+" : "-"}{Number(t.amount).toLocaleString("ru-RU")} ₽
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingTx(t);
                            setAmount(t.amount.toString());
                            setType(t.transaction_type);
                            setComment(t.comment || "");
                            setSelectedCategoryId(t.category_id || null);
                            setTxDialogOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeleteId(t.id);
                            setDeleteTable("transactions");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-500">
                Нет транзакций за этот месяц
              </div>
            )}
          </div>

          <DrawerFooter className="border-t border-zinc-700/50 pt-5">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Закрыть
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Список транзакций по категории */}
      <Drawer open={catTxOpen} onOpenChange={setCatTxOpen}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700/50 text-white max-h-[90vh]">
          <DrawerHeader className="border-b border-zinc-700/50 pb-5">
            <DrawerTitle className="text-3xl font-bold text-center">
              {selectedCat?.name}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-4 overflow-y-auto">
            {transactionsByCategory.length ? (
              transactionsByCategory.map((t) => (
                <div
                  key={t.id}
                  className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{t.comment || "Без комментария"}</p>
                      <p className="text-sm text-zinc-500 mt-1 flex items-center gap-2">
                        <Calendar size={14} />
                        {formatDate(t.transaction_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className={`font-bold text-lg ${t.transaction_type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                        {t.transaction_type === "income" ? "+" : "-"}{Number(t.amount).toLocaleString("ru-RU")} ₽
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingTx(t);
                            setAmount(t.amount.toString());
                            setType(t.transaction_type);
                            setComment(t.comment || "");
                            setSelectedCategoryId(t.category_id || null);
                            setTxDialogOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeleteId(t.id);
                            setDeleteTable("transactions");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-500">
                Нет транзакций в этой категории
              </div>
            )}
          </div>

          <DrawerFooter className="border-t border-zinc-700/50 pt-5">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">
                Закрыть
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Диалог удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-400">Удалить?</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-300 mt-3">Это действие нельзя отменить.</p>
          <DialogFooter className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="flex-1">
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId && deleteTable) handleDelete(deleteId, deleteTable);
                setDeleteDialogOpen(false);
                setDeleteId(null);
                setDeleteTable(null);
              }}
              className="flex-1"
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}