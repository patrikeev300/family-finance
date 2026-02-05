"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar, Plus, ArrowUpCircle, ArrowDownCircle, Trash2, Pencil, X } from "lucide-react";

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

  // Drawer для добавления транзакции
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [comment, setComment] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Модалка для списка транзакций по категории
  const [selectedCat, setSelectedCat] = useState<{ name: string; id: string | null; type: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [txToDelete, setTxToDelete] = useState<string | null>(null);

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

  async function handleAdd() {
    if (!amount || !currentLedger || !supabase) return;
    const num = parseFloat(amount);
    if (isNaN(num)) return;

    const { error } = await supabase.from("transactions").insert({
      ledger_id: currentLedger.id,
      profile_id: profile?.id,
      amount: num,
      transaction_type: type,
      category_id: selectedCategoryId || null,
      comment: comment.trim() || null,
      transaction_date: `${selectedMonth}-15T12:00:00Z`,
    });

    if (error) {
      console.error("Ошибка:", error);
      return;
    }

    setAmount("");
    setComment("");
    setSelectedCategoryId(null);
    setDrawerOpen(false);
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    refreshData(ledgers.map((l: any) => l.id));
  }

  async function handleDeleteTransaction(id: string) {
    if (!confirm("Удалить транзакцию?")) return;

    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (!error) {
      refreshData(ledgers.map((l: any) => l.id));
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    }
  }

  const transactionsByCategory = selectedCat
    ? transactions.filter(
        (t: any) =>
          t.ledger_id === currentLedger?.id &&
          t.category_id === selectedCat.id &&
          t.transaction_date?.startsWith(selectedMonth)
      )
    : [];

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
    <main className="min-h-screen bg-gradient-to-b from-black to-zinc-950 text-white pb-44 px-5">
      {/* Header */}
      <div className="flex justify-between items-center py-6">
        <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-500 to-pink-500">
          Family Finance
        </h1>
        <div className="flex items-center gap-3 bg-zinc-900/70 backdrop-blur-xl px-4 py-2 rounded-2xl border border-zinc-700/50">
          <Calendar size={18} className="text-indigo-400" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent outline-none text-sm font-medium w-28"
          />
        </div>
      </div>

      {/* Баланс */}
      {!isCredit && pageData && (
        <Card className="mb-10 bg-gradient-to-br from-zinc-900/80 to-black border border-zinc-700/50 rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <p className="text-sm opacity-60 mb-3 uppercase tracking-wider">{activeTab} • Баланс</p>
          <div className="text-6xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
            {pageData.balance.toLocaleString("ru-RU")} ₽
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-emerald-950/60 to-black p-6 rounded-2xl border border-emerald-800/30 hover:border-emerald-600/50 transition-all">
              <ArrowUpCircle className="text-emerald-400 mb-3" size={28} />
              <p className="text-emerald-400 font-bold text-2xl">
                +{pageData.income.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="bg-gradient-to-br from-red-950/60 to-black p-6 rounded-2xl border border-red-800/30 hover:border-red-600/50 transition-all">
              <ArrowDownCircle className="text-red-400 mb-3" size={28} />
              <p className="text-red-400 font-bold text-2xl">
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-4 bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
                <ArrowUpCircle size={32} /> Доходы
              </h2>
              <Button variant="outline" size="sm" className="border-emerald-600 text-emerald-400 hover:bg-emerald-950/50">
                + Категория
              </Button>
            </div>
            {pageData?.incomeGroups.length ? (
              pageData.incomeGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "income" })}
                  className="bg-gradient-to-r from-zinc-900 to-black p-6 rounded-3xl mb-4 flex justify-between items-center border border-zinc-700/50 hover:border-emerald-600/70 hover:shadow-emerald-900/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-5">
                    {g.icon && <span className="text-4xl transition-transform group-hover:scale-110">{g.icon}</span>}
                    <div className="font-semibold text-xl">{g.name}</div>
                  </div>
                  <div className="text-emerald-400 font-black text-2xl group-hover:scale-105 transition-transform">
                    +{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 opacity-60 text-xl border-2 border-dashed border-zinc-700 rounded-3xl">
                Нет доходов за месяц
              </div>
            )}
          </section>

          {/* Расходы */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-4 bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-rose-500">
                <ArrowDownCircle size={32} /> Расходы
              </h2>
              <Button variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-950/50">
                + Категория
              </Button>
            </div>
            {pageData?.expenseGroups.length ? (
              pageData.expenseGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  onClick={() => setSelectedCat({ name: g.name, id: categories.find(c => c.name === g.name)?.id || null, type: "expense" })}
                  className="bg-gradient-to-r from-zinc-900 to-black p-6 rounded-3xl mb-4 flex justify-between items-center border border-zinc-700/50 hover:border-red-600/70 hover:shadow-red-900/30 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-5">
                    {g.icon && <span className="text-4xl transition-transform group-hover:scale-110">{g.icon}</span>}
                    <div className="font-semibold text-xl">{g.name}</div>
                  </div>
                  <div className="text-red-400 font-black text-2xl group-hover:scale-105 transition-transform">
                    -{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16 opacity-60 text-xl border-2 border-dashed border-zinc-700 rounded-3xl">
                Нет расходов за месяц
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-10">
          <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 text-center mb-8">
            Кредитные обязательства
          </h2>

          {/* Блок Кредиты */}
          <section>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <span className="text-purple-400">Кредиты</span>
            </h3>
            {pageData?.credits.filter((c: any) => c.item_type === "loan").length ? (
              pageData.credits
                .filter((c: any) => c.item_type === "loan")
                .map((c: any) => (
                  <Card key={c.id} className="mb-6 bg-gradient-to-br from-purple-950/40 to-black border border-purple-800/40 rounded-3xl p-7 shadow-xl backdrop-blur-sm hover:scale-[1.02] transition-transform">
                    <h4 className="font-bold text-2xl mb-4">{c.name}</h4>
                    <p className="text-5xl font-black text-purple-300 mb-3">
                      {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                    </p>
                    {c.due_date && (
                      <p className="text-lg opacity-80 flex items-center gap-2">
                        <Calendar size={20} /> Платёж: {c.due_date}
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-12 opacity-60 text-xl border border-dashed border-purple-800/40 rounded-3xl">
                Нет кредитов
              </div>
            )}
          </section>

          {/* Блок Кредитные карты */}
          <section>
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <span className="text-pink-400">Кредитные карты</span>
            </h3>
            {pageData?.credits.filter((c: any) => c.item_type === "credit_card").length ? (
              pageData.credits
                .filter((c: any) => c.item_type === "credit_card")
                .map((c: any) => (
                  <Card key={c.id} className="mb-6 bg-gradient-to-br from-pink-950/40 to-black border border-pink-800/40 rounded-3xl p-7 shadow-xl backdrop-blur-sm hover:scale-[1.02] transition-transform">
                    <h4 className="font-bold text-2xl mb-4">{c.name}</h4>
                    <div className="grid grid-cols-2 gap-6 mb-4">
                      <div>
                        <p className="text-sm opacity-70">Задолженность</p>
                        <p className="text-3xl font-black text-pink-300">
                          {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                      <div>
                        <p className="text-sm opacity-70">Остаток лимита</p>
                        <p className="text-3xl font-black text-teal-300">
                          {Number(c.current_balance || c.credit_limit - c.total_debt || 0).toLocaleString("ru-RU")} ₽
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-sm opacity-70">Лимит</p>
                        <p className="text-xl font-semibold">{Number(c.credit_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-70">Лимит переводов</p>
                        <p className="text-xl font-semibold">{Number(c.transfer_limit || 0).toLocaleString("ru-RU")} ₽</p>
                      </div>
                    </div>
                    {c.due_date && (
                      <p className="mt-6 text-lg opacity-80 flex items-center gap-2">
                        <Calendar size={20} /> Платёж: {c.due_date}
                      </p>
                    )}
                  </Card>
                ))
            ) : (
              <div className="text-center py-12 opacity-60 text-xl border border-dashed border-pink-800/40 rounded-3xl">
                Нет кредитных карт
              </div>
            )}
          </section>
        </div>
      )}

      {/* Навигация */}
      <div className="fixed bottom-8 left-4 right-4 z-50">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 bg-zinc-950/80 backdrop-blur-2xl border border-zinc-700/60 rounded-3xl p-2 shadow-2xl">
            {LEDGER_TITLES.map((name) => (
              <TabsTrigger
                key={name}
                value={name}
                className="rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-sm font-bold uppercase tracking-wider transition-all"
              >
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Drawer добавления транзакции */}
      {!isCredit && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button className="fixed bottom-28 right-6 w-16 h-16 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-2xl hover:scale-110 hover:shadow-indigo-500/50 transition-all duration-300 z-50 flex items-center justify-center">
              <Plus size={32} strokeWidth={3} />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="bg-gradient-to-b from-zinc-950 to-black border-t border-zinc-700/50 text-white max-h-[90vh] backdrop-blur-xl">
            <DrawerHeader className="border-b border-zinc-700/50 pb-6">
              <DrawerTitle className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500 text-center">
                Новая запись
              </DrawerTitle>
              <p className="text-center text-zinc-400 mt-2">{activeTab} • {type === "income" ? "Пополнение" : "Списание"}</p>
            </DrawerHeader>

            <div className="p-6 space-y-8">
              <div className="flex gap-4 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-700/50 backdrop-blur-sm">
                <Button
                  className={`flex-1 h-14 text-lg font-bold rounded-xl transition-all ${
                    type === "expense"
                      ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-red-900/30"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                  onClick={() => {
                    setType("expense");
                    setSelectedCategoryId(null);
                  }}
                >
                  Расход
                </Button>
                <Button
                  className={`flex-1 h-14 text-lg font-bold rounded-xl transition-all ${
                    type === "income"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-900/30"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                  onClick={() => {
                    setType("income");
                    setSelectedCategoryId(null);
                  }}
                >
                  Доход
                </Button>
              </div>

              <div className="text-center">
                <Input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-9xl font-black text-center h-48 bg-transparent border-none focus:ring-0 placeholder:text-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  autoFocus
                />
                <p className="text-xl opacity-60 mt-3 tracking-widest">₽</p>
              </div>

              <div>
                <label className="block text-lg font-medium mb-3 text-zinc-300">Категория</label>
                <select
                  value={selectedCategoryId || ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  className="w-full h-16 bg-zinc-900/70 border border-zinc-700 rounded-2xl px-6 text-xl focus:outline-none focus:border-indigo-500 transition-all backdrop-blur-sm"
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
                <label className="block text-lg font-medium mb-3 text-zinc-300">Комментарий</label>
                <Input
                  placeholder="Для чего именно..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-16 bg-zinc-900/70 border-zinc-700 text-xl rounded-2xl px-6 backdrop-blur-sm"
                />
              </div>

              <Button
                onClick={handleAdd}
                disabled={!amount}
                className="w-full h-20 text-2xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Добавить
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Модалка списка транзакций по категории */}
      <Dialog open={!!selectedCat} onOpenChange={() => setSelectedCat(null)}>
        <DialogContent className="bg-gradient-to-b from-zinc-950 to-black border-zinc-700/50 text-white max-w-2xl max-h-[90vh] overflow-y-auto backdrop-blur-xl">
          <DialogHeader className="border-b border-zinc-700/50 pb-6">
            <DialogTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500">
              {selectedCat?.name || "Транзакции"}
            </DialogTitle>
          </DialogHeader>

          <div className="py-6 space-y-4">
            {transactionsByCategory.length ? (
              transactionsByCategory.map((t: any) => (
                <div
                  key={t.id}
                  className="bg-zinc-900/70 p-5 rounded-2xl flex justify-between items-center border border-zinc-800 hover:border-zinc-600 transition-all backdrop-blur-sm"
                >
                  <div>
                    <p className="font-medium text-lg">{t.comment || "Без комментария"}</p>
                    <p className="text-sm opacity-60 mt-1">
                      {new Date(t.transaction_date).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <p className={`font-bold text-xl ${t.transaction_type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.transaction_type === "income" ? "+" : "-"}{Number(t.amount).toLocaleString("ru-RU")} ₽
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                      onClick={() => {
                        setTxToDelete(t.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 size={20} />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-16 opacity-60 text-xl">Нет транзакций в этой категории</p>
            )}
          </div>

          <DialogFooter className="border-t border-zinc-700/50 pt-6">
            <Button
              variant="outline"
              onClick={() => setSelectedCat(null)}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-400">Удалить транзакцию?</DialogTitle>
          </DialogHeader>
          <p className="text-zinc-300 mt-4">Это действие нельзя отменить.</p>
          <DialogFooter className="mt-8">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (txToDelete) handleDeleteTransaction(txToDelete);
                setDeleteDialogOpen(false);
                setTxToDelete(null);
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