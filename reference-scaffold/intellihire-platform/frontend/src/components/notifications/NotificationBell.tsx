import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { NotificationItem } from "@/types";

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  useEffect(() => {
    api.get("/notifications?pageSize=5").then((res) => setItems(res.data.data));
    const channel = supabase.channel("notifications").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => setItems((old) => [payload.new as NotificationItem, ...old].slice(0, 5))).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  const unread = items.filter((item) => !item.read).length;
  return (
    <div className="relative">
      <Button variant="ghost" aria-label="Notifications"><Bell className="h-5 w-5" />{unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}</Button>
      <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border bg-card p-2 shadow-lg">
        {items.map((item) => <Link key={item.id} to="/notifications" className="block rounded-md p-3 text-sm hover:bg-muted"><b>{item.title}</b><p className="text-muted-foreground">{item.message}</p></Link>)}
        <Link className="block p-2 text-center text-sm text-primary" to="/notifications">View all</Link>
      </div>
    </div>
  );
}

