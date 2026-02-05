"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Plus, Wallet, ShoppingCart, CreditCard, User, ArrowUpCircle, ArrowDownCircle, Trash2, Calendar, ChevronRight, CreditCard as CardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LEDGER_NAMES = ["Настя", "Глеб", "Еда", "ВБ", "Кредиты"];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("Настя");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // ГГГГ-ММ

  // Состояние формы
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => { initApp(); }, []);

  async function initApp() {
    setLoading(true);
    const tg = (window as any).Telegram?.WebApp;
    const tgUser = tg?.initDataUnsafe?.user || { id: 12345, first_name: "Глеб" };

    // 1. Профиль и семья
    let { data: currProfile } = await supabase.from("profiles").select("*").eq("telegram_id", tgUser.id).maybeSingle();
    if (!currProfile) {
      const { data: family } = await supabase.from("families").insert({}).select().single();
      const { data: newProfile } = await supabase.from("profiles").insert({
        telegram_id: tgUser.id, family_id: family.id, display_name: tgUser.first_name
      }).select().single();
      currProfile = newProfile;
    }
    setProfile(currProfile);

    // 2. Леджеры
    let { data: currLedgers } = await supabase.from("ledgers").select("*").eq("family_id", currProfile.family_id);
    if (!currLedgers || currLedgers.length === 0) {
      const { data: created } = await supabase.from("ledgers").insert(
        LEDGER_NAMES.map(n => ({ family_id: currProfile.family_id, title: n, type: n === "Кредиты" ? "credit" : "standard" }))
      ).select();
      currLedgers = created;
    }
    setLedgers(currLedgers || []);
    refreshData(currLedgers?.map(l => l.id) || []);
    setLoading(false);
  }

  async function refreshData(ledgerIds: string[]) {
    const { data: tx } = await supabase.from("transactions").select("*").in("ledger_id", ledgerIds).order("created_at", { ascending: false });
    const { data: cr } = await supabase.from("credit_items").select("*").in("ledger_id", ledgerIds);
    setTransactions(tx || []);
    setCredits(cr || []);
  }

  // Фильтрация и группировка данных
  const pageData = useMemo(() => {
    const currentLedger = ledgers.find(l => l.title === activeTab);
    if (!currentLedger) return null;

    const filtered = transactions.filter(t => 
      t.ledger_id === currentLedger.id && 
      t.created_at.startsWith(selectedMonth)
    );

    const incomeSum = filtered.filter(t => t.transaction_type === "income").reduce((acc, t) => acc + Number(t.amount), 0);
    const expenseSum = filtered.filter(t => t.transaction_type === "expense").reduce((acc, t) => acc + Number(t.amount), 0);

    // Группировка по категориям
    const grouped: Record<string, { name: string, total: number, type: string, items: any[] }> = {};
    filtered.forEach(t => {
      const key = `${t.transaction_type}-${t.comment}`;
      if (!grouped[key]) grouped[key] = { name: t.comment, total: 0, type: t.transaction_type, items: [] };
      grouped[key].total += Number(t.amount);
      grouped[key].items.push(t);
    });

    return {
      ledger: currentLedger,
      income: incomeSum,
      expense: expenseSum,
      balance: incomeSum - expenseSum,
      categories: Object.values(grouped),
      credits: credits.filter(c => c.ledger_id === currentLedger.id)
    };
  }, [activeTab, transactions, ledgers, selectedMonth, credits]);

  async function handleAdd() {
    if (!amount || !pageData?.ledger) return;
    await supabase.from("transactions").insert({
      ledger_id: pageData.ledger.id,
      profile_id: profile.id,
      amount: parseFloat(amount),
      transaction_type: type,
      comment: category || "Общее",
      created_at: `${selectedMonth}-01T12:00:00Z` // Записываем в выбранный месяц
    });
    setAmount(""); setCategory(""); setIsDrawerOpen(false);
    refreshData(ledgers.map(l => l.id));
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-bold">ЗАГРУЗКА...</div>;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white p-4 pb-32">
      {/* Header & Month Picker */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-black italic tracking-tighter text-primary">PNL FINANCE</h1>
        <div className="flex items-center gap-2 bg-card border px-3 py-1.5 rounded-full">
          <Calendar size={14} className="text-muted-foreground" />
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-bold outline-none"
          />
        </div>
      </div>

      {activeTab !== "Кредиты" ? (
        <>
          {/* Standard Page UI */}
          <Card className="p-6 border-none bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-[2.5rem] shadow-2xl mb-6">
            <p className="text-[10px] font-black opacity-40 uppercase tracking-widest mb-1">{activeTab} / Баланс</p>
            <h2 className="text-5xl font-black tracking-tighter mb-8">{(pageData?.balance || 0).toLocaleString()} ₽</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-3xl">
                <p className="text-[9px] font-bold text-green-500 uppercase mb-1">Пришло</p>
                <p className="text-xl font-black text-green-400">+{pageData?.income.toLocaleString()}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-3xl">
                <p className="text-[9px] font-bold text-red-500 uppercase mb-1">Ушло</p>
                <p className="text-xl font-black text-red-400">-{pageData?.expense.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* Categorized Body */}
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-bold opacity-40 uppercase px-2 mb-3">Доходы</h3>
              <div className="space-y-2">
                {pageData?.categories.filter(c => c.type === 'income').map((cat, i) => (
                  <div key={i} className="flex justify-between items-center bg-card p-4 rounded-2xl border">
                    <span className="font-bold">{cat.name}</span>
                    <span className="font-black text-green-500">+{cat.total.toLocaleString()} ₽</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold opacity-40 uppercase px-2 mb-3">Расходы</h3>
              <div className="space-y-2">
                {pageData?.categories.filter(c => c.type === 'expense').map((cat, i) => (
                  <div key={i} className="flex justify-between items-center bg-card p-4 rounded-2xl border">
                    <span className="font-bold">{cat.name}</span>
                    <span className="font-black text-white">{cat.total.toLocaleString()} ₽</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        /* Credits Page UI (Tab 5) */
        <div className="space-y-6">
           <section>
              <h3 className="text-xs font-bold opacity-40 uppercase px-2 mb-3">Кредиты</h3>
              {credits.filter(c => c.item_type === 'loan').map(c => (
                <Card key={c.id} className="p-5 mb-3 bg-card border-l-4 border-l-orange-500 rounded-2xl">
                   <div className="flex justify-between items-center">
                      <p className="font-bold">{c.name}</p>
                      <p className="text-xs opacity-50">До: {c.due_date}</p>
                   </div>
                   <p className="text-2xl font-black mt-2">{Number(c.total_debt).toLocaleString()} ₽</p>
                </Card>
              ))}
           </section>

           <section>
              <h3 className="text-xs font-bold opacity-40 uppercase px-2 mb-3">Кредитные карты</h3>
              {credits.filter(c => c.item_type === 'credit_card').map(c => (
                <Card key={c.id} className="p-5 mb-3 bg-card border-l-4 border-l-blue-500 rounded-2xl">
                   <div className="flex justify-between items-center mb-4">
                      <p className="font-bold">{c.name}</p>
                      <CardIcon size={16} className="opacity-30" />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] uppercase font-bold opacity-40">Задолженность</p>
                        <p className="text-lg font-black text-red-400">{Number(c.total_debt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold opacity-40">Лимит перевода</p>
                        <p className="text-lg font-black text-blue-400">{Number(c.transfer_limit).toLocaleString()}</p>
                      </div>
                   </div>
                </Card>
              ))}
           </section>
        </div>
      )}

      {/* Navigation */}
      <TabsList className="grid grid-cols-5 w-[calc(100%-2rem)] fixed bottom-8 left-4 right-4 h-16 bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-1">
        {LEDGER_NAMES.map(name => (
          <TabsTrigger key={name} value={name} onClick={() => setActiveTab(name)} className="data-[state=active]:bg-white data-[state=active]:text-black rounded-2xl text-[10px] font-black uppercase transition-all">
            {name}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* FAB and Add Drawer */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerTrigger asChild>
          <Button className="fixed bottom-28 right-6 w-16 h-16 rounded-full shadow-2xl bg-white text-black hover:bg-white/90" size="icon">
            <Plus size={32} />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="bg-[#121212] border-t-white/10">
          <div className="mx-auto w-full max-w-md p-6">
            <DrawerHeader className="px-0">
              <DrawerTitle className="text-2xl font-black uppercase italic">Новая запись</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
                <Button variant={type === "expense" ? "default" : "ghost"} className="flex-1 rounded-xl font-bold" onClick={() => setType("expense")}>Расход</Button>
                <Button variant={type === "income" ? "default" : "ghost"} className="flex-1 rounded-xl font-bold" onClick={() => setType("income")}>Доход</Button>
              </div>
              <Input type="number" placeholder="0.00 ₽" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-3xl h-20 text-center font-black bg-transparent border-white/10" />
              <Input type="text" placeholder="Категория (ЗП, Продукты...)" value={category} onChange={(e) => setCategory(e.target.value)} className="h-14 rounded-2xl bg-white/5 border-none" />
              <Button className="w-full h-16 text-lg font-black uppercase rounded-2xl bg-white text-black" onClick={handleAdd}>Записать</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}