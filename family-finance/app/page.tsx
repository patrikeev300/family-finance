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
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Calendar, Plus, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

// Минимальный тип только для categories (чтобы TS не ругался на icon)
type Category = {
  id: string;
  name: string;
  icon: string | null;
  type: string;
  ledger_id: string;
};

const LEDGER_TITLES = ["Настя", "Глеб", "Еда", "ВБ", "Кредиты"];

// Объявляем Telegram глобально, чтобы TS не ругался
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
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // Drawer форма
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [comment, setComment] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

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

      // Профиль + семья
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

      // Ledgers
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
      console.error("Ошибка добавления:", error);
      return;
    }

    setAmount("");
    setComment("");
    setSelectedCategoryId(null);
    setDrawerOpen(false);

    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    refreshData(ledgers.map((l: any) => l.id));
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentLedger) {
    return <div className="p-8 text-center">Раздел не найден</div>;
  }

  const isCredit = activeTab === "Кредиты";

  return (
    <main className="min-h-screen bg-black text-white pb-36 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-black">Family Finance</h1>
        <div className="flex items-center gap-2 bg-zinc-900 px-3 py-2 rounded-xl">
          <Calendar size={16} />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent outline-none text-sm w-24"
          />
        </div>
      </div>

      {/* Баланс */}
      {!isCredit && pageData && (
        <Card className="mb-8 bg-zinc-950 border-zinc-800 rounded-3xl p-6 shadow-lg">
          <p className="text-sm opacity-60 mb-2">{activeTab} • Баланс</p>
          <div className="text-5xl font-black mb-6">
            {pageData.balance.toLocaleString("ru-RU")} ₽
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-950/40 p-4 rounded-2xl border border-emerald-900/30">
              <ArrowUpCircle className="text-emerald-400 mb-1" size={20} />
              <p className="text-emerald-400 font-bold text-xl">
                +{pageData.income.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="bg-red-950/40 p-4 rounded-2xl border border-red-900/30">
              <ArrowDownCircle className="text-red-400 mb-1" size={20} />
              <p className="text-red-400 font-bold text-xl">
                -{pageData.expense.toLocaleString("ru-RU")}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Контент */}
      {!isCredit ? (
        <div className="space-y-10">
          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
              <ArrowUpCircle className="text-emerald-500" size={24} /> Доходы
            </h2>
            {pageData?.incomeGroups.length ? (
              pageData.incomeGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  className="bg-zinc-900 p-5 rounded-2xl mb-3 flex justify-between items-center border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {g.icon && <span className="text-3xl">{g.icon}</span>}
                    <div className="font-medium text-lg">{g.name}</div>
                  </div>
                  <div className="text-emerald-400 font-bold text-xl">
                    +{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center opacity-50 py-12 text-lg">Нет доходов за месяц</p>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
              <ArrowDownCircle className="text-red-500" size={24} /> Расходы
            </h2>
            {pageData?.expenseGroups.length ? (
              pageData.expenseGroups.map((g: any, i: number) => (
                <div
                  key={i}
                  className="bg-zinc-900 p-5 rounded-2xl mb-3 flex justify-between items-center border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {g.icon && <span className="text-3xl">{g.icon}</span>}
                    <div className="font-medium text-lg">{g.name}</div>
                  </div>
                  <div className="text-red-400 font-bold text-xl">
                    -{g.total.toLocaleString("ru-RU")} ₽
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center opacity-50 py-12 text-lg">Нет расходов за месяц</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Кредиты и карты</h2>
          {pageData?.credits.length ? (
            pageData.credits.map((c: any) => (
              <Card key={c.id} className="p-6 bg-zinc-900 rounded-3xl border border-zinc-800">
                <h3 className="font-bold text-xl mb-3">{c.name}</h3>
                <p className="text-4xl font-black">
                  {Number(c.total_debt).toLocaleString("ru-RU")} ₽
                </p>
                {c.due_date && (
                  <p className="text-sm opacity-70 mt-3">
                    Следующий платёж: {c.due_date}
                  </p>
                )}
              </Card>
            ))
          ) : (
            <p className="text-center opacity-50 py-16 text-lg">Нет активных кредитов</p>
          )}
        </div>
      )}

      {/* Навигация */}
      <div className="fixed bottom-8 left-4 right-4 z-50">
        <TabsList className="grid grid-cols-5 bg-zinc-950/90 backdrop-blur-xl border border-zinc-800 rounded-3xl p-2 shadow-2xl">
          {LEDGER_TITLES.map((name) => (
            <TabsTrigger
              key={name}
              value={name}
              onClick={() => setActiveTab(name)}
              className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-black text-xs font-bold uppercase tracking-tight"
            >
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Drawer */}
      {!isCredit && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            <Button className="fixed bottom-28 right-6 w-16 h-16 rounded-full bg-white text-black shadow-2xl hover:scale-105 transition-transform z-50 flex items-center justify-center">
              <Plus size={32} strokeWidth={3} />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="bg-zinc-950 border-t border-zinc-800 text-white max-h-[85vh]">
            <DrawerHeader className="border-b border-zinc-800 pb-6">
              <DrawerTitle className="text-3xl font-black text-center">
                Новая запись — {activeTab}
              </DrawerTitle>
            </DrawerHeader>
            <div className="p-6 space-y-8">
              <div className="flex gap-4 bg-zinc-900 p-2 rounded-2xl">
                <Button
                  className={`flex-1 h-14 text-lg font-bold rounded-xl ${
                    type === "expense" ? "bg-white text-black" : "bg-zinc-800 text-white"
                  }`}
                  onClick={() => {
                    setType("expense");
                    setSelectedCategoryId(null);
                  }}
                >
                  Расход
                </Button>
                <Button
                  className={`flex-1 h-14 text-lg font-bold rounded-xl ${
                    type === "income" ? "bg-white text-black" : "bg-zinc-800 text-white"
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
                  className="text-8xl font-black text-center h-40 bg-transparent border-none focus:ring-0 placeholder:text-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  autoFocus
                />
                <p className="text-sm opacity-50 mt-2 uppercase tracking-widest">₽</p>
              </div>

              <div>
                <label className="block text-sm opacity-70 mb-2">Категория</label>
                <select
                  value={selectedCategoryId || ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                  className="w-full h-14 bg-zinc-900 border border-zinc-700 rounded-xl px-5 text-lg focus:outline-none focus:border-zinc-500 transition-colors"
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
                <label className="block text-sm opacity-70 mb-2">Комментарий</label>
                <Input
                  placeholder="Например: Зарплата февраль"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="h-14 bg-zinc-900 border-zinc-700 text-lg"
                />
              </div>

              <Button
                onClick={handleAdd}
                disabled={!amount}
                className="w-full h-16 text-xl font-black bg-white text-black rounded-2xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Добавить
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </main>
  );
}