"use client";

// Отключаем статическую генерацию, чтобы билд не падал без ключей
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo } from "react";
import { createClient } from '@supabase/supabase-js';

// 1. Инициализация Supabase прямо здесь
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

// UI Компоненты (используем @/ если настроено, или относительные пути)
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Plus, Wallet, ShoppingCart, CreditCard, User, ArrowUpCircle, ArrowDownCircle, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

const LEDGER_NAMES = ["Настя", "Глеб", "Еда", "ВБ", "Кредиты"];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("Настя");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Форма
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => { 
    if (typeof window !== "undefined") {
      initApp(); 
    }
  }, []);

  async function initApp() {
    try {
      if (!supabase) return;
      setLoading(true);

      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
      
      // Твой ID как основной, если открыто не в телеге
      const tgUser = tg?.initDataUnsafe?.user || { id: 464444608, first_name: "Глеб" };

      // 1. Профиль
      let { data: currProfile } = await supabase.from("profiles").select("*").eq("telegram_id", tgUser.id).maybeSingle();
      
      if (!currProfile) {
        // Создаем новую семью для первого пользователя
        const { data: family } = await supabase.from("families").insert({}).select().single();
        const { data: newProfile } = await supabase.from("profiles").insert({
          telegram_id: tgUser.id, 
          family_id: family.id, 
          display_name: tgUser.first_name
        }).select().single();
        currProfile = newProfile;
      }
      setProfile(currProfile);

      // 2. Леджеры (Страницы)
      let { data: currLedgers } = await supabase.from("ledgers").select("*").eq("family_id", currProfile?.family_id);
      
      if (!currLedgers || currLedgers.length === 0) {
        const { data: created } = await supabase.from("ledgers").insert(
          LEDGER_NAMES.map(n => ({ 
            family_id: currProfile?.family_id, 
            title: n, 
            type: n === "Кредиты" ? "credit" : "standard" 
          }))
        ).select();
        currLedgers = created;
      }
      setLedgers(currLedgers || []);

      if (currLedgers) {
        await refreshData(currLedgers.map((l: any) => l.id));
      }
    } catch (e) {
      console.error("Init Error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshData(ledgerIds: string[]) {
    const { data: tx } = await supabase.from("transactions").select("*").in("ledger_id", ledgerIds).order("created_at", { ascending: false });
    const { data: cr } = await supabase.from("credit_items").select("*").in("ledger_id", ledgerIds);
    setTransactions(tx || []);
    setCredits(cr || []);
  }

  const pageData = useMemo(() => {
    const currentLedger = ledgers.find((l: any) => l.title === activeTab);
    if (!currentLedger) return null;

    const filtered = transactions.filter((t: any) => t.ledger_id === currentLedger.id && t.created_at.startsWith(selectedMonth));
    
    const income = filtered.filter((t: any) => t.transaction_type === "income").reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    const expense = filtered.filter((t: any) => t.transaction_type === "expense").reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    
    const grouped: any[] = [];
    filtered.forEach((t: any) => {
      const existing = grouped.find((g: any) => g.name === t.comment && g.type === t.transaction_type);
      if (existing) existing.total += Number(t.amount);
      else grouped.push({ name: t.comment, total: Number(t.amount), type: t.transaction_type });
    });

    return { 
      ledger: currentLedger, 
      income, 
      expense, 
      balance: income - expense, 
      categories: grouped, 
      credits: credits.filter((c: any) => c.ledger_id === currentLedger.id) 
    };
  }, [activeTab, transactions, ledgers, selectedMonth, credits]);

  async function handleAdd() {
    if (!amount || !pageData?.ledger || !supabase) return;
    
    await supabase.from("transactions").insert({
      ledger_id: pageData.ledger.id,
      profile_id: profile.id,
      amount: parseFloat(amount),
      transaction_type: type,
      comment: category || "Общее",
      created_at: `${selectedMonth}-01T12:00:00Z`
    });
    
    setAmount(""); 
    setCategory(""); 
    setIsDrawerOpen(false);
    refreshData(ledgers.map((l: any) => l.id));
    
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  }

  async function deleteTx(catName: string, catType: string) {
    if (!confirm(`Удалить все записи "${catName}"?`)) return;
    await supabase.from("transactions")
      .delete()
      .eq("ledger_id", pageData?.ledger.id)
      .eq("comment", catName)
      .eq("transaction_type", catType);
    refreshData(ledgers.map((l: any) => l.id));
  }

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-black">
      <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin mb-4"></div>
      <p className="text-[10px] font-black tracking-[0.3em] uppercase opacity-50">Загрузка данных</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-36 selection:bg-white selection:text-black">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pt-2">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter leading-none">PNL FINANCE</h1>
          <p className="text-[9px] uppercase font-bold opacity-30 mt-1 tracking-wider">Family Accounting 1.0</p>
        </div>
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
          <Calendar size={12} className="opacity-40" />
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)} 
            className="bg-transparent text-[11px] font-black outline-none uppercase" 
          />
        </div>
      </div>

      {activeTab !== "Кредиты" ? (
        <>
          {/* Main Balance Card */}
          <Card className="p-8 border-none bg-gradient-to-br from-[#1a1a1a] to-black rounded-[2.5rem] shadow-2xl mb-8 border border-white/5">
            <p className="text-[10px] font-black opacity-30 uppercase mb-2 tracking-[0.2em]">{activeTab} / Текущий баланс</p>
            <h2 className="text-5xl font-black tracking-tighter">{(pageData?.balance || 0).toLocaleString()} <span className="text-xl opacity-40 font-normal">₽</span></h2>
            
            <div className="grid grid-cols-2 gap-4 mt-10">
              <div className="bg-green-500/5 p-4 rounded-[1.5rem] border border-green-500/10">
                <p className="text-[9px] font-black text-green-500/50 uppercase tracking-widest mb-1">Доходы</p>
                <p className="text-xl font-black text-green-400">+{pageData?.income.toLocaleString()}</p>
              </div>
              <div className="bg-red-500/5 p-4 rounded-[1.5rem] border border-red-500/10">
                <p className="text-[9px] font-black text-red-500/50 uppercase tracking-widest mb-1">Расходы</p>
                <p className="text-xl font-black text-red-400">-{pageData?.expense.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* Categories List */}
          <div className="space-y-4">
            <p className="text-[10px] font-black opacity-20 uppercase tracking-[0.3em] px-2">Детализация</p>
            {pageData?.categories.map((cat: any, i: number) => (
              <div key={i} className="flex justify-between items-center bg-[#0a0a0a] p-5 rounded-3xl border border-white/5 group active:scale-[0.98] transition-transform">
                <div className="flex flex-col">
                  <span className="font-black text-sm tracking-tight">{cat.name}</span>
                  <span className="text-[8px] opacity-30 uppercase font-black mt-0.5 tracking-tighter">{cat.type === 'income' ? 'Пополнение' : 'Списание'}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-black text-md tracking-tighter ${cat.type === 'income' ? 'text-green-500' : 'text-white'}`}>
                    {cat.type === 'income' ? '+' : ''}{cat.total.toLocaleString()} ₽
                  </span>
                  <button onClick={() => deleteTx(cat.name, cat.type)} className="h-10 w-10 flex items-center justify-center rounded-full bg-red-500/10 text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {pageData?.categories.length === 0 && (
                <div className="text-center py-20 opacity-10 font-black border-2 border-dashed border-white/10 rounded-[3rem] uppercase tracking-[0.3em] text-[10px]">Записей не найдено</div>
            )}
          </div>
        </>
      ) : (
        /* Credits UI */
        <div className="space-y-4">
          <p className="text-[10px] font-black opacity-20 uppercase tracking-[0.3em] px-2">Кредиты и Карты</p>
          {pageData?.credits.length === 0 ? (
              <div className="text-center py-20 opacity-10 font-black border-2 border-dashed border-white/10 rounded-[3rem] uppercase tracking-[0.3em] text-[10px]">Список пуст</div>
          ) : (
            pageData?.credits.map((c: any) => (
                <Card key={c.id} className="p-8 bg-[#0a0a0a] border-none border-l-4 border-l-white rounded-3xl">
                  <div className="flex justify-between items-start mb-4">
                    <p className="font-black opacity-20 text-[9px] uppercase tracking-widest">{c.item_type}</p>
                    {c.due_date && <span className="text-[9px] font-black bg-white/5 border border-white/10 px-3 py-1 rounded-full uppercase tracking-tighter">Платеж {c.due_date}</span>}
                  </div>
                  <h3 className="font-black text-2xl tracking-tighter uppercase italic">{c.name}</h3>
                  <div className="mt-6">
                    <p className="text-4xl font-black text-white tracking-tighter">{Number(c.total_debt).toLocaleString()} <span className="text-sm font-normal opacity-30">₽</span></p>
                  </div>
                </Card>
            ))
          )}
        </div>
      )}

      {/* Modern Bottom Navigation */}
      <div className="fixed bottom-10 left-4 right-4 z-50">
        <TabsList className="grid grid-cols-5 w-full h-20 bg-[#111]/90 backdrop-blur-3xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-[2.5rem] p-2">
          {LEDGER_NAMES.map(name => (
            <TabsTrigger 
              key={name} 
              value={name} 
              onClick={() => setActiveTab(name)} 
              className="data-[state=active]:bg-white data-[state=active]:text-black rounded-[1.8rem] text-[9px] font-black uppercase tracking-tighter transition-all duration-500"
            >
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* FAB */}
      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerTrigger asChild>
          <Button className="fixed bottom-32 right-8 w-18 h-18 rounded-full bg-white text-black shadow-2xl hover:scale-110 active:scale-90 transition-all z-40 p-0" style={{ width: '70px', height: '70px' }}>
            <Plus size={40} />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="bg-black border-t border-white/10 text-white pb-12 outline-none">
          <div className="mx-auto w-full max-w-md p-8">
            <DrawerHeader className="px-0 mb-8 text-center">
              <DrawerTitle className="font-black italic uppercase tracking-tighter text-4xl">Запись</DrawerTitle>
              <p className="text-[10px] uppercase font-bold opacity-30 tracking-widest mt-2">Раздел: {activeTab}</p>
            </DrawerHeader>
            <div className="space-y-8 mt-6">
              <div className="flex gap-2 bg-white/5 p-1.5 rounded-3xl">
                <Button variant={type === "expense" ? "default" : "ghost"} className={`flex-1 rounded-2xl font-black uppercase text-xs h-14 ${type === 'expense' ? 'bg-white text-black' : 'text-white/40'}`} onClick={() => setType("expense")}>Расход</Button>
                <Button variant={type === "income" ? "default" : "ghost"} className={`flex-1 rounded-2xl font-black uppercase text-xs h-14 ${type === 'income' ? 'bg-white text-black' : 'text-white/40'}`} onClick={() => setType("income")}>Доход</Button>
              </div>
              <div className="relative text-center">
                <input 
                  type="number" 
                  placeholder="0" 
                  value={amount} 
                  autoFocus
                  inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value)} 
                  className="w-full h-32 text-8xl text-center font-black bg-transparent border-none focus:ring-0 placeholder:text-white/5 outline-none tracking-tighter" 
                />
                <span className="block text-xs font-black opacity-20 uppercase tracking-[0.5em] mt-2">Российский рубль</span>
              </div>
              <Input 
                type="text" 
                placeholder="На что? (Продукты, ЗП, ВБ...)" 
                value={category} 
                onChange={(e) => setCategory(e.target.value)} 
                className="h-20 rounded-3xl bg-white/5 border-none px-8 font-black text-lg placeholder:text-white/10 text-center uppercase tracking-tight" 
              />
              <Button className="w-full h-20 text-xl font-black uppercase bg-white text-black rounded-3xl hover:bg-white/90 shadow-2xl transition-all" onClick={handleAdd}>Подтвердить</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}