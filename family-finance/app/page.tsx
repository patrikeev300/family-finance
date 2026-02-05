"use client";

import { useEffect, useState, useMemo } from "react";
// ИСПОЛЬЗУЕМ ОТНОСИТЕЛЬНЫЙ ПУТЬ
import { supabase } from "../lib/supabase"; 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { Plus, Wallet, ShoppingCart, CreditCard, User, ArrowUpCircle, ArrowDownCircle, Trash2, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "../components/ui/drawer";
import { Input } from "../components/ui/input";

const LEDGER_NAMES = ["Настя", "Глеб", "Еда", "ВБ", "Кредиты"];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("Настя");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => { initApp(); }, []);

  async function initApp() {
    try {
      setLoading(true);
      const tg = (window as any).Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user || { id: 12345, first_name: "Глеб" };

      let { data: currProfile } = await supabase.from("profiles").select("*").eq("telegram_id", tgUser.id).maybeSingle();
      
      if (!currProfile) {
        const { data: family } = await supabase.from("families").insert({}).select().single();
        const { data: newProfile } = await supabase.from("profiles").insert({
          telegram_id: tgUser.id, family_id: family.id, display_name: tgUser.first_name
        }).select().single();
        currProfile = newProfile;
      }
      setProfile(currProfile);

      let { data: currLedgers } = await supabase.from("ledgers").select("*").eq("family_id", currProfile?.family_id);
      if (!currLedgers || currLedgers.length === 0) {
        const { data: created } = await supabase.from("ledgers").insert(
          LEDGER_NAMES.map(n => ({ family_id: currProfile?.family_id, title: n, type: n === "Кредиты" ? "credit" : "standard" }))
        ).select();
        currLedgers = created;
      }
      setLedgers(currLedgers || []);
      await refreshData(currLedgers?.map(l => l.id) || []);
    } catch (e) {
      console.error(e);
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
    const currentLedger = ledgers.find(l => l.title === activeTab);
    if (!currentLedger) return null;
    const filtered = transactions.filter(t => t.ledger_id === currentLedger.id && t.created_at.startsWith(selectedMonth));
    const income = filtered.filter(t => t.transaction_type === "income").reduce((acc, t) => acc + Number(t.amount), 0);
    const expense = filtered.filter(t => t.transaction_type === "expense").reduce((acc, t) => acc + Number(t.amount), 0);
    const grouped: any[] = [];
    filtered.forEach(t => {
      const existing = grouped.find(g => g.name === t.comment && g.type === t.transaction_type);
      if (existing) existing.total += Number(t.amount);
      else grouped.push({ name: t.comment, total: Number(t.amount), type: t.transaction_type });
    });
    return { ledger: currentLedger, income, expense, balance: income - expense, categories: grouped, credits: credits.filter(c => c.ledger_id === currentLedger.id) };
  }, [activeTab, transactions, ledgers, selectedMonth, credits]);

  async function handleAdd() {
    if (!amount || !pageData?.ledger) return;
    await supabase.from("transactions").insert({
      ledger_id: pageData.ledger.id,
      profile_id: profile.id,
      amount: parseFloat(amount),
      transaction_type: type,
      comment: category || "Общее",
      created_at: `${selectedMonth}-01T12:00:00Z`
    });
    setAmount(""); setCategory(""); setIsDrawerOpen(false);
    refreshData(ledgers.map(l => l.id));
  }

  if (loading) return <div className="h-screen flex items-center justify-center font-bold bg-black text-white">ЗАГРУЗКА...</div>;

  return (
    <main className="min-h-screen bg-[#0f0f0f] text-white p-4 pb-32">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-black italic tracking-tighter text-white">PNL FINANCE</h1>
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-card border rounded-full px-3 py-1 text-xs font-bold" />
      </div>

      {activeTab !== "Кредиты" ? (
        <>
          <Card className="p-6 border-none bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] rounded-[2rem] mb-6">
            <p className="text-[10px] font-black opacity-40 uppercase mb-1">{activeTab}</p>
            <h2 className="text-4xl font-black">{(pageData?.balance || 0).toLocaleString()} ₽</h2>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="bg-green-500/10 p-3 rounded-2xl border border-green-500/20">
                <p className="text-[8px] font-bold text-green-500 uppercase">Доход</p>
                <p className="text-lg font-black">+{pageData?.income.toLocaleString()}</p>
              </div>
              <div className="bg-red-500/10 p-3 rounded-2xl border border-red-500/20">
                <p className="text-[8px] font-bold text-red-500 uppercase">Расход</p>
                <p className="text-lg font-black">-{pageData?.expense.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <div className="space-y-4">
            {pageData?.categories.map((cat, i) => (
              <div key={i} className="flex justify-between items-center bg-card p-4 rounded-2xl border">
                <span className="font-bold">{cat.name}</span>
                <span className={`font-black ${cat.type === 'income' ? 'text-green-500' : ''}`}>
                  {cat.type === 'income' ? '+' : ''}{cat.total.toLocaleString()} ₽
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {pageData?.credits.map(c => (
            <Card key={c.id} className="p-5 bg-card border-l-4 border-l-blue-500 rounded-2xl">
              <p className="font-bold opacity-50 text-xs uppercase">{c.item_type}</p>
              <h3 className="font-black text-xl">{c.name}</h3>
              <p className="text-2xl font-black mt-2 text-blue-400">{Number(c.total_debt).toLocaleString()} ₽</p>
            </Card>
          ))}
        </div>
      )}

      <TabsList className="grid grid-cols-5 w-[calc(100%-2rem)] fixed bottom-8 left-4 right-4 h-16 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl p-1">
        {LEDGER_NAMES.map(name => (
          <TabsTrigger key={name} value={name} onClick={() => setActiveTab(name)} className="data-[state=active]:bg-white data-[state=active]:text-black rounded-2xl text-[10px] font-black">
            {name}
          </TabsTrigger>
        ))}
      </TabsList>

      <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <DrawerTrigger asChild>
          <Button className="fixed bottom-28 right-6 w-16 h-16 rounded-full bg-white text-black" size="icon"><Plus size={32} /></Button>
        </DrawerTrigger>
        <DrawerContent className="bg-[#121212] border-none text-white">
          <div className="mx-auto w-full max-w-md p-6">
            <DrawerHeader><DrawerTitle className="font-black italic uppercase">Записать</DrawerTitle></DrawerHeader>
            <div className="space-y-4 mt-4">
              <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
                <Button variant={type === "expense" ? "default" : "ghost"} className="flex-1" onClick={() => setType("expense")}>Расход</Button>
                <Button variant={type === "income" ? "default" : "ghost"} className="flex-1" onClick={() => setType("income")}>Доход</Button>
              </div>
              <Input type="number" placeholder="0 ₽" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-20 text-4xl text-center font-black bg-transparent border-white/10" />
              <Input type="text" placeholder="Категория" value={category} onChange={(e) => setCategory(e.target.value)} className="h-14 rounded-2xl bg-white/5 border-none" />
              <Button className="w-full h-16 text-lg font-black bg-white text-black rounded-2xl" onClick={handleAdd}>Готово</Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}