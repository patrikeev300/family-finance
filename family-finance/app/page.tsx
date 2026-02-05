"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

export default function Home() {
  const [activeTab, setActiveTab] = useState("nastya");

  return (
    <main className="min-h-screen bg-background p-4 pb-20">
      <h1 className="text-2xl font-bold mb-6 text-center">Семейный Бюджет</h1>

      <Tabs defaultValue="nastya" onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 w-full fixed bottom-0 left-0 rounded-none border-t h-16 bg-card">
          <TabsTrigger value="nastya" className="text-xs">Настя</TabsTrigger>
          <TabsTrigger value="gleb" className="text-xs">Глеб</TabsTrigger>
          <TabsTrigger value="food" className="text-xs">Еда</TabsTrigger>
          <TabsTrigger value="wb" className="text-xs">ВБ</TabsTrigger>
          <TabsTrigger value="credits" className="text-xs">Кредиты</TabsTrigger>
        </TabsList>

        <TabsContent value="nastya">
          <Card className="p-4">
            <h2 className="text-xl font-semibold">Доходы / Расходы: Настя</h2>
            <div className="mt-4 text-3xl font-bold text-green-500">0 ₽</div>
            <p className="text-muted-foreground">Баланс за февраль</p>
          </Card>
        </TabsContent>

        <TabsContent value="gleb">
          <Card className="p-4">
            <h2 className="text-xl font-semibold">Доходы / Расходы: Глеб</h2>
            {/* Сюда добавим логику позже */}
          </Card>
        </TabsContent>

        {/* И так далее для всех вкладок... */}
      </Tabs>
    </main>
  );
}