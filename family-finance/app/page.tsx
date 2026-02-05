"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Calendar, Plus, ArrowUpCircle, ArrowDownCircle, Trash2, Pencil, CreditCard, Landmark } from "lucide-react";

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

  // Категории
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

  // Модалки подтверждения
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteTable, setDeleteTable] = useState<"transactions" | "credit_items" | "categories" | null>(null);

  // Список транзакций по категории
  const [catTxOpen, setCatTxOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<{ name: string; id: string | null; type: string } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined") initApp();
  }, []);

  async function initApp() {
    try {
      setLoading(true);
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }

      const tgUser = tg?.initDataUnsafe?.user || { id: 464444608, first_name: "Глеб (демо)" };

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
      if (!currProfile?.family_id) return;

      let { data: currLedgers } = await supabase
        .from("ledgers")
        .select("*")
        .eq("family_id", currProfile.family_id);

      if (!currLedgers?.length) {
        const inserts = LEDGER_TITLES.map(title => ({
          family_id: currProfile.family_id,
          title,
          type: title === "Кредиты" ? "credit" : "standard",
        }));
        const { data: created } = await supabase.from("ledgers").insert(inserts).select();
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
      (t: any) => t.ledger_id === currentLedger.id && t.transaction_date?.startsWith(selectedMonth)
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

  // Транзакции: добавление/редактирование
  async function handleTxSubmit() {
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
      transaction_date: `${selectedMonth}-15T12:00:00Z`,
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
  }

  // Категории: добавление/редактирование
  async function handleCategorySubmit() {
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
  }

  // Кредиты/карты: добавление/редактирование
  async function handleCreditSubmit() {
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
  }

  // Удаление
  async function handleDelete(id: string, table: "transactions" | "credit_items" | "categories") {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) {
      refreshData(ledgers.map((l: any) => l.id));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    }
    setDeleteDialogOpen(false);
    setDeleteId(null);
    setDeleteTable(null);
  }

  const openEditCategory = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatIcon(cat.icon || "");
    setCatType(cat.type as "income" | "expense");
    setCatDrawerOpen(true);
  };

  const transactionsByCategory = selectedCat
    ? transactions.filter(
        (t: any) =>
          t.ledger_id === currentLedger?.id &&
          t.category_id === selectedCat.id &&
          t.transaction_date?.startsWith(selectedMonth)
      )
    : [];

  const currentCategories = categories.filter(c => c.ledger_id === currentLedger?.id);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-black to-zinc-950">
        <div className="w-16 h-16 border-4 border-t-indigo-500 border-zinc-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentLedger) return <div className="p-10 text-center text-2xl">Раздел не найден</div>;

  const isCredit = activeTab === "Кредиты";

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white pb-44 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-6 gap-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500 tracking-tight">
          PNL Finance
        </h1>
        <div className="flex items-center gap-3 bg-zinc-900/70 backdrop-blur-xl px-4 py-3 rounded-2xl border border-zinc-700/50 shadow-lg w-full sm:w-auto">
          <Calendar size={18} className="text-purple-400" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent outline-none text-sm font-medium w-full sm:w-32"
          />
        </div>
      </div>

      {/* Баланс */}
      {!isCredit && pageData && (
        <Card className="mb-10 bg-gradient-to-br from-zinc-900/90 to-black border border-zinc-700/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <p className="text-sm opacity-70 mb-3 uppercase tracking-widest font-medium">{activeTab} • Баланс</p>
          <div className="text-5xl sm:text-6xl md:text-7xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
            {pageData.balance.toLocaleString("ru-RU")} ₽
          </div>
          <div className="grid grid-cols-2 gap-5 sm:gap-6">
            <div className="bg-gradient-to-br from-emerald-950/60 to-black p-5 sm:p-6 rounded-2xl border border-emerald-800/30 hover:border-emerald-600/50 transition-all duration-300">
              <ArrowUpCircle className="text-emerald-400 mb-3" size={28} />
              <p className="text-emerald-400 font-bold text-xl sm:text-2xl md:text-3xl">
                +{pageData.income.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="bg-gradient-to-br from-red-950/60 to-black p-5 sm:p-6 rounded-2xl border border-red-800/30 hover:border-red-600/50 transition-all duration-300">
              <ArrowDownCircle className="text-red-400 mb-3" size={28} />
              <p className="text-red-400 font-bold text-xl sm:text-2xl md:text-3xl">
                -{pageData.expense.toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Контент */}
      {!isCredit ? (
        <div className="space-y-12">
          {/* Доходы */}
          <section>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <h2 className="text-3xl sm:text-4xl font-bold flex items-center gap-4 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
                <ArrowUpCircle size={32} /> Доходы
              </h2>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-950/50"
                  onClick={() => {
                    setEditingCat(null);
                    setCatName("");
                    setCatIcon("");
                    setCatType("income");
                    setCatDrawerOpen(true);
                  }}
                >
                  + Категория
                </Button>
              </div>
            </div>
            {pageData?.incomeGroups.length ? (
              pageData.incomeGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "income" })}
                  className="bg-gradient-to-r from-zinc-900/90 to-black p-5 sm:p-6 rounded-3xl mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border border-zinc-700/40 hover:border-emerald-600/60 hover:shadow-emerald-900/20 transition-all duration-300 cursor-pointer group backdrop-blur-sm"
                >
                  <div className="flex items-center gap-4 sm:gap-5 mb-3 sm:mb-0 flex-1">
                    {g.icon && <span className="text-4xl sm:text-5xl transition-transform group-hover:scale-110 duration-300">{g.icon}</span>}
                    <div className="font-semibold text-xl sm:text-2xl">{g.name}</div>
                  </div>
                  <div className="text-emerald-400 font-black text-xl sm:text-2xl group-hover:scale-105 transition-transform">
                    +{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 sm:py-20 opacity-60 text-lg sm:text-xl border-2 border-dashed border-zinc-700/50 rounded-3xl backdrop-blur-sm">
                Нет доходов за месяц
              </div>
            )}
          </section>

          {/* Расходы */}
          <section>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <h2 className="text-3xl sm:text-4xl font-bold flex items-center gap-4 bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-rose-500">
                <ArrowDownCircle size={32} /> Расходы
              </h2>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-600/50 text-red-400 hover:bg-red-950/50"
                  onClick={() => {
                    setEditingCat(null);
                    setCatName("");
                    setCatIcon("");
                    setCatType("expense");
                    setCatDrawerOpen(true);
                  }}
                >
                  + Категория
                </Button>
              </div>
            </div>
            {pageData?.expenseGroups.length ? (
              pageData.expenseGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "expense" })}
                  className="bg-gradient-to-r from-zinc-900/90 to-black p-5 sm:p-6 rounded-3xl mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border border-zinc-700/40 hover:border-red-600/60 hover:shadow-red-900/20 transition-all duration-300 cursor-pointer group backdrop-blur-sm"
                >
                  <div className="flex items-center gap-4 sm:gap-5 mb-3 sm:mb-0 flex-1">
                    {g.icon && <span className="text-4xl sm:text-5xl transition-transform group-hover:scale-110 duration-300">{g.icon}</span>}
                    <div className="font-semibold text-xl sm:text-2xl">{g.name}</div>
                  </div>
                  <div className="text-red-400 font-black text-xl sm:text-2xl group-hover:scale-105 transition-transform">
                    -{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 sm:py-20 opacity-60 text-lg sm:text-xl border-2 border-dashed border-zinc-700/50 rounded-3xl backdrop-blur-sm">
                Нет расходов за месяц
              </div>
            )}
          </section>

          {/* Блок категорий */}
          <section className="mt-12">
            <h2 className="text-3xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
              Категории раздела «{activeTab}»
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentCategories.length ? (
                currentCategories.map((cat: Category) => (
                  <Card
                    key={cat.id}
                    className="bg-zinc-900/70 border border-zinc-700/50 rounded-2xl p-5 hover:border-zinc-500 transition-all duration-300 backdrop-blur-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {cat.icon && <span className="text-3xl">{cat.icon}</span>}
                        <div>
                          <h4 className="font-semibold text-lg">{cat.name}</h4>
                          <p className="text-sm opacity-60 capitalize">{cat.type === "income" ? "Доход" : "Расход"}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/50"
                          onClick={() => openEditCategory(cat)}
                        >
                          <Pencil size={18} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                          onClick={() => {
                            setDeleteId(cat.id);
                            setDeleteTable("categories");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="col-span-full text-center py-12 opacity-60 text-xl border-2 border-dashed border-zinc-700/50 rounded-3xl">
                  Нет категорий в этом разделе
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-12">
          {/* ... (кредиты и карты остаются без изменений) ... */}
          <h2 className="text-4xl sm:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-rose-500 text-center mb-10 tracking-tight">
            Кредитные обязательства
          </h2>

          {/* Кредиты */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-3xl font-bold text-purple-300 flex items-center gap-4">
                <Landmark size={32} /> Кредиты
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="border-purple-600/50 text-purple-400 hover:bg-purple-950/50 w-full sm:w-auto"
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
            {pageData?.credits.filter((c: any) => c.item_type === "loan").length ? (
              pageData.credits
                .filter((c: any) => c.item_type === "loan")
                .map((c: any) => (
                  <Card
                    key={c.id}
                    className="bg-gradient-to-br from-purple-950/50 to-black border border-purple-800/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md hover:scale-[1.02] transition-all duration-300"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
                      <h4 className="font-bold text-2xl sm:text-3xl">{c.name}</h4>
                      <div className="flex gap-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-purple-400 hover:text-purple-300 hover:bg-purple-950/50"
                          onClick={() => {
                            setEditingCredit(c);
                            setCreditName(c.name);
                            setCreditDebt(c.total_debt);
                            setCreditDueDate(c.due_date || "");
                            setCreditType("loan");
                            setCreditDrawerOpen(true);
                          }}
                        >
                          <Pencil size={20} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                          onClick={() => {
                            setDeleteId(c.id);
                            setDeleteTable("credit_items");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={20} />
                        </Button>
                      </div>
                    </div>
                    <p className="text-4xl sm:text-5xl font-black text-purple-300 mb-4">
                      {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                    </p>
                    {c.due_date && (
                      <p className="text-base sm:text-lg opacity-80 flex items-center gap-3">
                        <Calendar size={20} className="text-purple-400" />
                        Платёж: <span className="font-medium">{c.due_date}</span>
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-16 opacity-70 text-lg sm:text-xl border-2 border-dashed border-purple-800/30 rounded-3xl backdrop-blur-sm">
                Нет кредитов
              </div>
            )}
          </section>

          {/* Кредитные карты */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-3xl font-bold text-pink-300 flex items-center gap-4">
                <CreditCard size={32} /> Кредитные карты
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="border-pink-600/50 text-pink-400 hover:bg-pink-950/50 w-full sm:w-auto"
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
            {pageData?.credits.filter((c: any) => c.item_type === "credit_card").length ? (
              pageData.credits
                .filter((c: any) => c.item_type === "credit_card")
                .map((c: any) => (
                  <Card
                    key={c.id}
                    className="bg-gradient-to-br from-pink-950/50 to-black border border-pink-800/40 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md hover:scale-[1.02] transition-all duration-300"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <h4 className="font-bold text-2xl sm:text-3xl">{c.name}</h4>
                      <div className="flex gap-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-pink-400 hover:text-pink-300 hover:bg-pink-950/50"
                          onClick={() => {
                            setEditingCredit(c);
                            setCreditName(c.name);
                            setCreditDebt(c.total_debt);
                            setCreditLimit(c.credit_limit);
                            setCreditTransferLimit(c.transfer_limit);
                            setCreditDueDate(c.due_date || "");
                            setCreditType("credit_card");
                            setCreditDrawerOpen(true);
                          }}
                        >
                          <Pencil size={20} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                          onClick={() => {
                            setDeleteId(c.id);
                            setDeleteTable("credit_items");
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 size={20} />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                      <div>
                        <p className="text-sm opacity-70 mb-1">Задолженность</p>
                        <p className="text-3xl sm:text-4xl font-black text-pink-300">
                          {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                      <div>
                        <p className="text-sm opacity-70 mb-1">Остаток лимита</p>
                        <p className="text-3xl sm:text-4xl font-black text-teal-300">
                          {Number(c.current_balance || c.credit_limit - c.total_debt || 0).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm opacity-70 mb-1">Лимит</p>
                        <p className="text-xl sm:text-2xl font-semibold">{Number(c.credit_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-70 mb-1">Лимит переводов</p>
                        <p className="text-xl sm:text-2xl font-semibold">{Number(c.transfer_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                    </div>

                    {c.due_date && (
                      <p className="mt-6 text-lg opacity-80 flex items-center gap-3">
                        <Calendar size={20} className="text-pink-400" />
                        Платёж: <span className="font-medium">{c.due_date}</span>
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-16 opacity-70 text-lg sm:text-xl border-2 border-dashed border-pink-800/30 rounded-3xl backdrop-blur-sm">
                Нет кредитных карт
              </div>
            )}
          </section>
        </div>
      )}

      {/* Навигация */}
      <div className="fixed bottom-8 left-4 right-4 z-50">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-zinc-950/90 backdrop-blur-2xl border border-zinc-700/60 rounded-3xl p-2.5 shadow-2xl">
            {LEDGER_TITLES.map((name) => (
              <TabsTrigger
                key={name}
                value={name}
                className="rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:via-purple-600 data-[state=active]:to-pink-600 data-[state=active]:text-white text-sm md:text-base font-bold uppercase tracking-wider transition-all duration-300"
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Dialog для транзакций (быстрее и легче Drawer) */}
      <Dialog open={txDialogOpen} onOpenChange={(open) => {
        setTxDialogOpen(open);
        if (!open) setEditingTx(null);
      }}>
        <DialogContent className="bg-zinc-950 border-zinc-700 text-white max-w-md backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
              {editingTx ? "Редактировать запись" : "Новая запись"}
            </DialogTitle>
            <p className="text-zinc-400 mt-2">
              {activeTab} • {type === "income" ? "Пополнение" : "Списание"}
            </p>
          </DialogHeader>

          <div className="space-y-6 py-6">
            <div className="flex gap-3">
              <Button
                className={`flex-1 ${type === "expense" ? "bg-red-600 hover:bg-red-700" : "bg-zinc-800 hover:bg-zinc-700"} text-white`}
                onClick={() => {
                  setType("expense");
                  setSelectedCategoryId(null);
                }}
              >
                Расход
              </Button>
              <Button
                className={`flex-1 ${type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-800 hover:bg-zinc-700"} text-white`}
                onClick={() => {
                  setType("income");
                  setSelectedCategoryId(null);
                }}
              >
                Доход
              </Button>
            </div>

            <Input
              type="number"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-6xl text-center h-32 bg-transparent border-none focus:ring-0 placeholder:text-zinc-700"
              autoFocus
            />

            <div>
              <label className="block text-sm mb-2 text-zinc-400">Категория</label>
              <select
                value={selectedCategoryId || ""}
                onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                className="w-full h-12 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">Без категории</option>
                {categories
                  .filter((c: Category) => c.type === type && c.ledger_id === currentLedger.id)
                  .map((c: Category) => (
                    <option key={c.id} value={c.id}>
                      {c.icon ? `${c.icon} ` : ""}{c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-2 text-zinc-400">Комментарий</label>
              <Input
                placeholder="Для чего именно..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="h-12 bg-zinc-900 border-zinc-700 text-white"
              />
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleTxSubmit}
                disabled={!amount}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white"
              >
                {editingTx ? "Сохранить" : "Добавить"}
              </Button>
              {editingTx && (
                <Button
                  variant="outline"
                  onClick={() => setTxDialogOpen(false)}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer для категорий */}
      <Drawer open={catDrawerOpen} onOpenChange={(open) => {
        setCatDrawerOpen(open);
        if (!open) setEditingCat(null);
      }}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700 text-white max-h-[80vh]">
          <DrawerHeader className="border-b border-zinc-700 pb-6">
            <DrawerTitle className="text-3xl font-bold text-center">
              {editingCat ? "Редактировать категорию" : "Новая категория"}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm mb-2 text-zinc-400">Название</label>
              <Input
                placeholder="Например: Зарплата"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="h-12 bg-zinc-900 border-zinc-700 text-white"
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-zinc-400">Иконка (эмодзи)</label>
              <Input
                placeholder="💰"
                value={catIcon}
                onChange={(e) => setCatIcon(e.target.value)}
                className="h-12 bg-zinc-900 border-zinc-700 text-white"
              />
            </div>

            <div className="flex gap-3">
              <Button
                className={`flex-1 ${catType === "expense" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
                onClick={() => setCatType("expense")}
              >
                Расход
              </Button>
              <Button
                className={`flex-1 ${catType === "income" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
                onClick={() => setCatType("income")}
              >
                Доход
              </Button>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCategorySubmit}
                disabled={!catName}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {editingCat ? "Сохранить" : "Добавить"}
              </Button>
              {editingCat && (
                <Button
                  variant="outline"
                  onClick={() => setCatDrawerOpen(false)}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  Отмена
                </Button>
              )}
            </div>

            {editingCat && (
              <Button
                variant="destructive"
                className="w-full"
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
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700 text-white max-h-[92vh]">
          <DrawerHeader className="border-b border-zinc-700 pb-6">
            <DrawerTitle className="text-3xl font-bold text-center">
              {editingCredit ? "Редактировать" : "Добавить"} {creditType === "loan" ? "кредит" : "карту"}
            </DrawerTitle>
          </DrawerHeader>

          <div className="p-6 space-y-6">
            <div>
              <label className="block text-sm mb-2 text-zinc-400">Название</label>
              <Input
                placeholder="Ипотека Сбер / Тинькофф Black"
                value={creditName}
                onChange={(e) => setCreditName(e.target.value)}
                className="h-12 bg-zinc-900 border-zinc-700 text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm mb-2 text-zinc-400">
                  {creditType === "loan" ? "Общий долг" : "Задолженность"}
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={creditDebt}
                  onChange={(e) => setCreditDebt(e.target.value)}
                  className="h-12 bg-zinc-900 border-zinc-700 text-white"
                />
              </div>

              {creditType === "credit_card" && (
                <>
                  <div>
                    <label className="block text-sm mb-2 text-zinc-400">Лимит карты</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="h-12 bg-zinc-900 border-zinc-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2 text-zinc-400">Лимит переводов</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={creditTransferLimit}
                      onChange={(e) => setCreditTransferLimit(e.target.value)}
                      className="h-12 bg-zinc-900 border-zinc-700 text-white"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm mb-2 text-zinc-400">Дата платежа</label>
                <Input
                  type="date"
                  value={creditDueDate}
                  onChange={(e) => setCreditDueDate(e.target.value)}
                  className="h-12 bg-zinc-900 border-zinc-700 text-white"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCreditSubmit}
                disabled={!creditName}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {editingCredit ? "Сохранить" : "Добавить"}
              </Button>
              {editingCredit && (
                <Button
                  variant="outline"
                  onClick={() => setCreditDrawerOpen(false)}
                  className="flex-1 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                >
                  Отмена
                </Button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Список транзакций по категории */}
      <Drawer open={catTxOpen} onOpenChange={setCatTxOpen}>
        <DrawerContent className="bg-zinc-950 border-t border-zinc-700 text-white max-h-[90vh]">
          <DrawerHeader className="border-b border-zinc-700 pb-6">
            <DrawerTitle className="text-3xl font-bold text-center">
              {selectedCat?.name}
            </DrawerTitle>
            <p className="text-zinc-400 mt-2 text-center">
              {selectedCat?.type === "income" ? "Пополнения" : "Списания"}
            </p>
          </DrawerHeader>

          <div className="p-6 space-y-4 overflow-y-auto">
            {transactionsByCategory.length ? (
              transactionsByCategory.map((t: any) => (
                <div
                  key={t.id}
                  className="bg-zinc-900 p-5 rounded-2xl flex justify-between items-center border border-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <div>
                    <p className="font-medium">{t.comment || "Без комментария"}</p>
                    <p className="text-sm opacity-60 mt-1">
                      {new Date(t.transaction_date).toLocaleString("ru-RU")}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <p className={`font-bold text-xl ${t.transaction_type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.transaction_type === "income" ? "+" : "-"}{Number(t.amount).toLocaleString("ru-RU")} ₽
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-indigo-400 hover:text-indigo-300"
                      onClick={() => {
                        setEditingTx(t);
                        setAmount(t.amount);
                        setType(t.transaction_type);
                        setComment(t.comment || "");
                        setSelectedCategoryId(t.category_id || null);
                        setTxDialogOpen(true);
                      }}
                    >
                      <Pencil size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => {
                        setDeleteId(t.id);
                        setDeleteTable("transactions");
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-20 opacity-60 text-xl">Нет транзакций</p>
            )}
          </div>

          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800">
                Закрыть
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Универсальный диалог удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-400">Удалить?</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-300 mt-4">Это действие нельзя отменить.</p>
          <DialogFooter className="mt-8 flex gap-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteId && deleteTable) handleDelete(deleteId, deleteTable);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}